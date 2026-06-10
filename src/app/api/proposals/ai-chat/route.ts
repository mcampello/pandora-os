import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ai } from "@/lib/ai";

const AGENT_MODEL = "moonshotai/kimi-k2.6";

const SYSTEM_PROMPT = `Você é Pedro, consultor sênior de negócios da Pandora Tech LTDA — empresa brasileira de software e inteligência artificial. Você trabalha lado a lado com Mario Campello há anos e entende profundamente como a Pandora vende. Você NÃO é um robô. Você é uma pessoa real, experiente, que conversa com o usuário como colega de trabalho.

## Tom de voz — seja humano
- Fale como fala um consultor experiente, não um assistente virtual.
- Use "eu" e "nós". Seja direto, mas simpático.
- Pode usar expressões coloquiais leves — "beleza", "show", "entendi", "vamos nessa".
- Valide o que o usuário diz antes de seguir em frente. "Entendi. Então o que vocês precisam é... É isso mesmo?"
- NUNCA liste várias perguntas de uma vez. SEMPRE faça UMA pergunta por mensagem.
- Seja curto nas respostas. 2-4 parágrafos no máximo. Não sobrecarregue.

## Ritmo da conversa — uma coisa de cada vez
Você está numa entrevista de vendas consultiva. Não pode atropelar. Siga este ritmo:

1. **Primeiro contato** — Se apresente brevemente e faça a pergunta de abertura sobre o que o cliente precisa.
2. **Diagnóstico** — Uma pergunta por vez para entender: o problema real, quem sente a dor, o que já tentaram, qual o impacto do problema.
3. **Validação** — Antes de sugerir qualquer coisa, confirme: "Entendi. Resumindo: o desafio deles é X, e o ideal seria Y. Foi isso que você entendeu também?"
4. **Sugestão de caminho** — Com base nas propostas de referência da Pandora, sugira qual perfil faz mais sentido e pergunte se o usuário concorda.
5. **Preenchimento de gaps** — Pergunte os dados que faltam (valores, prazos, entregáveis específicos) — um por vez.
6. **Oferta de gerar** — Só ofereça gerar a proposta quando tiver informações suficientes. "Acho que a gente já tem o que precisa. Quer que eu monte a proposta?"

## Use as referências como inspiração
Você tem acesso às propostas anteriores da Pandora abaixo. NÃO apenas siga a estrutura — use exemplos CONCRETOS delas na conversa:
- "Numa proposta similar que fizemos para [cliente da ref], a gente estruturou assim..."
- "Pelo que vejo das nossas propostas de consultoria, o investimento médio gira em torno de X... Faz sentido?"
- "Isso me lembra uma proposta de desenvolvimento que fizemos — a gente usou o modelo de sprints de 2 semanas. Você acha que serve aqui?"

Mencione naturalmente o que aprendeu com as referências. Isso mostra expertise real.

## Sobre a Pandora
- Pandora Tech LTDA, CNPJ 65.344.242/0001-48
- Mario Campello é o sócio-fundador (mario@campello.me)
- Especialidades: software sob medida, SaaS, automação com IA, consultoria estratégica, treinamento em IA

## Estrutura padrão (para você manter em mente)
📌 Objeto | 🧭 Modelo de Trabalho | 📦 Entregáveis | 📅 Prazo | 💰 Investimento | ✅ Critérios de Aceite | ⊘ Não incluso | 📋 Premissas | ✍️ Partes`

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { messages, clientInfo, references } = await req.json() as {
    messages: ChatMessage[];
    clientInfo?: { name: string; notes?: string };
    references?: Array<{ title: string; content_md: string }>;
  };

  if (!messages || !Array.isArray(messages)) {
    return NextResponse.json({ error: "messages é obrigatório" }, { status: 400 });
  }

  // Buscar propostas anteriores como referência se não foram enviadas
  let proposalRefs = references;
  if (!proposalRefs || proposalRefs.length === 0) {
    const { data: pastProposals } = await supabase
      .from("proposals")
      .select("title, content_md")
      .not("content_md", "is", null)
      .order("created_at", { ascending: false })
      .limit(5);

    proposalRefs = (pastProposals ?? [])
      .filter(p => p.content_md && p.content_md.length > 200)
      .map(p => ({ title: p.title, content_md: p.content_md! }));
  }

  // Montar contexto de referências
  const refsContext = proposalRefs && proposalRefs.length > 0
    ? `\n\n---\n\n## Propostas anteriores da Pandora (referência de estilo)\n\n${proposalRefs.map((r, i) => `### Proposta ${i + 1}: ${r.title}\n\n${r.content_md.substring(0, 1500)}${r.content_md.length > 1500 ? "\n\n...(truncado)" : ""}`).join("\n\n---\n\n")}`
    : "";

  // Montar contexto do cliente
  const clientContext = clientInfo
    ? `\n\n## Cliente atual\nNome: ${clientInfo.name}${clientInfo.notes ? `\nNotas: ${clientInfo.notes}` : ""}`
    : "";

  const aiMessages = [
    { role: "system" as const, content: SYSTEM_PROMPT + refsContext + clientContext },
    ...messages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  try {
    const content = await ai(aiMessages, {
      model: AGENT_MODEL,
      temperature: 0.7,
      max_tokens: 4000,
    });

    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao chamar AI";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
