import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uaz } from "@/lib/uazapi";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const { data: c } = await supabase
    .from("connectors").select("*").eq("id", id).single();
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const token = (c.credentials as { instance_token?: string })?.instance_token;
  if (!token) return NextResponse.json({ error: "no_token" }, { status: 400 });

  try {
    const status = await uaz.status(token);
    const newStatus = status.instance.status === "connected" ? "connected" : "disconnected";
    if (newStatus !== c.status) {
      await supabase.from("connectors").update({
        status: newStatus,
        last_sync_at: new Date().toISOString(),
      }).eq("id", id);
    }
    return NextResponse.json(status);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
