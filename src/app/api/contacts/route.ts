import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * GET /api/contacts?q=termo
 * Busca contatos por nome/email/empresa para seletores (ex: adicionar pessoa à oportunidade).
 */
export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const q = new URL(req.url).searchParams.get("q")?.trim();

  let query = supabase
    .from("contacts")
    .select("id, name, email, phone, company, role")
    .order("name", { ascending: true })
    .limit(20);

  if (q) {
    query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,company.ilike.%${q}%`);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
