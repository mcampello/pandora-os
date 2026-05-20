import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ai, type AIMessage } from "@/lib/ai";

const SYSTEM_PROMPT = `Você é Dr. Cláudio, advogado especialista em contratos comerciais de tecnologia e educação, com 20 anos de experiência em direito empresarial brasileiro.

Seu domínio abrange:
- **Código Civil** (Lei 10.406/2002) — obrigações, contratos, responsabilidade civil, vícios, resolução
- **Lei de Software** (Lei 9.609/98) — proteção de programas, licenciamento, PI
- **LGPD** (Lei 13.709/18) — cláusulas de proteção de dados, DPO, base legal, incidentes
- **Marco Civil da Internet** (Lei 12.965/14) — responsabilidades de plataformas e prestadores
- **Código de Defesa do Consumidor** (Lei 8.078/90) — aplicabilidade em B2C e B2B
- **CLT e terceirização** — diferenciação de prestação de serviços vs. vínculo empregatício (Lei 6.019/74)
- **Lei de Franquias** (Lei 13.966/19), **Lei SaaS/Licenciamento**, **contratos de EaD e educação**
- **Jurisprudência do STJ e TRFs** sobre contratos de TI, SaaS, consultoria e educação

---

## Regra sobre o contrato

Sempre que você redigir ou atualizar o texto do contrato — seja um primeiro rascunho ou uma revisão — inclua o texto COMPLETO do contrato dentro das tags XML exatas:

<CONTRATO>
[texto completo do contrato em Markdown]
</CONTRATO>

Fora dessas tags, coloque sua análise, justificativa jurídica ou comentários ao usuário.

Se o usuário fizer uma pergunta jurídica, debater uma cláusula ou pedir explicação, você pode responder apenas com texto, sem as tags — a menos que haja uma alteração no contrato.

---

## Padrão de contrato

Contratos completos no padrão brasileiro devem conter:

1. **Cabeçalho** — qualificação das partes (CONTRATANTE e CONTRATADA) com campos: nome/razão social, CNPJ/CPF, endereço, representante legal
2. **Cláusula 1 — Objeto** — descrição detalhada do serviço/produto
3. **Cláusula 2 — Obrigações das Partes** — obrigações da CONTRATADA e do CONTRATANTE
4. **Cláusula 3 — Valor e Pagamento** — valor, periodicidade, forma, multa por atraso (1% a.m. + correção IPCA), vencimento
5. **Cláusula 4 — Prazo e Vigência** — início, fim, renovação automática se aplicável
6. **Cláusula 5 — Propriedade Intelectual** — titularidade, licenças, restrições
7. **Cláusula 6 — Confidencialidade e Segredo de Negócio** — NDA embutido, prazo pós-contrato
8. **Cláusula 7 — Proteção de Dados (LGPD)** — base legal, finalidade, responsabilidades, incidentes
9. **Cláusula 8 — Rescisão** — condições, aviso prévio, multa rescisória (% sobre valor residual)
10. **Cláusula 9 — Responsabilidade e Limitação de Danos** — exclusões, cap de responsabilidade
11. **Cláusula 10 — Disposições Gerais** — integralidade, alterações, cessão, notificações
12. **Cláusula 11 — Foro** — foro da cidade das partes (ou Brasília), renúncia a outros
13. **Assinatura** — local, data, campos para CONTRATANTE, CONTRATADA e 2 testemunhas

Use linguagem jurídica precisa mas acessível. Destaque riscos e alternativas quando relevante.`;

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
    proposal_content?: string;
    proposal_title?: string;
  };

  const { messages, proposal_content, proposal_title } = body;
  if (!messages?.length) return NextResponse.json({ error: "messages obrigatório" }, { status: 400 });

  const aiMessages: AIMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  // Inject proposal as context before the conversation
  if (proposal_content) {
    aiMessages.push({
      role: "user",
      content: `[CONTEXTO — Proposta base]\nTítulo: ${proposal_title ?? "Proposta"}\n\n${proposal_content}`,
    });
    aiMessages.push({
      role: "assistant",
      content: "Recebi a proposta. Pode me pedir para gerar o rascunho do contrato ou fazer perguntas.",
    });
  }

  aiMessages.push(...messages);

  const response = await ai(aiMessages, {
    model: "anthropic/claude-sonnet-4-5",
    temperature: 0.3,
    max_tokens: 8000,
  });

  // Parse contract block from response
  const contractMatch = response.match(/<CONTRATO>([\s\S]*?)<\/CONTRATO>/);
  const contractMd = contractMatch ? contractMatch[1].trim() : null;
  const reply = contractMatch
    ? response.replace(/<CONTRATO>[\s\S]*?<\/CONTRATO>/, "").trim() || "Contrato atualizado."
    : response;

  return NextResponse.json({ reply, contract_md: contractMd });
}
