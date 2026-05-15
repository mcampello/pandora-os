import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contact_id, title, description, channel, confidence } = body;

  if (!title || !channel || !confidence) {
    return NextResponse.json({ error: "title, channel e confidence são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase.from("opportunities").insert({
    contact_id: contact_id ?? null,
    title,
    description: description ?? null,
    channel,
    confidence,
    status: "new",
    detected_at: new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
