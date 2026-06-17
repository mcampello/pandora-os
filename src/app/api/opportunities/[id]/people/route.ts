import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const SELECT = "id, opportunity_id, contact_id, role, created_at, contact:contacts(id, name, email, phone, company, role)";

/** GET — lista pessoas envolvidas na oportunidade */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("opportunity_contacts")
    .select(SELECT)
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** POST — adiciona uma pessoa { contact_id, role? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  if (!body.contact_id) return NextResponse.json({ error: "contact_id obrigatório" }, { status: 400 });

  const { data, error } = await supabase
    .from("opportunity_contacts")
    .upsert(
      { opportunity_id: id, contact_id: body.contact_id, role: body.role || null },
      { onConflict: "opportunity_id,contact_id" }
    )
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

/** DELETE ?contact_id= — remove uma pessoa */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const contactId = new URL(req.url).searchParams.get("contact_id");
  if (!contactId) return NextResponse.json({ error: "contact_id obrigatório" }, { status: 400 });

  const { error } = await supabase
    .from("opportunity_contacts")
    .delete()
    .eq("opportunity_id", id)
    .eq("contact_id", contactId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
