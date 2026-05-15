import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export interface MergeSuggestion {
  a: { id: string; name: string; email: string | null; phone: string | null; source: string };
  b: { id: string; name: string; email: string | null; phone: string | null; source: string };
  score: number;
  reason: string;
}

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Find pairs: same email from different sources
  const { data: emailPairs } = await supabase.rpc("find_duplicate_contacts_by_email") as { data: MergeSuggestion[] | null };

  // Find pairs: similar names from different sources (pg_trgm)
  const { data: namePairs } = await supabase.rpc("find_duplicate_contacts_by_name") as { data: MergeSuggestion[] | null };

  const seen = new Set<string>();
  const suggestions: MergeSuggestion[] = [];

  for (const pair of [...(emailPairs ?? []), ...(namePairs ?? [])]) {
    const key = [pair.a.id, pair.b.id].sort().join(":");
    if (!seen.has(key)) {
      seen.add(key);
      suggestions.push(pair);
    }
  }

  suggestions.sort((a, b) => b.score - a.score);

  return NextResponse.json({ suggestions });
}
