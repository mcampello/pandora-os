// ────────────────────────────────────────────
// POST /api/agent/chat — loop principal do agente central (S2D)
//
// Recebe uma mensagem de um canal (telegram | web), mantém histórico em
// agent_messages, e roda o ciclo de tool use:
//   - tools de leitura executam direto (2ª chamada ao modelo p/ resposta final)
//   - tools de escrita NÃO executam: viram uma confirmação pendente, persistida
//     em agent_messages.tool_calls, e só rodam quando chega confirm_action: 'yes'
//
// Auth: sessão Supabase (web) OU header x-agent-secret === AGENT_SECRET
// (canal servidor→servidor, ex. webhook do Telegram na S3).
// ────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aiWithTools, type AIMessage, type ToolCall } from "@/lib/ai";
import {
  AGENT_TOOL_DEFINITIONS,
  executeReadTool,
  executeWriteTool,
  isWriteTool,
  type ToolResult,
} from "@/lib/agent-tools";

type Channel = "telegram" | "web";

const MAX_TOOL_ITERATIONS = 5; // trava de segurança p/ encadeamento de reads
const HISTORY_LIMIT = 10;

interface PendingWrite {
  status: "pending_write";
  calls: ToolCall[];
}

// Contexto da tela em que o Mario está (enviado pelo dock/web).
interface PageContext {
  pathname?: string;
  route_label?: string;
  entity_type?: "contact" | "client" | "company" | "opportunity" | "proposal" | "contract" | "pipeline";
  entity_id?: string;
}

// ── Auth ─────────────────────────────────────────────────────
async function isAuthorized(req: NextRequest): Promise<boolean> {
  const secret = process.env.AGENT_SECRET;
  const header = req.headers.get("x-agent-secret");
  if (secret && header && header === secret) return true;

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return !!user;
}

// ── Persistência em agent_messages ───────────────────────────
async function saveMessage(
  db: ReturnType<typeof supabaseAdmin>,
  channel: Channel,
  role: "user" | "assistant",
  content: string,
  tool_calls: unknown = null
) {
  await db.from("agent_messages").insert({ channel, role, content, tool_calls });
}

// ── Snapshot curto da entidade da tela atual (para "este/esta") ─
async function buildPageContextBlock(
  db: ReturnType<typeof supabaseAdmin>,
  ctx: PageContext
): Promise<string> {
  const lines: string[] = [
    "",
    "Contexto da tela atual (o Mario está olhando para isto agora):",
    `- Tela: ${ctx.route_label ?? ctx.pathname ?? "desconhecida"}`,
  ];

  const id = ctx.entity_id;
  if (id && ctx.entity_type) {
    try {
      if (ctx.entity_type === "contact") {
        const { data } = await db.from("contacts").select("id, name, email, company, ai_summary").eq("id", id).maybeSingle();
        if (data) lines.push(`- Contato em foco: ${data.name} (id ${data.id})${data.company ? ` — ${data.company}` : ""}`);
      } else if (ctx.entity_type === "client") {
        const { data } = await db.from("clients").select("id, company_name, status, monthly_fee, health_score").eq("id", id).maybeSingle();
        if (data) lines.push(`- Cliente em foco: ${data.company_name} (id ${data.id}) — status ${data.status}, fee R$ ${data.monthly_fee ?? 0}, health ${data.health_score ?? "?"}`);
      } else if (ctx.entity_type === "company") {
        const { data } = await db.from("companies").select("id, name, industry").eq("id", id).maybeSingle();
        if (data) lines.push(`- Empresa em foco: ${data.name} (id ${data.id})`);
      } else if (ctx.entity_type === "opportunity") {
        const { data } = await db.from("opportunities").select("id, title, status, value").eq("id", id).maybeSingle();
        if (data) lines.push(`- Oportunidade em foco: ${data.title} (id ${data.id}) — status ${data.status}`);
      } else if (ctx.entity_type === "proposal") {
        const { data } = await db.from("proposals").select("id, title, status, value, client_id").eq("id", id).maybeSingle();
        if (data) lines.push(`- Proposta em foco: ${data.title} (id ${data.id}) — status ${data.status}, valor R$ ${data.value ?? "?"}, client_id ${data.client_id ?? "—"}`);
      } else if (ctx.entity_type === "contract") {
        const { data } = await db.from("contracts").select("id, title, status, value, client_id").eq("id", id).maybeSingle();
        if (data) lines.push(`- Contrato em foco: ${data.title} (id ${data.id}) — status ${data.status}, valor R$ ${data.value ?? "?"}, client_id ${data.client_id ?? "—"}`);
      }
    } catch {
      // snapshot é best-effort; ignora falha
    }
  }
  lines.push('- Quando o Mario disser "este/esta/aqui", assuma que se refere à entidade em foco acima e use o id dela.');
  return lines.join("\n");
}

