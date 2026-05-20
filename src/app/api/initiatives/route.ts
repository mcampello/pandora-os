import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");

  let query = supabase
    .from("initiatives")
    .select("*, tasks:initiative_tasks(*)")
    .order("created_at");

  if (clientId) query = query.eq("client_id", clientId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // sort tasks by sort_order within each initiative
  const result = (data ?? []).map(i => ({
    ...i,
    tasks: (i.tasks ?? []).sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
  }));

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { client_id, title } = body;

  if (!client_id) return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "title obrigatório" }, { status: 400 });

  const payload: Record<string, unknown> = {
    client_id,
    title: title.trim(),
    status: body.status ?? "backlog",
  };
  if (body.description) payload.description = body.description;
  if (body.priority) payload.priority = body.priority;
  if (body.start_date) payload.start_date = body.start_date;
  if (body.due_date) payload.due_date = body.due_date;

  const { data, error } = await supabase
    .from("initiatives")
    .insert(payload)
    .select("*, tasks:initiative_tasks(*)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ...data, tasks: [] }, { status: 201 });
}
