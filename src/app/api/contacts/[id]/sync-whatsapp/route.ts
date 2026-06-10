import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabasePublic } from "@/lib/supabase-admin";

// POST /api/contacts/[id]/sync-whatsapp
// Imports WhatsApp messages from public.documents as a single "conversation" interaction per day.
// Requires the contact to have a phone number saved.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts").select("id, name, phone").eq("id", id).single();
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!contact.phone) return NextResponse.json({ error: "contact has no phone" }, { status: 400 });

  // Normalize phone → JID format
  // Garante código do país 55 (Brasil): números sem ele teriam 10-11 dígitos
  let digits = contact.phone.replace(/\D/g, "");
  if (digits.length <= 11) digits = `55${digits}`;
  const jid = `${digits}@s.whatsapp.net`;

  // Fetch all documents for this chat (private conversation)
  const { data: docs } = await supabasePublic()
    .from("documents")
    .select("id, content, metadata")
    .eq("metadata->>chatId", jid)
    .order("id", { ascending: true });

  if (!docs || docs.length === 0) {
    return NextResponse.json({ synced: 0, message: "Nenhuma conversa encontrada para este número" });
  }

  // Group messages by day
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
        const meta = m.metadata as { senderName?: string; date?: string };
        return `[${meta.senderName ?? "?"}] ${m.content}`;
      })
      .join("\n");

    const occurred = new Date(date + "T12:00:00-03:00").toISOString();

    await supabase.from("interactions").insert({
      contact_id: id,
      channel: "whatsapp",
      type: "message_in",
      subject: `Conversa WhatsApp — ${new Date(date).toLocaleDateString("pt-BR")}`,
      content: content.slice(0, 4000),
      occurred_at: occurred,
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

  return NextResponse.json({
    synced: docs.length,
    days_imported: created,
    days_skipped: skipped,
    jid,
  });
}
