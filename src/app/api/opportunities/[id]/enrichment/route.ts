import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

/**
 * Enriquecimento da oportunidade: agrega toda a atividade ligada ao contato
 * (e demais contatos da mesma empresa) — reuniões Fathom, WhatsApp, emails,
 * notas — mais o último snapshot de inteligência da IA.
 *
 * GET /api/opportunities/[id]/enrichment
 *   → { interactions: Interaction[], snapshot: AnalysisSnapshot | null, contact_ids: string[] }
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: opp } = await supabase
    .from("opportunities")
    .select("id, contact_id, company_id")
    .eq("id", id)
    .maybeSingle();

  if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Pessoas envolvidas (contato principal + adicionados manualmente)
  const { data: people } = await supabase
    .from("opportunity_contacts")
    .select("id, opportunity_id, contact_id, role, created_at, contact:contacts(id, name, email, phone, company, role)")
    .eq("opportunity_id", id)
    .order("created_at", { ascending: true });

  // Conjunto de contatos cuja atividade enriquece a oportunidade
  const contactIds = new Set<string>();
  if (opp.contact_id) contactIds.add(opp.contact_id);
  (people ?? []).forEach((p) => p.contact_id && contactIds.add(p.contact_id));

  // Também todos os contatos da mesma empresa (mesma lógica de /api/meetings)
  if (opp.company_id) {
    const { data: companyContacts } = await supabase
      .from("contacts").select("id").eq("company_id", opp.company_id);
    (companyContacts ?? []).forEach((c) => contactIds.add(c.id));
  }

  const ids = [...contactIds];

  // Interações de qualquer pessoa envolvida OU ligadas diretamente à oportunidade (comentários)
  const orFilter = ids.length
    ? `contact_id.in.(${ids.join(",")}),opportunity_id.eq.${id}`
    : `opportunity_id.eq.${id}`;

  const [{ data: interactions }, { data: snapshot }] = await Promise.all([
    supabase
      .from("interactions")
      .select("id, contact_id, opportunity_id, subject, summary, content, occurred_at, external_url, channel, type, metadata, created_at")
      .or(orFilter)
      .order("occurred_at", { ascending: false })
      .limit(80),
    opp.contact_id
      ? supabase
          .from("contact_analysis_snapshots")
          .select("*")
          .eq("contact_id", opp.contact_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return NextResponse.json({
    interactions: interactions ?? [],
    snapshot: snapshot ?? null,
    people: people ?? [],
    contact_ids: ids,
  });
}
