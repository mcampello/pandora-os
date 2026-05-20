import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });

  // resolve contact_id from the client
  const { data: client } = await supabase
    .from("clients")
    .select("contact_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client?.contact_id) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("interactions")
    .select("id, subject, content, occurred_at, external_url, metadata")
    .eq("contact_id", client.contact_id)
    .eq("channel", "fathom")
    .order("occurred_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
