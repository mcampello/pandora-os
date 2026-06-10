import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin, supabasePublic } from "@/lib/supabase-admin";
import { getValidToken, gFetch } from "@/lib/google";
import type { GoogleCredentials } from "@/lib/google";

// POST /api/sync/all
// Sincroniza WhatsApp, Gmail e Calendar para todos os contatos.
// Protegido por Authorization: Bearer {AGENT_SECRET}.
// Disparado pelo cron do VPS a cada 30 min.

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

type SyncDB = ReturnType<typeof supabaseAdmin>;

// ─── WhatsApp bulk sync ────────────────────────────────────────────────────────
async function syncWhatsApp(db: SyncDB): Promise<{ contacts_updated: number; errors: string[] }> {
  const publicDb = supabasePublic();
  const errors: string[] = [];

  // Lê todos os documentos de chats 1:1 em páginas
  const chats = new Map<string, { phone: string; counts: Map<string, number>; lastDate: string }>();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await publicDb
      .from("documents")
      .select("metadata")
      .like("metadata->>chatId", "%@s.whatsapp.net")
      .range(offset, offset + pageSize - 1);

    if (error) { errors.push(`wa_read: ${error.message}`); break; }
    if (!data || data.length === 0) break;

    for (const row of data as { metadata: { chatId?: string; senderName?: string; date?: string } }[]) {
      const chatId = row.metadata?.chatId;
      const name = (row.metadata?.senderName ?? "").trim();
      const date = row.metadata?.date ?? "";
      if (!chatId) continue;
      const phone = chatId.replace(/@.*$/, "").replace(/\D/g, "");
      if (!phone || phone.length < 8) continue;

      let entry = chats.get(chatId);
      if (!entry) { entry = { phone, counts: new Map(), lastDate: "" }; chats.set(chatId, entry); }
      if (name) entry.counts.set(name, (entry.counts.get(name) ?? 0) + 1);
      if (date > entry.lastDate) entry.lastDate = date;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Detecta nomes do owner (aparecem em >50% dos chats)
  const ownerNames = new Set<string>(["Mario Campello", "Campello"]);
  const presenceByName = new Map<string, number>();
  for (const { counts } of chats.values()) {
    for (const n of counts.keys()) presenceByName.set(n, (presenceByName.get(n) ?? 0) + 1);
  }
  const total = chats.size;
  for (const [name, presence] of presenceByName) {
    if (total > 1 && presence / total > 0.5) ownerNames.add(name);
  }

  let contacts_updated = 0;

  for (const [, info] of chats) {
    let bestName = "";
    let bestCount = 0;
    for (const [name, count] of info.counts) {
      if (ownerNames.has(name)) continue;
      if (count > bestCount) { bestName = name; bestCount = count; }
    }
    if (!bestName || !info.lastDate) continue;

    // Upsert contato
    const { data: existing } = await db.from("contacts").select("id").eq("phone", info.phone).maybeSingle();
    let contactId: string;

    if (existing) {
      contactId = existing.id;
    } else {
      const { data: created, error: insErr } = await db
        .from("contacts").insert({ name: bestName, phone: info.phone, source: "whatsapp" })
        .select("id").single();
      if (insErr) { errors.push(`wa_insert ${info.phone}: ${insErr.message}`); continue; }
      contactId = created!.id;
    }

    // Atualiza marker wa-sync (delete+insert para garantir o timestamp mais recente)
    const extId = `wa-sync-${info.phone}`;
    await db.from("interactions").delete().eq("contact_id", contactId).eq("external_id", extId);
    await db.from("interactions").insert({
      contact_id: contactId,
      channel: "whatsapp",
      type: "message_in",
      subject: "WhatsApp",
      external_id: extId,
      occurred_at: new Date(info.lastDate).toISOString(),
    });

    contacts_updated++;
  }

  return { contacts_updated, errors };
}

// ─── Gmail sync por contato ────────────────────────────────────────────────────
async function syncGmailForContact(
  db: SyncDB,
  contactId: string,
  email: string,
  token: string,
): Promise<{ created: number }> {
  const query = encodeURIComponent(`from:${email} OR to:${email}`);
  const data = await gFetch<{ threads?: { id: string; snippet: string }[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=30`,
    token,
  ).catch(() => null);
  if (!data?.threads) return { created: 0 };

  let created = 0;
  for (const thread of data.threads) {
    const { count } = await db
      .from("interactions").select("id", { count: "exact", head: true })
      .eq("external_id", `gmail_thread_${thread.id}`);
    if ((count ?? 0) > 0) continue;

    const msg = await gFetch<{
      id: string; internalDate: string;
      payload: { headers: { name: string; value: string }[] };
      snippet: string;
    }>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${thread.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`,
      token,
    ).catch(() => null);
    if (!msg) continue;

    const h = (name: string) =>
      msg.payload?.headers?.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? "";

    const subject = h("Subject") || "(sem assunto)";
    const from = h("From");
    const isInbound = from.toLowerCase().includes(email.toLowerCase());
    const occurred = msg.internalDate
      ? new Date(parseInt(msg.internalDate)).toISOString()
      : new Date().toISOString();

    await db.from("interactions").insert({
      contact_id: contactId,
      channel: "email",
      type: isInbound ? "email_in" : "email_out",
      subject,
      summary: thread.snippet?.slice(0, 500) || null,
      external_id: `gmail_thread_${thread.id}`,
      external_url: `https://mail.google.com/mail/u/0/#all/${thread.id}`,
      occurred_at: occurred,
    });
    created++;
  }
  return { created };
}

// ─── Calendar sync por contato ─────────────────────────────────────────────────
async function syncCalendarForContact(
  db: SyncDB,
  contactId: string,
  email: string,
  token: string,
): Promise<{ created: number; updated: number }> {
  const timeMin = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() +  60 * 24 * 60 * 60 * 1000).toISOString();

  type CalEvent = {
    id: string; summary?: string; description?: string; htmlLink: string;
    start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string };
    hangoutLink?: string; location?: string;
    attendees?: { email: string; displayName?: string; responseStatus?: string; organizer?: boolean }[];
    conferenceData?: { entryPoints?: { uri: string; entryPointType: string }[] };
  };

  const url = [
    `https://www.googleapis.com/calendar/v3/calendars/primary/events`,
    `?q=${encodeURIComponent(email)}`,
    `&timeMin=${encodeURIComponent(timeMin)}`,
    `&timeMax=${encodeURIComponent(timeMax)}`,
    `&singleEvents=true&orderBy=startTime&maxResults=100`,
  ].join("");

  const data = await gFetch<{ items?: CalEvent[] }>(url, token).catch(() => null);
  if (!data?.items) return { created: 0, updated: 0 };

  const relevant = data.items.filter((e) =>
    e.attendees?.some(
      (a) => a.email.toLowerCase() === email.toLowerCase() && a.responseStatus !== "declined",
    ),
  );

  let created = 0, updated = 0;

  for (const ev of relevant) {
    const startIso = ev.start.dateTime ?? ev.start.date ?? new Date().toISOString();
    const endIso   = ev.end.dateTime   ?? ev.end.date   ?? startIso;
    const durationMin = ev.start.dateTime && ev.end.dateTime
      ? Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000) : null;
    const meetUrl = ev.hangoutLink ??
      ev.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === "video")?.uri ?? null;
    const metadata = {
      attendees: (ev.attendees ?? []).map((a) => ({
        email: a.email, name: a.displayName ?? null, status: a.responseStatus, organizer: a.organizer ?? false,
      })),
      location: ev.location ?? null, duration_min: durationMin, meet_url: meetUrl,
      fathom_recording_id: null, fathom_url: null, fathom_summary: null,
    };

    const externalId = `gcal_${ev.id}`;
    const { data: existing } = await db.from("interactions").select("id").eq("external_id", externalId).maybeSingle();

    if (existing) {
      await db.from("interactions").update({ metadata }).eq("id", existing.id);
      updated++;
    } else {
      await db.from("interactions").insert({
        contact_id: contactId, channel: "gcalendar", type: "meeting",
        subject: ev.summary ?? "(sem título)", content: ev.description ?? null,
        occurred_at: startIso, external_id: externalId, external_url: ev.htmlLink, metadata,
      });
      created++;
    }
  }

  return { created, updated };
}

