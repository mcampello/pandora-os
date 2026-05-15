import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getValidToken, gFetch } from "@/lib/google";
import type { GoogleCredentials } from "@/lib/google";

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  status: string;
  htmlLink: string;
  start: { dateTime?: string; date?: string };
  end:   { dateTime?: string; date?: string };
  hangoutLink?: string;
  location?: string;
  attendees?: { email: string; displayName?: string; responseStatus?: string; organizer?: boolean }[];
  conferenceData?: {
    entryPoints?: { uri: string; entryPointType: string }[];
  };
}

interface CalendarListResponse {
  items?: CalendarEvent[];
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts").select("email, name, phone").eq("id", id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "contact has no email" }, { status: 400 });

  const { data: connector } = await supabase
    .from("connectors").select("credentials")
    .eq("type", "gcalendar").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();
  if (!connector) return NextResponse.json({ error: "Google Calendar não conectado" }, { status: 400 });

  const token = await getValidToken(connector.credentials as GoogleCredentials);

  // Janela: 6 meses atrás → 2 meses à frente
  const timeMin = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() +  60 * 24 * 60 * 60 * 1000).toISOString();

  const query = encodeURIComponent(contact.email);
  const url = [
    `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
    `?q=${query}`,
    `&timeMin=${encodeURIComponent(timeMin)}`,
    `&timeMax=${encodeURIComponent(timeMax)}`,
    `&singleEvents=true`,
    `&orderBy=startTime`,
    `&maxResults=100`,
  ].join("");

  const { items: events = [] } = await gFetch<CalendarListResponse>(url, token);

  // Filtra apenas eventos onde o contato é realmente participante (não só mencionado na descrição)
  const relevant = events.filter((e) => {
    if (!e.attendees || e.attendees.length === 0) return false;
    return e.attendees.some(
      (a) => a.email.toLowerCase() === contact.email!.toLowerCase() && a.responseStatus !== "declined"
    );
  });

  let created = 0;
  let updated = 0;

  for (const ev of relevant) {
    const startIso = ev.start.dateTime ?? ev.start.date ?? new Date().toISOString();
    const endIso   = ev.end.dateTime   ?? ev.end.date   ?? startIso;
    const isPast   = new Date(startIso) < new Date();

    const durationMin = ev.start.dateTime && ev.end.dateTime
      ? Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
      : null;

    const meetUrl =
      ev.hangoutLink ??
      ev.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ??
      null;

    const attendeeList = (ev.attendees ?? []).map((a) => ({
      email: a.email,
      name: a.displayName ?? null,
      status: a.responseStatus,
      organizer: a.organizer ?? false,
    }));

    const metadata = {
      attendees: attendeeList,
      location: ev.location ?? null,
      duration_min: durationMin,
      meet_url: meetUrl,
      // Reservados para quando Fathom for integrado:
      // Fathom cruza por: data + participantes + duração
      fathom_recording_id: null,
      fathom_url: null,
      fathom_summary: null,
    };

    const externalId = `gcal_${ev.id}`;

    const { data: existing } = await supabase
      .from("interactions").select("id, metadata")
      .eq("external_id", externalId).maybeSingle();

    if (existing) {
      // Atualiza metadata (pode ter mudado: novos participantes, link, etc.)
      await supabase.from("interactions").update({ metadata }).eq("id", existing.id);
      updated++;
    } else {
      await supabase.from("interactions").insert({
        contact_id: id,
        channel: "calcom",
        type: "meeting",
        subject: ev.summary ?? "(sem título)",
        content: ev.description ?? null,
        occurred_at: startIso,
        external_id: externalId,
        external_url: ev.htmlLink,
        metadata,
      });
      created++;
    }
  }

  return NextResponse.json({
    found: events.length,
    relevant: relevant.length,
    created,
    updated,
    note: isPast_count(relevant) > 0
      ? `${isPast_count(relevant)} reuniões passadas — aguardando integração Fathom para transcrições`
      : "Apenas reuniões futuras encontradas",
  });
}

function isPast_count(events: CalendarEvent[]): number {
  return events.filter((e) => new Date(e.start.dateTime ?? e.start.date ?? 0) < new Date()).length;
}
