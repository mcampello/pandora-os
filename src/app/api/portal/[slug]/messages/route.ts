import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Admin only — post a message to the portal
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { content } = await req.json();
  if (!content?.trim()) return NextResponse.json({ error: "content obrigatório" }, { status: 400 });

  const { data: portal } = await supabase
    .from("portals")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!portal) return NextResponse.json({ error: "portal não encontrado" }, { status: 404 });

  const { data, error } = await supabase
    .from("portal_messages")
    .insert({ portal_id: portal.id, content: content.trim() })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const messageId = searchParams.get("id");
  if (!messageId) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from("portal_messages").delete().eq("id", messageId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
