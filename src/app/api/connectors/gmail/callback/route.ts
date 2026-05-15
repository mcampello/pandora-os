import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const APP = "https://app.campello.me";
const SETTINGS = `${APP}/configuracoes/conectores`;

export async function GET(request: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", APP));

  const code  = request.nextUrl.searchParams.get("code");
  const error = request.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${SETTINGS}?error=${encodeURIComponent(error || "no_code")}`);
  }

  // Troca code por tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  const tokens = await tokenRes.json();
  if (!tokenRes.ok) {
    return NextResponse.redirect(`${SETTINGS}?error=${encodeURIComponent(tokens.error || "token_exchange_failed")}`);
  }

  // Busca info do usuário Gmail
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = await userInfoRes.json();
  const email = userInfo.email as string;

  if (!email) {
    return NextResponse.redirect(`${SETTINGS}?error=no_email`);
  }

  // Salva/atualiza conector no banco
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

  const { data: existing } = await supabase
    .from("connectors")
    .select("id, credentials")
    .eq("type", "gmail")
    .eq("label", email)
    .maybeSingle();

  const credentials = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? (existing?.credentials as { refresh_token?: string })?.refresh_token,
    expires_at: expiresAt,
    scope: tokens.scope,
    token_type: tokens.token_type,
  };

  if (existing) {
    await supabase.from("connectors").update({
      status: "connected",
      credentials,
      metadata: { email, name: userInfo.name, picture: userInfo.picture },
      error_message: null,
      last_sync_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await supabase.from("connectors").insert({
      type: "gmail",
      label: email,
      status: "connected",
      credentials,
      metadata: { email, name: userInfo.name, picture: userInfo.picture },
      last_sync_at: new Date().toISOString(),
    });
  }

  return NextResponse.redirect(`${SETTINGS}?connected=${encodeURIComponent(email)}`);
}
