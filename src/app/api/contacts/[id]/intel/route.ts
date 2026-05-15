import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { aiJson } from "@/lib/ai";

interface IntelResponse {
  who: string;
  status: string;
  topics: string[];
  sales_strategy: string;
  next_steps: string[];
}

const MODEL = "google/gemini-2.5-flash";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Último snapshot — define o cursor de mensagens já analisadas
  const { data: lastSnapshot } = await supabase
    .from("contact_analysis_snapshots")
    .select("*")
    .eq("contact_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cursorDocId: number = lastSnapshot?.last_doc_id ?? 0;

  // Interações do CRM (sem cursor por enquanto — são poucas)
  const { data: interactions } = await supabase
    .from("interactions").select("*").eq("contact_id", id)
    .order("occurred_at", { ascending: false }).limit(30);

  // Mensagens WhatsApp NOVAS desde o último snapshot
  let waMessages: Array<{ id: number; content: string; metadata: Record<string, unknown> }> = [];
  let newMaxDocId = cursorDocId;

  if (contact.phone) {
    const phoneDigits = contact.phone.replace(/\D/g, "");
    const query = supabase
      .from("documents")
      .select("id, content, metadata")
      .filter("metadata->>chatId", "ilike", `%${phoneDigits}%`)
      .order("id", { ascending: false })
      .limit(60);

    if (cursorDocId > 0) {
      query.gt("id", cursorDocId);
    }

    const { data: docs } = await query;
    waMessages = (docs ?? []) as typeof waMessages;
    if (waMessages.length > 0) {
      newMaxDocId = Math.max(...waMessages.map((d) => d.id));
    }
  }

  const isFirstAnalysis = !lastSnapshot;
  const hasNewMessages = waMessages.length > 0;

  if (!isFirstAnalysis && !hasNewMessages && (interactions?.length ?? 0) === 0) {
    return NextResponse.json({ snapshot: lastSnapshot, no_new_data: true });
  }

  // Adapta prompt de acordo com a categoria do contato
  const category = contact.category ?? "desconhecido";

  const lensConfig: Record<string, { strategyLabel: string; strategyGuide: string; nextStepsGuide: string }> = {
    prospect: {
      strategyLabel: "Como vender pra ele",
      strategyGuide: "Como Mario deve avançar para converter esse prospect em cliente (4-6 frases). Foco em dores, fit, momento e abordagem.",
      nextStepsGuide: 'Ações comerciais concretas. Ex: "Enviar proposta", "Marcar call de descoberta".',
    },
    cliente: {
      strategyLabel: "Como reter e expandir",
      strategyGuide: "Como Mario deve manter e expandir o relacionamento com esse cliente (4-6 frases). Foco em satisfação, renovação e upsell.",
      nextStepsGuide: 'Ações de relacionamento/expansão. Ex: "Agendar reunião de alinhamento mensal", "Apresentar nova solução".',
    },
    fornecedor: {
      strategyLabel: "Stack e como trabalhar com ele",
      strategyGuide: "Qual a stack, especialidades e forma de trabalho desse fornecedor (4-6 frases). O que ele entrega, em que contextos Mario poderia acioná-lo, pontos de atenção.",
      nextStepsGuide: 'Ações de colaboração. Ex: "Solicitar portfólio", "Testar em projeto piloto".',
    },
    desenvolvedor: {
      strategyLabel: "Stack e especialidades",
      strategyGuide: "Quais são as tecnologias, especialidades e forma de trabalho desse desenvolvedor (4-6 frases). Em que projetos poderia ser útil para Mario.",
      nextStepsGuide: 'Ações de colaboração técnica. Ex: "Enviar briefing do projeto X", "Avaliar disponibilidade".',
    },
    parceiro: {
      strategyLabel: "Como nutrir a parceria",
      strategyGuide: "Como Mario deve cultivar a parceria e potencial de indicação com esse contato (4-6 frases). Interesses em comum, como colaborar.",
      nextStepsGuide: 'Ações de parceria. Ex: "Indicar cliente em comum", "Propor co-criação".',
    },
    casual: {
      strategyLabel: "Contexto",
      strategyGuide: "Qual o contexto dessa relação com Mario (2-3 frases). Sem viés comercial.",
      nextStepsGuide: 'Ações simples de manutenção de contato, se houver.',
    },
    desconhecido: {
      strategyLabel: "O que fazer com esse contato",
      strategyGuide: "Com base nas conversas, o que Mario deveria fazer com esse contato (3-4 frases). Tente classificar o fit.",
      nextStepsGuide: 'Ações de qualificação. Ex: "Entender o perfil", "Verificar interesse".',
    },
  };

  const lens = lensConfig[category] ?? lensConfig.desconhecido;

  // Monta contexto
  const profileBlock = [
    `Nome: ${contact.name}`,
    `Categoria: ${category}`,
    contact.role         && `Cargo: ${contact.role}`,
    contact.company      && `Empresa: ${contact.company}`,
    contact.email        && `Email: ${contact.email}`,
    contact.phone        && `Telefone: ${contact.phone}`,
    contact.linkedin_url && `LinkedIn: ${contact.linkedin_url}`,
    contact.website      && `Site: ${contact.website}`,
    contact.source       && `Origem: ${contact.source}`,
    contact.notes        && `Notas: ${contact.notes}`,
  ].filter(Boolean).join("\n");

  const interactionsBlock = (interactions ?? []).map((i) =>
    `[${i.channel}/${i.type}] ${i.occurred_at}\n${i.subject ? i.subject + "\n" : ""}${(i.content ?? i.summary ?? "").slice(0, 400)}`
  ).join("\n\n");

  const waBlock = waMessages.map((m) =>
    (m.content ?? "").slice(0, 400)
  ).filter(Boolean).join("\n---\n");

  const previousContext = lastSnapshot
    ? `\nÚLTIMA ANÁLISE (${new Date(lastSnapshot.created_at).toLocaleDateString("pt-BR")}):
Quem é: ${lastSnapshot.who ?? "(não disponível)"}
Status anterior: ${lastSnapshot.status ?? "(não disponível)"}`
    : "";

  const systemPrompt = `Você é o assistente do Mario Campello, consultor de AI e professor (Pandora Tech).
Mario presta consultoria de R$8-12k/mês (40-50h, 6 meses mínimo). Também dá aulas de N8N.
Mario vende por indicação principalmente.

Sua missão: analisar ${isFirstAnalysis ? "todo o histórico" : "as NOVAS mensagens desde a última análise"} do contato e retornar um snapshot estruturado.
A categoria deste contato é "${category}" — ajuste o foco da análise de acordo.`;

  const userPrompt = `Analise este contato e responda em JSON com os campos:
- "who": quem é esse contato (3-5 frases). ${isFirstAnalysis ? "Descreva o perfil completo." : "Atualize se houver novas informações, caso contrário repita o resumo anterior."}
- "status": o que está acontecendo AGORA no relacionamento (3-5 frases). Foque no período das novas mensagens.
- "topics": array de 3-6 strings com os temas principais das conversas recentes.
- "sales_strategy": ${lens.strategyGuide}
- "next_steps": array de 2-4 ações concretas que Mario deve tomar agora (frases curtas, verbos no infinitivo). ${lens.nextStepsGuide}

===== PERFIL =====
${profileBlock || "(sem dados)"}
${previousContext}

===== INTERAÇÕES NO CRM (${interactions?.length ?? 0}) =====
${interactionsBlock || "(nenhuma)"}

===== ${isFirstAnalysis ? "MENSAGENS WHATSAPP" : `NOVAS MENSAGENS WHATSAPP (${waMessages.length} desde a última análise)`} =====
${waBlock || "(nenhuma)"}`;

  const intel = await aiJson<IntelResponse>(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    { model: MODEL }
  );

  // Salva snapshot
  const { data: snapshot } = await supabase
    .from("contact_analysis_snapshots")
    .insert({
      contact_id: id,
      who: intel.who,
      status: intel.status,
      topics: intel.topics,
      sales_strategy: intel.sales_strategy,
      next_steps: intel.next_steps ?? [],
      last_doc_id: newMaxDocId > 0 ? newMaxDocId : null,
      message_count: waMessages.length,
      model: MODEL,
    })
    .select()
    .single();

  // Atualiza ai_summary no contato para exibição rápida na listagem
  await supabase.from("contacts").update({
    ai_summary: intel.who,
    ai_summary_updated_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.json({ snapshot, no_new_data: false });
}
