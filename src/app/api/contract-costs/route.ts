import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contractId = req.nextUrl.searchParams.get("contract_id");

  let query = supabase
    .from("contract_costs")
    .select("*")
    .order("name");

  if (contractId) query = query.eq("contract_id", contractId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contract_id, name, category, amount, currency, recurrence, notes, active } = body;

  if (!contract_id || !name || amount == null) {
    return NextResponse.json({ error: "contract_id, name e amount são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contract_costs")
    .insert({
      contract_id,
      name,
      category: category ?? null,
      amount,
      currency: currency ?? "BRL",
      recurrence: recurrence ?? "mensal",
      notes: notes ?? null,
      active: active ?? true,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