// ── System prompt com snapshot do negócio ────────────────────
async function buildSystemPrompt(
  db: ReturnType<typeof supabaseAdmin>,
  pageContext?: PageContext | null
): Promise<string> {
  const [{ count: clientsActive }, { count: tasksOpen }, { count: proposalsPending }] = await Promise.all([
    db.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
    db.from("tasks").select("*", { count: "exact", head: true }).eq("status", "open"),
    db.from("proposals").select("*", { count: "exact", head: true }).in("status", ["draft", "sent", "viewed"]),
  ]);

  const hoje = new Date().toISOString().slice(0, 10);

  const base = [
    "Você é a Pandora, a assistente do Mario Campello na operação da Pandora Tech (consultoria).",
    "Você tem acesso direto aos dados do negócio dele (CRM, propostas, contratos, clientes, tarefas, financeiro) através de ferramentas.",
    "",
    `Data de hoje: ${hoje}.`,
    "Snapshot atual do negócio:",
    `- Clientes ativos: ${clientsActive ?? 0}`,
    `- Tarefas em aberto: ${tasksOpen ?? 0}`,
    `- Propostas pendentes (draft/sent/viewed): ${proposalsPending ?? 0}`,
    "",
    "Diretrizes:",
    "- Responda sempre em português do Brasil, de forma direta e objetiva — você fala com o Mario, não com clientes.",
    "- Use as ferramentas de leitura para consultar dados reais antes de afirmar números ou fatos. Nunca invente dados.",
    "- Para ações que alteram dados (criar/atualizar), chame a ferramenta de escrita apropriada; o sistema pedirá confirmação ao Mario antes de executar.",
    "- Você pode criar contatos, clientes, oportunidades, propostas e contratos, e gerenciar o pipeline. Ao criar proposta/contrato, por padrão gere o conteúdo completo via AI.",
    "- Seja conciso. Quando listar itens, prefira listas curtas com o essencial.",
  ].join("\n");

  if (pageContext && (pageContext.pathname || pageContext.entity_id)) {
    return base + "\n" + (await buildPageContextBlock(db, pageContext));
  }
  return base;
}

// ── Descrição PT de uma ação de escrita (texto de confirmação) ─
function describeWrite(call: ToolCall): string {
  const i = call.input ?? {};
  switch (call.name) {
    case "create_opportunity":
      return `criar a oportunidade "${i.title}"${i.value ? ` (R$ ${i.value})` : ""}`;
    case "create_interaction":
      return `registrar a interação "${i.subject}" no contato ${i.contact_id}`;
    case "create_task":
      return `criar a tarefa "${i.title}"${i.priority ? ` (prioridade ${i.priority})` : ""}`;
    case "update_opportunity_status":
      return `mudar o status da oportunidade ${i.id} para "${i.status}"`;
    case "update_client_health":
      return `atualizar o health score do cliente ${i.client_id} para ${i.health_score}`;
    case "update_proposal_status":
      return `mudar o status da proposta ${i.id} para "${i.status}"`;
    case "create_contact":
      return `criar o contato "${i.name}"${i.company ? ` (${i.company})` : ""}`;
    case "create_client":
      return `criar o cliente "${i.company_name ?? i.contact_id}"${i.status ? ` (${i.status})` : ""}`;
    case "update_client":
      return `atualizar o cliente ${i.client_id}`;
    case "update_opportunity":
      return `atualizar a oportunidade ${i.id}`;
    case "create_proposal":
      return `criar${i.generate === false ? "" : " e gerar"} a proposta "${i.title}"${i.value ? ` (R$ ${i.value})` : ""}`;
    case "create_contract":
      return `criar${i.generate === false ? "" : " e gerar"} o contrato "${i.title}"${i.value ? ` (R$ ${i.value})` : ""}`;
    default:
      return `executar ${call.name}`;
  }
}

function confirmationText(calls: ToolCall[]): string {
  const actions = calls.map((c) => `• ${describeWrite(c)}`).join("\n");
  const plural = calls.length > 1 ? "essas ações" : "essa ação";
  return `Quero confirmar antes de executar:\n${actions}\n\nPosso prosseguir com ${plural}? (responda *sim* ou *não*)`;
}

// ── Executa as escritas pendentes; devolve texto + destino de navegação ─
async function runPendingWrites(calls: ToolCall[]): Promise<{ text: string; navigateTo: string | null }> {
  const lines: string[] = [];
  let navigateTo: string | null = null;
  for (const call of calls) {
    const result: ToolResult = await executeWriteTool(call.name, call.input ?? {});
    if (result.success) {
      lines.push(`✅ ${describeWrite(call)} — feito.`);
      // create_proposal/create_contract devolvem navigate_to para abrir o doc gerado.
      const data = result.data as { navigate_to?: string } | null;
      if (data?.navigate_to) navigateTo = data.navigate_to;
    } else {
      lines.push(`❌ ${describeWrite(call)} — falhou: ${result.error}`);
    }
  }
  return { text: lines.join("\n"), navigateTo };
}

