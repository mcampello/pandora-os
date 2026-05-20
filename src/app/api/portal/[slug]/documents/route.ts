import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Admin only — list and upload documents
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: portal } = await supabase.from("portals").select("id").eq("slug", slug).maybeSingle();
  if (!portal) return NextResponse.json({ error: "portal não encontrado" }, { status: 404 });

  const { data, error } = await supabase
    .from("portal_documents")
    .select("*")
    .eq("portal_id", portal.id)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: portal } = await supabase.from("portals").select("id").eq("slug", slug).maybeSingle();
  if (!portal) return NextResponse.json({ error: "portal não encontrado" }, { status: 404 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "file obrigatório" }, { status: 400 });

  const ext = file.name.split(".").pop();
  const storagePath = `portals/${portal.id}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { data: uploaded, error: uploadError } = await supabase.storage
    .from("portal-documents")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage
    .from("portal-documents")
    .getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("portal_documents")
    .insert({
      portal_id: portal.id,
      name: file.name,
      file_url: publicUrl,
      size_bytes: file.size,
      mime_type: file.type,
    })
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
  const docId = searchParams.get("id");
  if (!docId) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const { error } = await supabase.from("portal_documents").delete().eq("id", docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
