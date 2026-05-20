import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { initiative_id, title } = body;

  if (!initiative_id) return NextResponse.json({ error: "initiative_id obrigatório" }, { status: 400 });
  if (!title?.trim()) return NextResponse.json({ error: "title obrigatório" }, { status: 400 });

  // get max sort_order for this initiative
  const { data: existing } = await supabase
    .from("initiative_tasks")
    .select("sort_order")
    .eq("initiative_id", initiative_id)
    .order("sort_order", { ascending: false })
    .limit(1);

  const nextOrder = existing?.[0]?.sort_order != null ? existing[0].sort_order + 1 : 0;

  const payload: Record<string, unknown> = {
    initiative_id,
    title: title.trim(),
    status: body.status ?? "todo",
    sort_order: nextOrder,
  };
  if (body.assignee) payload.assignee = body.assignee;
  if (body.due_date) payload.due_date = body.due_date;

  const { data, error } = await supabase
    .from("initiative_tasks")
    .insert(payload)
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
