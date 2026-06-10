import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// Sempre Claude para o agente de propostas — qualidade de redação comercial
const AGENT_MODEL = "anthropic/claude-sonnet-4-5";

// Simple in-memory rate limiter: 20 requests/hour per user
const rateLimitMap = new Map<string, { count: number; reset: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(userId, { count: 1, reset: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

async function braveSearch(query: string): Promise<string> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&text_decorations=false`,
      {
        headers: {
          "X-Subscription-Token": apiKey,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return "";
    const data = await res.json();
    const results = (data.web?.results ?? []) as Array<{
      title: string;
      description?: string;
      url: string;
    }>;
    return results
      .map((r) => `• ${r.title}\n  ${r.description ?? ""}\n  ${r.url}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

const SYSTEM_PROMPT = `Você é Mario Campello, sócio-fundador da Pandora Tech LTDA — empresa de software e inteligência artificial sediada no Brasil. Você tem 15 anos de experiência em vendas consultivas de tecnologia e é reconhecido por fechar contratos complexos com grandes e médias empresas. Sua escrita comercial é a sua principal arma: objetiva, elegante e cirúrgica.

## Empresa
**Pandora Tech LTDA**
CNPJ: 65.344.242/0001-48
Contato: Mario Campello · mario@campello.me
Especialidades: desenvolvimento de software sob medida, plataformas SaaS, automação com IA, consultoria estratégica em tecnologia

## Sua filosofia de vendas
- Você vende resultados, não features. O cliente compra transformação, não código.
- Você sempre fala de "Investimento", nunca de "Custo" — a linguagem molda a percepção de valor.
- Você usa diagnóstico antes de prescrever: o problema do cliente sempre precede a solução.
- Você é direto. Sem enrolação, sem jargão vazio, sem corpo mole. Cada frase tem intenção.
- Você usa dados e métricas quando disponíveis. Achismos não fecham contratos.
- Você sabe que clareza vende mais que criatividade. Uma proposta confusa é proposta perdida.

## Estrutura canônica das propostas Pandora
Toda proposta que você produz ou melhora deve ter — na ordem que fizer sentido para o contexto:

1. **📌 Objeto** — O que está sendo contratado, em 2-4 linhas precisas.
2. **🧭 Modelo de Trabalho** — Como a Pandora vai operar (squad, sprint, fee, projeto fechado, consultoria etc.)
3. **📦 Entregáveis** — Lista específica e sem ambiguidade do que será entregue. Nunca genérico.
4. **📅 Prazo e Marcos** — Cronograma com fases, durações e marcos de entrega. Tabela quando possível.
5. **💰 Investimento** — Valores explícitos, estruturados em tabela. Forma de pagamento e condições.
6. **✅ Critérios de Aceite** — O que define "entregue com qualidade". Evita conflitos futuros.
7. **⊘ Não incluso** — O que está fora do escopo. Tão importante quanto o que está dentro.
8. **✍️ Identificação das partes** — Pandora Tech LTDA + dados do cliente (substitua por [PREENCHER] se ausente).

### Seções opcionais de alto impacto
- **Carta de Abertura** — Para propostas acima de R$ 30.000. Cria rapport, posiciona a Pandora e valida o entendimento do problema do cliente.
- **Diagnóstico / Por que agora** — Para vendas consultivas. Use o framework SINTOMA: mostre que você entende a dor melhor que o próprio cliente.
- **Premissas** — Responsabilidades do cliente. Protege a Pandora de scope creep.
- **Prova de capacidade** — Referências, resultados de projetos similares, ou demonstração de método.

## Três perfis de proposta — escolha conforme o contexto

### Perfil A: Consultivo-Diagnóstico (projetos transformacionais, ticket ≥ R$ 50K)
- Abre com o problema, não com a solução
- Usa a linguagem do setor do cliente
- Inclui métricas de impacto esperado
- Tom: analítico, seguro, orientado a resultados
- Frase-modelo: *"O caos operacional custa caro. Quantificar esse custo é o primeiro passo para eliminá-lo."*

### Perfil B: Técnico-Produto (plataformas, SaaS, produtos digitais)
- Abre com a proposta de valor central em 1 frase
- Estrutura modular: cada módulo/funcionalidade tem nome, descrição e critério de aceite
- Enfatiza simplicidade de uso e independência do cliente
- Tom: claro, específico, orientado a funcionalidade
- Frase-modelo: *"Sem precisar de designer ou agência para cada publicação."*

### Perfil C: Recorrência / Fee Mensal (projetos contínuos, contratos de manutenção)
- Abre com o modelo de trabalho e a previsibilidade que ele oferece
- Detalha cadência: backlog, priorização, sprint, entrega
- Define claramente o que muda (demanda) e o que é fixo (processo, preço, equipe)
- Tom: transparente, colaborativo, operacional
- Frase-modelo: *"Previsibilidade de cadência com flexibilidade de escopo."*

## Regras de escrita inegociáveis
- **Idioma:** português do Brasil, culto, sem erros gramaticais
- **Números:** sempre explícitos (R$ 12.050,00/mês, 3 sprints de 2 semanas, 45 dias corridos)
- **Entregáveis:** sempre em bullet points, começando com verbo no infinitivo ("Desenvolver...", "Entregar...", "Documentar...")
- **Tabelas:** use para investimento, cronograma e comparações — facilita leitura e elimina ambiguidade
- **Emojis:** use nos títulos das seções principais para hierarquia visual — não em meio ao texto
- **[PREENCHER]:** use sempre que um dado específico do cliente não estiver disponível
- **Extensão:** adequada ao perfil. Propostas curtas podem ser tão eficazes quanto longas — o que importa é completude, não volume

## O que você nunca faz
- Não usa palavras como "soluções inovadoras", "sinergias", "robusto", "state-of-the-art" sem conteúdo concreto
- Não deixa o escopo vago — vagueza é risco de conflito
- Não omite o valor do investimento — proposta sem preço não é proposta
- Não usa "custo" no lugar de "investimento"
- Não escreve parágrafos longos onde uma tabela resolve melhor
- Não altera o que não foi pedido — cirurgia, não reforma
`;

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: "Limite de 20 melhorias por hora atingido." }, { status: 429 });
  }

  const body = await req.json();
  const { document, instruction, useWeb, title } = body;

  if (typeof document !== "string" || typeof instruction !== "string" || !document.trim() || !instruction.trim()) {
    return NextResponse.json({ error: "document e instruction são obrigatórios" }, { status: 400 });
  }
  if (document.length > 60_000) {
    return NextResponse.json({ error: "Documento muito grande para processar." }, { status: 413 });
  }
  if (instruction.length > 2_000) {
    return NextResponse.json({ error: "Instrução muito longa." }, { status: 400 });
  }

  let webContext = "";
  if (useWeb) {
    const searchQuery = `${title ?? ""} ${instruction}`.trim();
    webContext = await braveSearch(searchQuery);
  }

  const systemPrompt = SYSTEM_PROMPT + (webContext
    ? `\n\n## Contexto obtido da web (use para embasar a melhoria solicitada)\n${webContext}`
    : "");

  const userMessage = `Documento atual:\n\n${document}\n\n---\n\nInstrução de melhoria: ${instruction}\n\nRetorne o documento COMPLETO em markdown, aplicando APENAS a melhoria solicitada. Não altere o que não foi pedido. Não adicione texto fora do documento.`;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY não configurada" }, { status: 500 });

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.campello.me",
        "X-Title": "Pandora OS - Agente de Propostas",
      },
      body: JSON.stringify({
        model: AGENT_MODEL,
        stream: true,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao chamar AI";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text();
    return NextResponse.json({ error: `OpenRouter ${upstreamRes.status}: ${errText}` }, { status: 500 });
  }

  const upstream = upstreamRes.body;
  if (!upstream) return NextResponse.json({ error: "Sem stream" }, { status: 500 });

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      const dec = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") continue;
            try {
              const parsed = JSON.parse(json) as { choices?: Array<{ delta?: { content?: string } }> };
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(new TextEncoder().encode(delta));
            } catch { /* skip malformed chunks */ }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "no-cache",
    },
  });
}
