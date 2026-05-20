import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// POST /api/proposals/import-pdf
// Faz upload de um PDF e cria uma proposta com viewer_url apontando para o arquivo.
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const clientId = formData.get("client_id") as string | null;
  const opportunityId = formData.get("opportunity_id") as string | null;
  const customTitle = formData.get("title") as string | null;

  if (!file) return NextResponse.json({ error: "file obrigatório" }, { status: 400 });
  if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
    return NextResponse.json({ error: "Apenas arquivos PDF são aceitos" }, { status: 400 });
  }

  const title = customTitle?.trim() || file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
  const safeName = `${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
  const storagePath = clientId
    ? `proposals/${clientId}/${safeName}`
    : `proposals/oportunidade/${opportunityId ?? "sem-cliente"}/${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabase.storage
    .from("client-documents")
    .upload(storagePath, buffer, { contentType: "application/pdf", upsert: false });

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: { publicUrl } } = supabase.storage
    .from("client-documents")
    .getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from("proposals")
    .insert({
      title,
      client_id: clientId ?? null,
      opportunity_id: opportunityId ?? null,
      viewer_url: publicUrl,
      status: "sent",
      content_md: null,
      value: null,
    })
    .select("*, client:clients(id,company_name,status), opportunity:opportunities(id,title,status)")
    .single();

  if (error) {
    await supabase.storage.from("client-documents").remove([storagePath]);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
