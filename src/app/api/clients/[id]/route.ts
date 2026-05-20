import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const patch: Record<string, unknown> = {};

  if (body.company_name !== undefined) patch.company_name = body.company_name;
  if (body.status !== undefined) patch.status = body.status;
  if (body.monthly_fee !== undefined) patch.monthly_fee = body.monthly_fee ?? null;
  if (body.dedication_hours !== undefined) patch.dedication_hours = body.dedication_hours ?? null;
  if (body.contract_start !== undefined) patch.contract_start = body.contract_start || null;
  if (body.contract_end !== undefined) patch.contract_end = body.contract_end || null;
  if (body.notes !== undefined) patch.notes = body.notes || null;
  if (body.health_score !== undefined) {
    patch.health_score = body.health_score ?? null;
    patch.health_updated_at = new Date().toISOString();
  }
  if (body.health_notes !== undefined) patch.health_notes = body.health_notes || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nenhum campo para atualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });

  return NextResponse.json(data);
}
