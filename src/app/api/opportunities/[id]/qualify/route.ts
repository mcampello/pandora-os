import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabasePublic } from "@/lib/supabase-admin";
import { aiJson } from "@/lib/ai";
import type { OpportunityQualification, QualificationState } from "@/lib/types";

const MODEL = "google/gemini-2.5-flash";

interface QualifyResponse {
  budget: { status: QualificationState; notes: string };
  authority: { status: QualificationState; notes: string };
  need: { status: QualificationState; notes: string };
  timeline: { status: QualificationState; notes: string };
  summary: string;
  next_steps: string[];
  risk: string;
}

/**
 * POST /api/opportunities/[id]/qualify
 * Lê reuniões, WhatsApp, emails e notas ligados ao contato da oportunidade
 * e usa a IA para preencher a qualificação BANT + resumo do deal.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: opp } = await supabase
    .from("opportunities")
    .select("*, contact:contacts(id, name, company, email, phone, role)")
    .eq("id", id)
    .maybeSingle();

  if (!opp) return NextResponse.json({ error: "not found" }, { status: 404 });

  const contact = opp.contact as
    | { id: string; name: string; company?: string; email?: string; phone?: string; role?: string }
    | null;

  // Pessoas envolvidas (contato principal + adicionados, ex: advogada)
  const { data: peopleRows } = await supabase
    .from("opportunity_contacts")
    .select("role, contact:contacts(id, name, email, phone, role)")
    .eq("opportunity_id", id);

  type Person = { id: string; name: string; phone?: string; role?: string; relRole?: string };
  const people: Person[] = [];
  if (contact) people.push({ id: contact.id, name: contact.name, phone: contact.phone, role: contact.role, relRole: "principal" });
  for (const r of (peopleRows ?? [])) {
    const c = r.contact as unknown as { id: string; name: string; phone?: string; role?: string } | null;
    if (c && !people.some(p => p.id === c.id)) people.push({ id: c.id, name: c.name, phone: c.phone, role: c.role, relRole: r.role ?? undefined });
  }

  const personIds = people.map(p => p.id);

  // Interações de qualquer envolvido OU ligadas direto à oportunidade (comentários de acompanhamento)
  const orFilter = personIds.length
    ? `contact_id.in.(${personIds.join(",")}),opportunity_id.eq.${id}`
    : `opportunity_id.eq.${id}`;
  const { data: interactions } = await supabase
    .from("interactions")
    .select("channel, type, subject, summary, content, occurred_at, contact_id")
    .or(orFilter)
    .order("occurred_at", { ascending: false })
    .limit(60);

  // Mensagens WhatsApp brutas (histórico vetorizado) de todos os envolvidos com telefone
  let waMessages: Array<{ content: string }> = [];
  for (const p of people) {
    if (!p.phone || waMessages.length >= 120) continue;
    const phoneDigits = p.phone.replace(/\D/g, "");
    if (!phoneDigits) continue;
    const { data: docs } = await supabasePublic()
      .from("documents")
      .select("content")
      .filter("metadata->>chatId", "ilike", `%${phoneDigits}%`)
      .order("id", { ascending: false })
      .limit(60);
    waMessages.push(...((docs ?? []) as Array<{ content: string }>));
  }

  const interactionsBlock = (interactions ?? [])
    .map(
      (i) =>
        `[${i.channel}/${i.type}] ${i.occurred_at}\n${i.subject ? i.subject + "\n" : ""}${(
          i.content ??
          i.summary ??
          ""
        ).slice(0, 500)}`
    )
    .join("\n\n");

  const waBlock = waMessages
    .map((m) => (m.content ?? "").slice(0, 400))
    .filter(Boolean)
    .join("\n---\n");

  const peopleBlock = people
    .map(p => `- ${p.name}${p.relRole ? ` [${p.relRole}]` : ""}${p.role ? ` — ${p.role}` : ""}`)
    .join("\n");

  const oppBlock = [
    `Título: ${opp.title}`,
    opp.description && `Descrição: ${opp.description}`,
    opp.value && `Valor estimado: R$ ${opp.value}`,
    opp.contract_model && `Modelo: ${opp.contract_model}`,
    `Estágio atual: ${opp.status}`,
    opp.notes && `Notas internas: ${opp.notes}`,
    people.length ? `Pessoas envolvidas:\n${peopleBlock}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const systemPrompt = `Você é o assistente comercial do Mario Campello (Pandora Tech), consultor de AI.
Mario presta consultoria de R$8-12k/mês (40-50h, 6 meses mínimo) e dá aulas de N8N. Vende muito por indicação.
Sua tarefa é QUALIFICAR uma oportunidade no modelo BANT a partir das conversas reais (reuniões, WhatsApp, emails, notas).
Seja honesto: se não há evidência sobre um critério, marque "unknown". Não invente.`;

  const userPrompt = `Analise a oportunidade abaixo e responda em JSON com EXATAMENTE estes campos:
- "budget":    { "status": "unknown|partial|confirmed", "notes": "evidência sobre orçamento/disposição a pagar (1-2 frases)" }
- "authority": { "status": "unknown|partial|confirmed", "notes": "quem decide; o contato é decisor? (1-2 frases)" }
- "need":      { "status": "unknown|partial|confirmed", "notes": "dor/necessidade concreta identificada (1-2 frases)" }
- "timeline":  { "status": "unknown|partial|confirmed", "notes": "urgência/prazo para decidir ou começar (1-2 frases)" }
- "summary": resumo do status do deal AGORA (3-5 frases): onde está, o que aconteceu, temperatura.
- "next_steps": array de 2-4 ações concretas para avançar (verbos no infinitivo, frases curtas).
- "risk": principal risco ou sinal de alerta do deal (1-2 frases). Se não houver, string vazia.

Critérios de status: "confirmed" = evidência clara nas conversas; "partial" = indícios mas não confirmado; "unknown" = sem informação.

===== OPORTUNIDADE =====
${oppBlock}

===== INTERAÇÕES NO CRM (${interactions?.length ?? 0}) =====
${interactionsBlock || "(nenhuma)"}

===== MENSAGENS WHATSAPP (${waMessages.length}) =====
${waBlock || "(nenhuma)"}`;

  const ai = await aiJson<QualifyResponse>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { model: MODEL }
  );

  const qualification: OpportunityQualification = {
    budget: ai.budget,
    authority: ai.authority,
    need: ai.need,
    timeline: ai.timeline,
    summary: ai.summary,
    next_steps: ai.next_steps ?? [],
    risk: ai.risk || undefined,
    updated_at: new Date().toISOString(),
    ai_generated: true,
  };

  const { data: updated, error } = await supabase
    .from("opportunities")
    .update({ qualification })
    .eq("id", id)
    .select("*, contact:contacts(id, name, company, email, phone, company_id), client:clients!converted_to_client_id(id, company_name, status, monthly_fee, health_score)")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}
