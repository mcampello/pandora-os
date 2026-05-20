import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateSalt, hashPassword } from "@/lib/portal-auth";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const opportunityId = searchParams.get("opportunity_id");

  let query = supabase.from("portals").select("id, slug, label, login_email, active, created_at, opportunity_id").order("created_at", { ascending: false });
  if (opportunityId) query = query.eq("opportunity_id", opportunityId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { opportunity_id, slug, label, login_email, password } = await req.json();
  if (!slug || !label || !login_email || !password)
    return NextResponse.json({ error: "slug, label, login_email e password são obrigatórios" }, { status: 400 });

  const salt = generateSalt();
  const password_hash = hashPassword(password, salt);

  const { data, error } = await supabase
    .from("portals")
    .insert({ opportunity_id, slug, label, login_email, password_hash, password_salt: salt })
    .select("id, slug, label, login_email, active, created_at, opportunity_id")
    .single();

  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "Slug já utilizado" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
