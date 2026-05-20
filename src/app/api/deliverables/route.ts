import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  const month = searchParams.get("month"); // '2026-05-01'

  let query = supabase.from("deliverables").select("*").order("created_at");

  if (clientId) query = query.eq("client_id", clientId);
  if (month) query = query.eq("month", month);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { client_id, month, title } = body;

  if (!client_id) return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });
  if (!month) return NextResponse.json({ error: "month obrigatório" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "title obrigatório" }, { status: 400 });

  const payload: Record<string, unknown> = {
    client_id,
    month,
    title: title.trim(),
    done: body.done ?? false,
  };
  if (body.notes) payload.notes = body.notes;
  if (body.due_date) payload.due_date = body.due_date;

  const { data, error } = await supabase
    .from("deliverables")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
