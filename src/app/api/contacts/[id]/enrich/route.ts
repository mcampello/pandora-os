import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabasePublic } from "@/lib/supabase-admin";
import { fetchAllBookings } from "@/lib/calcom";
import { upsertBooking } from "@/app/api/connectors/calcom/sync/route";

// POST /api/contacts/[id]/enrich
// Enriches a contact with data from all connected sources (Cal.com, WhatsApp).
// Called automatically when email or phone is saved on a contact.
// Gmail and Calendar syncs are called separately by the frontend.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts").select("id, email, phone").eq("id", id).single();
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  const results: Record<string, unknown> = {};
  const tasks: Promise<void>[] = [];

  if (contact.email) {
    tasks.push(enrichCalcom(supabase, id, contact.email)
      .then(d => { results.calcom = d; })
      .catch(e => { results.calcom = { error: String(e) }; })
    );
  }

  if (contact.phone) {
    tasks.push(enrichWhatsapp(supabase, id, contact.phone)
      .then(d => { results.whatsapp = d; })
      .catch(e => { results.whatsapp = { error: String(e) }; })
    );
  }

  await Promise.all(tasks);

  return NextResponse.json({ ok: true, results });
}

async function enrichCalcom(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  contactId: string,
  email: string
) {
  const { data: connector } = await supabase
    .from("connectors").select("credentials")
    .eq("type", "calcom").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();

  if (!connector) return { skipped: "Cal.com não conectado" };

  const apiKey = (connector.credentials as { api_key: string }).api_key;
  const bookings = await fetchAllBookings(apiKey);
  const stats = { contacts_created: 0, contacts_found: 0, interactions_created: 0, interactions_skipped: 0 };

  for (const booking of bookings) {
    if (booking.status === "cancelled" || booking.status === "rejected") continue;
    const attendee = (booking.attendees ?? []).find((a) => a.email === email);
    if (!attendee) continue;
    await upsertBooking(supabase, booking, attendee, stats);
  }

  return stats;
}

async function enrichWhatsapp(
  supabase: Awaited<ReturnType<typeof supabaseServer>>,
  contactId: string,
  phone: string
) {
  const digits = phone.replace(/\D/g, "");
  const jid = `${digits}@s.whatsapp.net`;

  const { data: docs } = await supabasePublic()
    .from("documents")
    .select("id, content, metadata")
    .eq("metadata->>chatId", jid)
    .order("id", { ascending: true });

  if (!docs || docs.length === 0) return { synced: 0 };

  // Group by day
  const byDay = new Map<string, typeof docs>();
  for (const doc of docs) {
    const date = (doc.metadata as { date?: string }).date?.slice(0, 10) ?? "unknown";
    if (!byDay.has(date)) byDay.set(date, []);
    byDay.get(date)!.push(doc);
  }

  let created = 0;
  let skipped = 0;

  for (const [date, messages] of byDay.entries()) {
    const externalId = `wa_${digits}_${date}`;

    const { count } = await supabase
      .from("interactions").select("id", { count: "exact", head: true })
      .eq("external_id", externalId);

    if ((count ?? 0) > 0) { skipped++; continue; }

    const content = messages
      .map((m) => {
        const meta = m.metadata as { senderName?: string };
        return `[${meta.senderName ?? "?"}] ${m.content}`;
      })
      .join("\n");

    await supabase.from("interactions").insert({
      contact_id: contactId,
      channel: "whatsapp",
      type: "message_in",
      subject: `Conversa WhatsApp — ${new Date(date).toLocaleDateString("pt-BR")}`,
      content: content.slice(0, 4000),
      occurred_at: new Date(date + "T12:00:00-03:00").toISOString(),
      external_id: externalId,
      metadata: {
        message_count: messages.length,
        jid,
        first_doc_id: messages[0].id,
        last_doc_id: messages[messages.length - 1].id,
      },
    });

    created++;
  }

  return { synced: docs.length, days_imported: created, days_skipped: skipped };
}
