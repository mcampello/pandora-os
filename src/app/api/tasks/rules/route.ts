import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const flagged = new URL(req.url).searchParams.get("flagged") === "true";

  let query = supabase.from("task_rules").select("*").order("created_at");

  if (flagged) {
    query = query
      .eq("metadata->>flagged_for_promotion", "true")
      .neq("source", "builtin");
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
