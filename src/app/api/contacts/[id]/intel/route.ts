import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { aiJson } from "@/lib/ai";

interface IntelResponse {
  who: string;
  status: string;
  topics: string[];
  sales_strategy: string;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // 1. Carrega contato
  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // 2. Carrega interações
  const { data: interactions } = await supabase
    .from("interactions").select("*").eq("contact_id", id)
    .order("occurred_at", { ascending: false }).limit(50);

  // 3. Busca mensagens do WhatsApp em public.documents (vetorial via N8N)
  let waMessages: Array<{ content: string; metadata: Record<string, unknown> }> = [];
  if (contact.phone) {
    const phoneDigits = contact.phone.replace(/\\D/g, "");
    const { data: docs } = await supabase
      .from("documents").select("content, metadata")
      .filter("metadata->>chatid", "ilike", `%${phoneDigits}%`)
      .order("id", { ascending: false }).limit(40);
    waMessages = docs ?? [];
  }

  // 4. Monta contexto para AI
  const profileBlock = [
    \`Nome: \${contact.name}\`,
    contact.role     && \`Cargo: \${contact.role}\`,
    contact.company  && \`Empresa: \${contact.company}\`,
    contact.email    && \`Email: \${contact.email}\`,
    contact.phone    && \`Telefone: \${contact.phone}\`,
    contact.linkedin_url && \`LinkedIn: \${contact.linkedin_url}\`,
    contact.website  && \`Site: \${contact.website}\`,
    contact.source   && \`Origem do contato: \${contact.source}\`,
    contact.notes    && \`Notas pessoais: \${contact.notes}\`,
  ].filter(Boolean).join("\\n");

  const interactionsBlock = (interactions ?? []).slice(0, 30).map((i) =>
    \`[\${i.channel}/\${i.type}] \${i.occurred_at}\\n\${i.subject ? i.subject + "\\n" : ""}\${(i.content ?? i.summary ?? "").slice(0, 500)}\`
  ).join("\\n\\n");

  const waBlock = waMessages.slice(0, 30).map((m) =>
    (m.content ?? "").slice(0, 400)
  ).filter(Boolean).join("\\n---\\n");

  const systemPrompt = \`Você é o assistente do Mario Campello, consultor de AI e professor (Pandora Tech).
Mario presta consultoria de R\$8-12k/mês para empresas (40-50h dedicadas, 6 meses mínimo, renovação automática).
Mario também dá aulas em escolas (echos.cc, somostera.com) sobre N8N e automação.
Mario vende por indicação principalmente.

Sua missão: analisar contato e responder 3 perguntas em JSON estruturado.\`;

  const userPrompt = \`Analise este contato e responda em JSON com os campos:
- "who": parágrafo (3-5 frases) descrevendo quem é, o que faz, contexto profissional. Cite fontes específicas do histórico se houver.
- "status": parágrafo (3-5 frases) sobre o momento ATUAL do relacionamento com Mario. Já é cliente? Aluno? Em negociação? Apenas conhecido? O que está em andamento? Quando foi a última interação?
- "topics": array de strings com os principais temas conversados (3-6 itens, ex: "interesse em automação", "preço", "agenda da próxima reunião"). Vazio se não houver dados.
- "sales_strategy": parágrafo (4-6 frases) com a melhor estratégia para vender consultoria/aulas pra esse contato. Considere o nível, dores aparentes, fit com o perfil que Mario atende, momento. Seja prático e específico.

Se faltarem dados, seja honesto: indique o que falta saber.

===== PERFIL DO CONTATO =====
\${profileBlock || "(sem dados estruturados)"}

===== INTERAÇÕES REGISTRADAS NO CRM (\${interactions?.length ?? 0}) =====
\${interactionsBlock || "(nenhuma)"}

===== MENSAGENS DE WHATSAPP RECENTES (\${waMessages.length}) =====
\${waBlock || "(nenhuma)"}\`;

  const intel = await aiJson<IntelResponse>([
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ]);

  const updated_at = new Date().toISOString();

  // 5. Salva resumo no contato (ai_summary = who) para mostrar mais rápido depois
  await supabase.from("contacts").update({
    ai_summary: intel.who,
    ai_summary_updated_at: updated_at,
  }).eq("id", id);

  return NextResponse.json({ ...intel, updated_at });
}
