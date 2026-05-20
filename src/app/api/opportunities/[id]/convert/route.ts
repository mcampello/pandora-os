import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// POST /api/opportunities/[id]/convert
// Converte uma oportunidade em cliente ativo.
// Cria o registro em clients se ainda não existir, atualiza a oportunidade para status=converted.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, title, status, contact_id, converted_to_client_id, contact:contacts(id, name, company, company_id, email)")
    .eq("id", id)
    .maybeSingle();

  if (!opp) return NextResponse.json({ error: "oportunidade não encontrada" }, { status: 404 });
  if (opp.status === "dismissed") return NextResponse.json({ error: "oportunidade descartada não pode ser convertida" }, { status: 400 });

  // Se já tem cliente, apenas atualiza status
  if (opp.converted_to_client_id) {
    await supabase.from("opportunities").update({ status: "converted" }).eq("id", id);
    return NextResponse.json({ client_id: opp.converted_to_client_id, created: false });
  }

  const contact = opp.contact as unknown as { id: string; name: string; company?: string; company_id?: string; email?: string } | null;
  const companyName = contact?.company ?? opp.title;

  // Criar cliente
  const { data: client, error: clientErr } = await supabase
    .from("clients")
    .insert({
      contact_id: opp.contact_id,
      company_id: contact?.company_id ?? null,
      company_name: companyName,
      status: "active",
      renewal_auto: true,
    })
    .select("id")
    .single();

  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 500 });

  // Atualizar oportunidade
  await supabase
    .from("opportunities")
    .update({ status: "converted", converted_to_client_id: client.id })
    .eq("id", id);

  return NextResponse.json({ client_id: client.id, created: true }, { status: 201 });
}
