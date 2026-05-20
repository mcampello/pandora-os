import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { PORTAL_COOKIE } from "@/lib/portal-auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value;
  if (token) {
    const supabase = await supabaseServer();
    await supabase.from("portal_sessions").delete().eq("token", token);
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(PORTAL_COOKIE);
  return response;
}
