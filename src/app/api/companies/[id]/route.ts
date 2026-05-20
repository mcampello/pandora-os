import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// [id] = URL-encoded company name
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const name = decodeURIComponent(id);

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: contacts, error: ce }, { data: clients }] = await Promise.all([
    supabase
      .from("contacts")
      .select("id, name, email, phone, role, source, created_at")
      .eq("company", name)
      .order("name"),
    supabase
      .from("clients")
      .select("id, company_name, status, monthly_fee")
      .eq("company_name", name),
  ]);

  if (ce) return NextResponse.json({ error: ce.message }, { status: 500 });

  return NextResponse.json({ name, contacts: contacts ?? [], clients: clients ?? [] });
}
