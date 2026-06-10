import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { randomUUID } from "crypto";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data: company } = await supabase
    .from("companies")
    .select("id, cadastro_token")
    .eq("id", id)
    .single();

  if (!company) return NextResponse.json({ error: "empresa não encontrada" }, { status: 404 });

  let token = company.cadastro_token as string | null;
  if (!token) {
    token = randomUUID();
    await supabase.from("companies").update({ cadastro_token: token }).eq("id", id);
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://app.campello.me";
  return NextResponse.json({ token, url: `${baseUrl}/cadastro/${token}` });
}
