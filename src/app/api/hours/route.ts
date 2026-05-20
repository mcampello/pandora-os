import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  const month = searchParams.get("month"); // '2026-05-01' — filters date >= month AND date < next month

  let query = supabase.from("hours_entries").select("*").order("date", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (month) {
    const start = new Date(month);
    const end = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    query = query.gte("date", month).lt("date", end.toISOString().slice(0, 10));
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { client_id, date, hours } = body;

  if (!client_id) return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });
  if (!date) return NextResponse.json({ error: "date obrigatório" }, { status: 400 });
  if (!hours || hours <= 0) return NextResponse.json({ error: "hours deve ser positivo" }, { status: 400 });

  const payload: Record<string, unknown> = { client_id, date, hours: Number(hours) };
  if (body.description) payload.description = body.description;

  const { data, error } = await supabase
    .from("hours_entries")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
