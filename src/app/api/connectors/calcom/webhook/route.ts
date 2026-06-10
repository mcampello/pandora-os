import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { categoryFromSlug } from "@/lib/calcom";
import type { CalBooking } from "@/lib/calcom";
import { upsertTask } from "@/lib/tasks";

// Cal.com webhook — sem secret por enquanto
// Payload ref: https://cal.com/docs/core-features/webhooks#webhook-triggers

export async function POST(req: NextRequest) {
  let body: { triggerEvent: string; payload: CalBooking & { organizer?: { email: string } } };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const { triggerEvent, payload } = body;
  if (!triggerEvent || !payload) return NextResponse.json({ ok: true }); // ignora pings

  const supabase = supabaseAdmin();

  // Só processa bookings novos e reagendamentos
  if (!["BOOKING_CREATED", "BOOKING_RESCHEDULED"].includes(triggerEvent)) {
    // Para BOOKING_CANCELLED: marca interação como cancelada
    if (triggerEvent === "BOOKING_CANCELLED" && payload.uid) {
      await supabase.from("interactions")
        .update({ metadata: { status: "cancelled" } })
        .like("external_id", `calcom_${payload.uid}_%`);
    }
    return NextResponse.json({ ok: true });
  }

  const slug = payload.eventType?.slug ?? "";
  const category = categoryFromSlug(slug);
  const stats = { contacts_created: 0, contacts_found: 0, interactions_created: 0, interactions_skipped: 0 };

  const attendees = (payload.attendees ?? []).filter(
    (a) => a.email !== (payload.organizer?.email ?? "mario@campello.me")
  );

  for (const attendee of attendees) {
    const { data: existing } = await supabase
      .from("contacts").select("id")
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

    const externalId = `calcom_${payload.uid}_${attendee.email}`;
    const { count } = await supabase
      .from("interactions").select("id", { count: "exact", head: true })
      .eq("external_id", externalId);

    if ((count ?? 0) === 0) {
      const isFuture = new Date(payload.start) > new Date();
      await supabase.from("interactions").insert({
        contact_id: contactId,
        channel: "calcom",
        type: isFuture ? "booking" : "meeting",
        subject: payload.title,
        content: payload.description ?? null,
        occurred_at: payload.start,
        external_id: externalId,
        external_url: `https://app.cal.com/booking/${payload.uid}`,
        metadata: {
          duration_min: payload.duration,
          event_type_slug: slug,
          event_type_id: payload.eventTypeId,
          status: payload.status,
          cal_uid: payload.uid,
          meet_url: null,
          fathom_recording_id: null,
          fathom_url: null,
          fathom_summary: null,
        },
      });
      stats.interactions_created++;

      // Tarefa: preparar para a reunião (só se for futura)
      if (isFuture) {
        await upsertTask(supabase, {
          title: `Preparar para reunião com ${attendee.name || attendee.email} — ${payload.title}`,
          priority: "medium",
          source: "rule",
          entity_type: "contact",
          entity_id: contactId,
          dedup_key: `calcom_prep_${payload.uid}`,
        });
      }
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