// ─── Handler principal ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin();
  const startedAt = Date.now();
  const report: Record<string, unknown> = {};

  // 1. WhatsApp
  try {
    report.whatsapp = await syncWhatsApp(db);
  } catch (e) {
    report.whatsapp = { error: String(e) };
  }

  // 2. Gmail
  const gmailConnector = await db
    .from("connectors").select("credentials")
    .eq("type", "gmail").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();

  if (gmailConnector.data) {
    try {
      const token = await getValidToken(gmailConnector.data.credentials as GoogleCredentials);
      const { data: contacts } = await db
        .from("contacts").select("id, email").not("email", "is", null).limit(200);

      let gmailCreated = 0;
      const gmailErrors: string[] = [];

      for (const c of contacts ?? []) {
        try {
          const r = await syncGmailForContact(db, c.id, c.email!, token);
          gmailCreated += r.created;
        } catch (e) {
          gmailErrors.push(`${c.email}: ${String(e)}`);
        }
      }

      await db.from("connectors").update({ last_sync_at: new Date().toISOString() })
        .eq("type", "gmail").eq("status", "connected");

      report.gmail = { contacts_scanned: contacts?.length ?? 0, created: gmailCreated, errors: gmailErrors };
    } catch (e) {
      report.gmail = { error: String(e) };
    }
  } else {
    report.gmail = { skipped: "conector não conectado" };
  }

  // 3. Google Calendar
  const calConnector = await db
    .from("connectors").select("credentials")
    .eq("type", "gcalendar").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();

  if (calConnector.data) {
    try {
      const token = await getValidToken(calConnector.data.credentials as GoogleCredentials);
      const { data: contacts } = await db
        .from("contacts").select("id, email").not("email", "is", null).limit(200);

      let calCreated = 0, calUpdated = 0;
      const calErrors: string[] = [];

      for (const c of contacts ?? []) {
        try {
          const r = await syncCalendarForContact(db, c.id, c.email!, token);
          calCreated += r.created;
          calUpdated += r.updated;
        } catch (e) {
          calErrors.push(`${c.email}: ${String(e)}`);
        }
      }

      await db.from("connectors").update({ last_sync_at: new Date().toISOString() })
        .eq("type", "gcalendar").eq("status", "connected");

      report.calendar = { contacts_scanned: contacts?.length ?? 0, created: calCreated, updated: calUpdated, errors: calErrors };
    } catch (e) {
      report.calendar = { error: String(e) };
    }
  } else {
    report.calendar = { skipped: "conector não conectado" };
  }

  report.duration_ms = Date.now() - startedAt;
  report.synced_at = new Date().toISOString();

  return NextResponse.json({ ok: true, ...report });
}
