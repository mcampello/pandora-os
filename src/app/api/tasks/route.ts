import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { TaskPriority, TaskSource, TaskEntityType } from "@/lib/tasks";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { searchParams } = new URL(req.url);

  const status    = searchParams.get("status");
  const priority  = searchParams.get("priority");
  const entity_type = searchParams.get("entity_type");
  const entity_id = searchParams.get("entity_id");
  const limit     = parseInt(searchParams.get("limit") ?? "200");

  let query = supabase
    .from("tasks")
    .select("*")
    .order("priority", { ascending: true }) // critical < high < medium < low alphabetically won't work — use custom
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status)      query = query.eq("status", status);
  if (priority)    query = query.eq("priority", priority);
  if (entity_type) query = query.eq("entity_type", entity_type);
  if (entity_id)   query = query.eq("entity_id", entity_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sort by priority order since Postgres alphabetical order doesn't match criticality
  const ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = (data ?? []).sort((a, b) => {
    const diff = (ORDER[a.priority] ?? 9) - (ORDER[b.priority] ?? 9);
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return NextResponse.json(sorted);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const body = await req.json();

  const { title, priority, source, rule_key, entity_type, entity_id, ai_reasoning, due_at, dedup_key } = body;

  if (!title || !priority) {
    return NextResponse.json({ error: "title e priority são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title,
      priority: priority as TaskPriority,
      source: (source ?? "manual") as TaskSource,
      rule_key: rule_key ?? null,
      entity_type: (entity_type ?? null) as TaskEntityType | null,
      entity_id: entity_id ?? null,
      ai_reasoning: ai_reasoning ?? null,
      due_at: due_at ?? null,
      dedup_key: dedup_key ?? `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
