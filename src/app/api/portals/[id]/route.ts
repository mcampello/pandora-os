import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateSalt, hashPassword } from "@/lib/portal-auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if ("label" in body)       patch.label       = body.label;
  if ("login_email" in body) patch.login_email = body.login_email;
  if ("active" in body)      patch.active      = body.active;
  if ("password" in body && body.password) {
    const salt = generateSalt();
    patch.password_salt = salt;
    patch.password_hash = hashPassword(body.password, salt);
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "nenhum campo para atualizar" }, { status: 400 });

  const { data, error } = await supabase
    .from("portals")
    .update(patch)
    .eq("id", id)
    .select("id, slug, label, login_email, active, created_at, opportunity_id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase.from("portals").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
