import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * POST /api/opportunities/[id]/comments
 * Adiciona um comentário de acompanhamento à oportunidade. Vira uma interação
 * (channel=manual, type=note) ligada à oportunidade — aparece na timeline e
 * entra no contexto da qualificação por IA.
 * Body: { content: string, contact_id?: string }
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const content = (body.content ?? "").trim();
  if (!content) return NextResponse.json({ error: "content obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("interactions")
    .insert({
      opportunity_id: id,
      contact_id: body.contact_id || null,
      channel: "manual",
      type: "note",
      subject: "Acompanhamento",
      content,
      occurred_at: new Date().toISOString(),
    })
    .select("id, contact_id, opportunity_id, channel, type, subject, summary, content, occurred_at, external_url, metadata, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
