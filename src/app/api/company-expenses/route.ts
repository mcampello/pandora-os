import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const onlyActive = req.nextUrl.searchParams.get("active");

  let query = supabase
    .from("company_expenses")
    .select("*")
    .order("name");

  if (onlyActive === "true") query = query.eq("active", true);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, category, amount, currency, recurrence, notes, active } = body;

  if (!name || amount == null) {
    return NextResponse.json({ error: "name e amount são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("company_expenses")
    .insert({
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
