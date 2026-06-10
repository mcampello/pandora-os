import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const PUBLIC_FIELDS = "id, name, cnpj, website, address_street, address_number, address_complement, address_city, address_state, address_zip";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = supabaseAdmin();

  const { data, error } = await supabase
    .from("companies")
    .select(PUBLIC_FIELDS)
    .eq("cadastro_token", token)
    .single();

  if (error || !data) return NextResponse.json({ error: "link inválido" }, { status: 404 });
  return NextResponse.json(data);
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = supabaseAdmin();

  const { data: company } = await supabase
    .from("companies")
    .select("id")
    .eq("cadastro_token", token)
    .single();

  if (!company) return NextResponse.json({ error: "link inválido" }, { status: 404 });

  const body = await req.json();
  const allowed = ["name", "cnpj", "website", "address_street", "address_number", "address_complement", "address_city", "address_state", "address_zip"];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key] || null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nenhum campo enviado" }, { status: 400 });
  }

  const { error } = await supabase.from("companies").update(update).eq("id", company.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