// ────────────────────────────────────────────
// GET — histórico recente do canal web (hidrata o dock em qualquer página)
// ────────────────────────────────────────────

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = supabaseAdmin();
  const { data } = await db
    .from("agent_messages")
    .select("role, content")
    .eq("channel", "web")
    .order("created_at", { ascending: false })
    .limit(30);
  const messages = (data ?? []).reverse();
  return NextResponse.json({ messages });
}

// ────────────────────────────────────────────
// Handler
// ────────────────────────────────────────────

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { message?: string; channel?: Channel; confirm_action?: "yes" | "no"; page_context?: PageContext };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const channel: Channel = body.channel === "telegram" ? "telegram" : "web";
  const message = typeof body.message === "string" ? body.message.trim() : "";
  const confirmAction = body.confirm_action;
  const pageContext = body.page_context ?? null;

  const db = supabaseAdmin();

  // 2. Histórico recente do canal (mais antigo → mais novo)
  const { data: historyRows } = await db
    .from("agent_messages")
    .select("role, content, tool_calls")
    .eq("channel", channel)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const history = (historyRows ?? []).reverse();

  // Última ação de escrita pendente = última mensagem do canal com tool_calls.status === 'pending_write'
  const lastRow = history[history.length - 1];
  const pending: PendingWrite | null =
    lastRow?.role === "assistant" &&
    (lastRow.tool_calls as PendingWrite | null)?.status === "pending_write"
      ? (lastRow.tool_calls as PendingWrite)
      : null;

  // 3/4. Fluxo de confirmação
  if (confirmAction === "yes") {
    if (!pending) {
      return NextResponse.json({ response: "Não há nenhuma ação pendente para confirmar." });
    }
    const { text: resultText, navigateTo } = await runPendingWrites(pending.calls);
    await saveMessage(db, channel, "assistant", resultText, null);
    return NextResponse.json({ response: resultText, did_write: true, navigate_to: navigateTo });
  }
  if (confirmAction === "no") {
    if (!pending) {
      return NextResponse.json({ response: "Não há nenhuma ação pendente para cancelar." });
    }
    const text = "Ok, cancelei. Não executei nada.";
    await saveMessage(db, channel, "assistant", text, null);
    return NextResponse.json({ response: text });
  }

  if (!message) {
    return NextResponse.json({ error: "message é obrigatório" }, { status: 400 });
  }

  // 5. Salvar mensagem do usuário
  await saveMessage(db, channel, "user", message, null);

  // 6. System prompt + montagem do histórico para o modelo
  const system = await buildSystemPrompt(db, pageContext);
  const messages: AIMessage[] = [
    { role: "system", content: system },
    ...history.map((m): AIMessage => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: message },
  ];

  // 7/8. Loop de tool use
  try {
    for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
      const result = await aiWithTools(messages, AGENT_TOOL_DEFINITIONS, { max_tokens: 1024 });

      const calls = result.tool_calls ?? [];
      const writeCalls = calls.filter((c) => isWriteTool(c.name));
      const readCalls = calls.filter((c) => !isWriteTool(c.name));

      // Escrita proposta → confirmar, sem executar
      if (writeCalls.length > 0) {
        const text = result.content?.trim()
          ? `${result.content.trim()}\n\n${confirmationText(writeCalls)}`
          : confirmationText(writeCalls);
        await saveMessage(db, channel, "assistant", text, { status: "pending_write", calls: writeCalls } satisfies PendingWrite);
        return NextResponse.json({ response: text, pending_confirmation: true });
      }

      // Leitura → executar e realimentar o modelo
      if (readCalls.length > 0) {
        if (result.content?.trim()) {
          messages.push({ role: "assistant", content: result.content.trim() });
        }
        for (const call of readCalls) {
          const res = await executeReadTool(call.name, call.input ?? {});
          messages.push({
            role: "user",
            content: `Resultado da ferramenta ${call.name}(${JSON.stringify(call.input ?? {})}):\n${JSON.stringify(res)}`,
          });
        }
        continue; // nova chamada ao modelo com os resultados
      }

      // Sem tool calls → resposta final
      const finalText = result.content?.trim() || "Desculpe, não consegui gerar uma resposta.";
      await saveMessage(db, channel, "assistant", finalText, null);
      return NextResponse.json({ response: finalText });
    }

    // Estourou o limite de iterações
    const fallback = "Consultei vários dados mas não cheguei a uma resposta final. Pode reformular?";
    await saveMessage(db, channel, "assistant", fallback, null);
    return NextResponse.json({ response: fallback });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Falha no agente: ${msg}` }, { status: 500 });
  }
}
