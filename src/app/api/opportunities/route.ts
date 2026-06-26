import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const SELECT_WITH_CONTACT =
  "*, contact:contacts(id, name, company, email, phone), proposals(id, title, value, status)";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const contactId = searchParams.get("contact_id");
  const statusParam = searchParams.get("status");
  const q = searchParams.get("q")?.trim().toLowerCase();

  let query = supabase
    .from("opportunities")
    .select(SELECT_WITH_CONTACT)
    .order("detected_at", { ascending: false });

  if (contactId) query = query.eq("contact_id", contactId);

  if (statusParam) {
    const statuses = statusParam.split(",").filter(Boolean);
    if (statuses.length === 1) query = query.eq("status", statuses[0]);
    else if (statuses.length > 1) query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = data ?? [];
  if (q) {
    rows = rows.filter((row) => {
      const title = (row.title ?? "").toLowerCase();
      const desc = (row.description ?? "").toLowerCase();
      const contactName = (row.contact?.name ?? "").toLowerCase();
      return title.includes(q) || desc.includes(q) || contactName.includes(q);
    });
  }

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const { contact_id, company_id, title, description, channel, confidence, status, notes, value, contract_model, company } = body;

  if (!title || !channel || !confidence || !company_id) {
    return NextResponse.json({ error: "title, channel, confidence e company_id são obrigatórios" }, { status: 400 });
  }

  const oppStatus = status ?? "nova";
  const insert: Record<string, unknown> = {
    contact_id: contact_id ?? null,
    title,
    description: description ?? null,
    channel,
    confidence,
    status: oppStatus,
    notes: notes ?? null,
    value: value != null ? parseFloat(value) : null,
    contract_model: contract_model || null,
    company: company || null,
    company_id,
    detected_at: new Date().toISOString(),
  };
  if (oppStatus === "em_contato") {
    insert.qualified_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("opportunities")
    .insert(insert)
    .select(SELECT_WITH_CONTACT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
