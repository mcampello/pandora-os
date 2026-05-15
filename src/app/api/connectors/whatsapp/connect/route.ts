import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uaz } from "@/lib/uazapi";

// Inicia conexão (gera QR code) para uma instância já registrada
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { connector_id } = await req.json();
  const { data: c } = await supabase
    .from("connectors").select("*").eq("id", connector_id).single();
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = (c.credentials as { instance_token?: string })?.instance_token;
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 400 });

  const result = await uaz.connect(token);
  return NextResponse.json(result);
}
