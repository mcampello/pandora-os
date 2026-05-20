import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");

  let query = supabase
    .from("clients")
    .select("*")
    .order("company_name");

  if (status) {
    const statuses = status.split(",").map(s => s.trim());
    if (statuses.length === 1) {
      query = query.eq("status", statuses[0]);
    } else {
      query = query.in("status", statuses);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let result = data ?? [];
  if (q) {
    const lq = q.toLowerCase();
    result = result.filter(c => c.company_name.toLowerCase().includes(lq));
  }

  return NextResponse.json(result);
}
