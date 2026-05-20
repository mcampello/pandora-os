import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const { data, error } = await supabase
    .from("contacts")
    .select("company")
    .not("company", "is", null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const counts: Record<string, number> = {};
  for (const c of data ?? []) {
    const name = c.company?.trim();
    if (name) counts[name] = (counts[name] ?? 0) + 1;
  }

  let result = Object.entries(counts)
    .map(([name, contact_count]) => ({ name, contact_count }))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  if (q) {
    const lq = q.toLowerCase();
    result = result.filter(c => c.name.toLowerCase().includes(lq));
  }

  return NextResponse.json(result);
}
