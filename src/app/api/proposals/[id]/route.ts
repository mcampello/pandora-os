import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const SELECT = "*, client:clients(id,company_name,status), opportunity:opportunities(id,title,status)";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Usa anon key para suportar acesso público (viewer)
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("proposals")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { id } = await params;
  const body = await req.json();

  // Permite marcar viewed_at sem autenticação (chamado pelo viewer público)
  const isMarkView = Object.keys(body).length === 1 && "viewed_at" in body;

  if (!user && !isMarkView) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("proposals")
    .select("id, status, sent_at, viewed_at, responded_at")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) patch.title = body.title;
  if (body.content_md !== undefined) patch.content_md = body.content_md || null;
  if (body.value !== undefined) patch.value = body.value ?? null;
  if (body.client_id !== undefined) patch.client_id = body.client_id || null;
  if (body.opportunity_id !== undefined) patch.opportunity_id = body.opportunity_id || null;

  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "sent" && !existing.sent_at) patch.sent_at = new Date().toISOString();
    if ((body.status === "accepted" || body.status === "rejected") && !existing.responded_at) {
      patch.responded_at = new Date().toISOString();
    }
  }

  // Viewer público marca visualização
  if (body.viewed_at !== undefined && !existing.viewed_at) {
    patch.viewed_at = new Date().toISOString();
    if (existing.status === "sent") patch.status = "viewed";
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nenhum campo para atualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("proposals")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from("proposals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
