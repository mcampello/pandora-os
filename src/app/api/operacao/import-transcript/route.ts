import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as {
    client_id: string;
    content: string;
    title?: string;
    occurred_at?: string;
    source?: string;
  };

  const { client_id, content, title, occurred_at, source } = body;
  if (!client_id || !content?.trim()) {
    return NextResponse.json({ error: "client_id e content são obrigatórios" }, { status: 400 });
  }

  // Resolve contact_id from the client
  const { data: client } = await supabase
    .from("clients")
    .select("contact_id")
    .eq("id", client_id)
    .maybeSingle();

  if (!client?.contact_id) {
    return NextResponse.json({ error: "Cliente sem contato associado" }, { status: 422 });
  }

  const { data, error } = await supabase
    .from("interactions")
    .insert({
      contact_id: client.contact_id,
      channel: "manual",
      type: "meeting",
      subject: title ?? "Transcrição importada",
      content,
      occurred_at: occurred_at ?? new Date().toISOString(),
      metadata: {
        source: source ?? "manual",
        imported_at: new Date().toISOString(),
        imported_by: "manual",
        client_id,
      },
    })
    .select("id, subject, content, occurred_at, external_url, metadata, channel, type")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
