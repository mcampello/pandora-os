import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts").select("id, name, phone").eq("id", id).single();
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!contact.phone) return NextResponse.json({ messages: [] });

  const digits = contact.phone.replace(/\D/g, "");
  const jid = `${digits}@s.whatsapp.net`;

  // Read from relational table (webhook-ingested messages)
  const { data: rows, error } = await supabase
    .from("whatsapp_messages")
    .select("id, message_id, chat_id, from_me, sender_name, message_type, content, media_url, media_mime_type, media_duration, media_filename, media_caption, timestamp")
    .eq("chat_id", jid)
    .order("timestamp", { ascending: true })
    .limit(300);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if ((rows ?? []).length > 0) {
    const messages = rows!.map((row) => ({
      id: row.id as string,
      content: row.content ?? "",
      message_type: row.message_type as string,
      media_url: row.media_url ?? null,
      media_filename: row.media_filename ?? null,
      media_caption: row.media_caption ?? null,
      media_duration: row.media_duration ?? null,
      sender_name: row.sender_name ?? "",
      date: row.timestamp as string,
      direction: (row.from_me ? "outbound" : "inbound") as "inbound" | "outbound",
    }));
    return NextResponse.json({ messages, source: "relational" });
  }

  // Fallback: read from public.documents (N8N-ingested history)
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, content, metadata")
    .filter("metadata->>chatId", "eq", jid)
    .order("id", { ascending: true })
    .limit(300);

  if (docsError) return NextResponse.json({ error: docsError.message }, { status: 500 });

  const contactNameLower = contact.name.toLowerCase();
  const messages = (docs ?? []).map((doc) => {
    const meta = doc.metadata as Record<string, unknown>;
    const senderName = (meta.senderName as string | undefined) ?? "";
    const isInbound = senderName.toLowerCase() === contactNameLower;
    const blobType = (meta.blobType as string | undefined) ?? "text/plain";
    const kind: "text" | "image" | "url" =
      blobType.startsWith("image/") ? "image" : "text";
    return {
      id: String(doc.id),
      content: doc.content ?? "",
      kind,
      sender_name: senderName,
      date: (meta.date as string | undefined) ?? null,
      direction: (isInbound ? "inbound" : "outbound") as "inbound" | "outbound",
    };
  });

  return NextResponse.json({ messages, source: "documents" });
}
