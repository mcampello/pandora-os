import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { verifyPassword, PORTAL_COOKIE } from "@/lib/portal-auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // Use service-role to bypass RLS for public portal access
  const supabase = await supabaseServer();

  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "email e senha obrigatórios" }, { status: 400 });

  const { data: portal } = await supabase
    .from("portals")
    .select("id, login_email, password_hash, password_salt, active")
    .eq("slug", slug)
    .maybeSingle();

  if (!portal || !portal.active)
    return NextResponse.json({ error: "Portal não encontrado ou inativo" }, { status: 404 });

  if (portal.login_email.toLowerCase() !== email.toLowerCase())
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });

  if (!verifyPassword(password, portal.password_salt, portal.password_hash))
    return NextResponse.json({ error: "Credenciais inválidas" }, { status: 401 });

  // Criar sessão
  const { data: session } = await supabase
    .from("portal_sessions")
    .insert({ portal_id: portal.id })
    .select("token")
    .single();

  if (!session) return NextResponse.json({ error: "Erro ao criar sessão" }, { status: 500 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(PORTAL_COOKIE, session.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
  });
  return response;
}
