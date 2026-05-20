import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: doc } = await supabase
    .from("client_documents")
    .select("file_url")
    .eq("id", id)
    .maybeSingle();

  if (doc?.file_url) {
    const path = doc.file_url.split("/client-documents/")[1];
    if (path) await supabase.storage.from("client-documents").remove([path]);
  }

  const { error } = await supabase.from("client_documents").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
