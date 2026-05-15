import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAllBookings, categoryFromSlug } from "@/lib/calcom";
import type { CalBooking } from "@/lib/calcom";

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: connector } = await supabase
    .from("connectors").select("credentials")
    .eq("type", "calcom").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();
  if (!connector) return NextResponse.json({ error: "Cal.com não conectado" }, { status: 400 });

  const apiKey = (connector.credentials as { api_key: string }).api_key;
  const bookings = await fetchAllBookings(apiKey);

  const stats = { contacts_created: 0, contacts_found: 0, interactions_created: 0, interactions_skipped: 0 };

  for (const booking of bookings) {
    if (booking.status === "cancelled" || booking.status === "rejected") continue;

    const attendees = (booking.attendees ?? []).filter(
      (a) => a.email && a.email !== "mario@campello.me"
    );

    for (const attendee of attendees) {
      await upsertBooking(supabase, booking, attendee, stats);
    }
  }

  await supabase.from("connectors").update({ last_sync_at: new Date().toISOString() })
    .eq("type", "calcom").eq("status", "connected");

  return NextResponse.json({ ...stats, total_bookings: bookings.length });
}

export async function upsertBooking(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  booking: CalBooking,
  attendee: { name: string; email: string },
  stats: Record<string, number>
) {
  const slug = booking.eventType?.slug ?? "";
  const category = categoryFromSlug(slug);

  // 1. Upsert contato pelo email
  const { data: existing } = await supabase
    .from("contacts").select("id, category")
    .eq("email", attendee.email).maybeSingle();

  let contactId: string;

  if (existing) {
    contactId = existing.id;
    stats.contacts_found++;
  } else {
    const { data: created } = await supabase.from("contacts").insert({
      name: attendee.name || attendee.email.split("@")[0],
      email: attendee.email,
      source: "calcom",
      category,
    }).select("id").single();
    contactId = created!.id;
    stats.contacts_created++;
  }

  // 2. Upsert interação (deduplicado por uid + email do attendee)
  const externalId = `calcom_${booking.uid}_${attendee.email}`;
  const { count } = await supabase
    .from("interactions").select("id", { count: "exact", head: true })
    .eq("external_id", externalId);

  if ((count ?? 0) > 0) {
    stats.interactions_skipped++;
    return;
  }

  const calcomBookingUrl = `https://app.cal.com/booking/${booking.uid}`;
  const isFuture = new Date(booking.start) > new Date();

  await supabase.from("interactions").insert({
    contact_id: contactId,
    channel: "calcom",
    type: isFuture ? "booking" : "meeting",
    subject: booking.title,
    content: booking.description ?? null,
    occurred_at: booking.start,
    external_id: externalId,
    external_url: calcomBookingUrl,
    metadata: {
      duration_min: booking.duration,
      event_type_slug: slug,
      event_type_id: booking.eventTypeId,
      status: booking.status,
      cal_uid: booking.uid,
      meet_url: null, // Google Meet URL gerado pelo Calendar — cruzar pelo horário
      fathom_recording_id: null,
      fathom_url: null,
      fathom_summary: null,
    },
  });

  stats.interactions_created++;
}
