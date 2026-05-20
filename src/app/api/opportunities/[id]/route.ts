import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { OpportunityChannel, OpportunityConfidence, OpportunityStatus } from "@/lib/types";

const SELECT_WITH_CONTACT =
  "*, contact:contacts(id, name, company, email, phone, company_id), proposals(id, title, value, status)";

const SELECT_DETAIL =
  "*, contact:contacts(id, name, company, email, phone, company_id), client:clients!converted_to_client_id(id, company_name, status, monthly_fee, health_score)";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("opportunities")
    .select(SELECT_DETAIL)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json();

  const { data: existing, error: fetchErr } = await supabase
    .from("opportunities")
    .select("id, status, qualified_at, contact_id")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (body.title !== undefined)          patch.title          = body.title;
  if (body.description !== undefined)    patch.description    = body.description || null;
  if (body.notes !== undefined)          patch.notes          = body.notes || null;
  if (body.channel !== undefined)        patch.channel        = body.channel as OpportunityChannel;
  if (body.confidence !== undefined)     patch.confidence     = body.confidence as OpportunityConfidence;
  if (body.contact_id !== undefined)     patch.contact_id     = body.contact_id || null;
  if (body.value !== undefined)          patch.value          = body.value != null ? parseFloat(body.value) : null;
  if (body.contract_model !== undefined) patch.contract_model = body.contract_model || null;
  if (body.company !== undefined)        patch.company        = body.company || null;
  if (body.converted_to_client_id !== undefined) patch.converted_to_client_id = body.converted_to_client_id || null;

  if (body.status !== undefined) {
    const newStatus = body.status as OpportunityStatus;
    patch.status = newStatus;
    if (newStatus === "qualified" && !existing.qualified_at) {
      patch.qualified_at = new Date().toISOString();
    }
    if (newStatus === "converted") {
      const contactId = body.contact_id !== undefined ? body.contact_id : existing.contact_id;
      if (!contactId) {
        return NextResponse.json({ error: "contact_id é obrigatório para status converted" }, { status: 400 });
      }
    }
  }

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "nenhum campo para atualizar" }, { status: 400 });

  const { data, error } = await supabase
    .from("opportunities")
    .update(patch)
    .eq("id", id)
    .select(SELECT_WITH_CONTACT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
