import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const clientId = new URL(req.url).searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("client_documents")
    .select("*")
    .eq("client_id", clientId)
    .order("uploaded_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("client_id") as string | null;
  const opportunityId = formData.get("opportunity_id") as string | null;

  if (!file || !clientId) return NextResponse.json({ error: "file e client_id obrigatórios" }, { status: 400 });

  const storagePath = `clients/${clientId}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from("client-documents")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage
    .from("client-documents")
    .getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("client_documents")
    .insert({
      client_id: clientId,
      opportunity_id: opportunityId || null,
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
