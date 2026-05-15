import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uaz } from "@/lib/uazapi";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  // Verifica instância no uazapi
  let status;
  try {
    status = await uaz.status(token);
  } catch (e) {
    return NextResponse.json({ error: "invalid_token", details: String(e) }, { status: 400 });
  }

  const inst = status.instance;
  const label = inst.profileName || inst.owner || inst.name || "WhatsApp";

  // Salva no banco
  const credentials = { instance_token: token, instance_id: inst.id };
  const metadata = {
    instance_id: inst.id,
    name: inst.name,
    profile_name: inst.profileName,
    profile_pic: inst.profilePicUrl,
    is_business: inst.isBusiness,
    owner: inst.owner,
    platform: inst.plataform,
  };

  const { data: existing } = await supabase
    .from("connectors")
    .select("id")
    .eq("type", "whatsapp")
    .eq("label", label)
    .maybeSingle();

  if (existing) {
    await supabase.from("connectors").update({
      status: inst.status === "connected" ? "connected" : "disconnected",
      credentials, metadata,
      error_message: null,
      last_sync_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await supabase.from("connectors").insert({
      type: "whatsapp", label,
      status: inst.status === "connected" ? "connected" : "disconnected",
      credentials, metadata,
      last_sync_at: new Date().toISOString(),
    });
  }


  return NextResponse.json({ ok: true, instance: inst });
}
