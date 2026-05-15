import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contact_id, subject, content, type, occurred_at } = body;

  if (!contact_id || !subject) {
    return NextResponse.json({ error: "contact_id e subject são obrigatórios" }, { status: 400 });
  }

  const { data, error } = await supabase.from("interactions").insert({
    contact_id,
    channel: "manual",
    type: type ?? "note",
    subject,
    content: content ?? null,
    occurred_at: occurred_at ?? new Date().toISOString(),
  }).select().single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
