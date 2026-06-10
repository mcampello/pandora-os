import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ rule_key: string }> }
) {
  const supabase = await supabaseServer();
  const { rule_key } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if ("active" in body) update.active = body.active;

  const { data, error } = await supabase
    .from("task_rules")
    .update(update)
    .eq("rule_key", rule_key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
