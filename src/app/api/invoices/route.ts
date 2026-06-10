import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const contractId = searchParams.get("contract_id");
  const companyId = searchParams.get("company_id");
  const clientId = searchParams.get("client_id");

  let query = supabase
    .from("invoices")
    .select("*")
    .order("month", { ascending: false });

  if (contractId) query = query.eq("contract_id", contractId);
  if (companyId) query = query.eq("company_id", companyId);
  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contract_id, company_id, client_id, month, number, amount, status, due_date, notes } = body;

  if (!month || amount == null) {
    return NextResponse.json({ error: "month e amount são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("invoices")
    .insert({
      contract_id: contract_id ?? null,
      company_id: company_id ?? null,
      client_id: client_id ?? null,
      month,
      number: number ?? null,
      amount,
      status: status ?? "pendente",
      due_date: due_date ?? null,
      notes: notes ?? null,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
