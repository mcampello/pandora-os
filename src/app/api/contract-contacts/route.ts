import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contractId = req.nextUrl.searchParams.get("contract_id");
  if (!contractId) return NextResponse.json({ error: "contract_id obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("contract_contacts")
    .select("*, contact:contacts(id,name,email,phone,role)")
    .eq("contract_id", contractId)
    .order("created_at");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { contract_id, contact_id, role } = await req.json();
  if (!contract_id || !contact_id) {
    return NextResponse.json({ error: "contract_id e contact_id obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contract_contacts")
    .insert({ contract_id, contact_id, role: role ?? null })
    .select("*, contact:contacts(id,name,email,phone,role)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
