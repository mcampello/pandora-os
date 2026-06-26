// ────────────────────────────────────────────
// Agent Tools — definições e executores do agente central
//
// Server-side only. Usa supabaseAdmin (bypass RLS) — NUNCA importe no client.
// As tools de leitura executam direto; as de escrita só rodam após confirmação
// explícita do usuário (ver WRITE_TOOLS / isWriteTool).
// ────────────────────────────────────────────

import { supabaseAdmin } from "@/lib/supabase-admin";
import type { ToolDefinition } from "@/lib/ai";
import { generateProposalMarkdown, generateContractMarkdown } from "@/lib/doc-generation";
import { proposalViewerUrl, contractViewerUrl } from "@/lib/docs";

// Resultado padronizado de qualquer executor.
export type ToolResult =
  | { success: true; data: unknown }
  | { success: false; error: string };

// Valores válidos no banco (espelham os CHECK constraints reais do Supabase).
const OPPORTUNITY_STATUSES = ["nova", "em_contato", "proposta", "contrato", "operacional", "perdida"] as const;
const PROPOSAL_STATUSES = ["draft", "sent", "viewed", "accepted", "rejected", "expired"] as const;
const TASK_STATUSES = ["open", "done", "dismissed"] as const;
const TASK_PRIORITIES = ["critical", "high", "medium", "low"] as const;
const INTERACTION_CHANNELS = ["email", "whatsapp", "fathom", "calcom", "manual"] as const;
const INTERACTION_TYPES = ["message_in", "message_out", "meeting", "email_in", "email_out", "booking", "note"] as const;
const CLIENT_STATUSES = ["prospect", "active", "paused", "former"] as const;

// ────────────────────────────────────────────
// Definições (passadas ao Claude via aiWithTools)
// ────────────────────────────────────────────

export const AGENT_TOOL_DEFINITIONS: ToolDefinition[] = [
  // ── Leitura ──────────────────────────────────────────────
  {
    name: "search_contacts",
    description:
      "Busca contatos por nome, email, empresa ou telefone. Use quando o Mario mencionar uma pessoa ou empresa e você precisar localizar o registro.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Termo de busca (nome, email, empresa ou telefone)" },
        limit: { type: "number", description: "Máximo de resultados (padrão 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "get_contact",
    description:
      "Retorna um contato completo pelo ID, incluindo resumo de IA, tags e as últimas interações registradas.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "UUID do contato" },
      },
      required: ["contact_id"],
    },
  },
  {
    name: "list_opportunities",
    description:
      "Lista oportunidades comerciais, opcionalmente filtradas por status. Status válidos: nova, em_contato, proposta, contrato, operacional, perdida.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...OPPORTUNITY_STATUSES], description: "Filtra por status" },
        limit: { type: "number", description: "Máximo de resultados (padrão 20)" },
      },
    },
  },
  {
    name: "get_client_summary",
    description:
      "Resumo de um cliente: dados do contrato, fee mensal, health score, iniciativas e entregas do mês. Aceita o UUID do cliente ou o nome da empresa.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "UUID do cliente" },
        company_name: { type: "string", description: "Nome da empresa do cliente (alternativa ao client_id)" },
      },
    },
  },
  {
    name: "list_proposals",
    description:
      "Lista propostas, opcionalmente filtradas por status ou cliente. Status válidos: draft, sent, viewed, accepted, rejected, expired.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...PROPOSAL_STATUSES], description: "Filtra por status" },
        client_id: { type: "string", description: "Filtra por UUID do cliente" },
        limit: { type: "number", description: "Máximo de resultados (padrão 20)" },
      },
    },
  },
  {
    name: "list_tasks",
    description:
      "Lista tarefas/pendências do Mario, opcionalmente filtradas por status ou prioridade. Status: open, done, dismissed. Prioridades: critical, high, medium, low.",
    input_schema: {
      type: "object",
      properties: {
        status: { type: "string", enum: [...TASK_STATUSES], description: "Filtra por status (padrão: open)" },
        priority: { type: "string", enum: [...TASK_PRIORITIES], description: "Filtra por prioridade" },
        limit: { type: "number", description: "Máximo de resultados (padrão 20)" },
      },
    },
  },
  {
    name: "get_financial_summary",
    description:
      "Resumo financeiro: receita recorrente esperada (clientes ativos), faturas em aberto e vencidas, e despesas mensais recorrentes da empresa.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "list_interactions",
    description:
      "Lista as interações mais recentes (mensagens, reuniões, emails), opcionalmente filtradas por contato.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "Filtra pelas interações de um contato" },
        limit: { type: "number", description: "Máximo de resultados (padrão 15)" },
      },
    },
  },

  // ── Escrita (requerem confirmação) ───────────────────────
  {
    name: "create_opportunity",
    description:
      "Cria uma nova oportunidade comercial. REQUER CONFIRMAÇÃO. Status inicial sempre 'nova'.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título da oportunidade" },
        contact_id: { type: "string", description: "UUID do contato associado (opcional)" },
        channel: { type: "string", description: "Canal de origem (whatsapp, email, calcom, manual, group)" },
        confidence: { type: "string", enum: ["very_high", "high", "medium", "low"], description: "Confiança (padrão medium)" },
        value: { type: "number", description: "Valor estimado em R$ (opcional)" },
        description: { type: "string", description: "Descrição (opcional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "create_interaction",
    description:
      "Registra uma interação (nota, mensagem, reunião) vinculada a um contato. REQUER CONFIRMAÇÃO.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "UUID do contato" },
        type: { type: "string", enum: [...INTERACTION_TYPES], description: "Tipo da interação (padrão note)" },
        subject: { type: "string", description: "Assunto / título curto" },
        content: { type: "string", description: "Conteúdo detalhado (opcional)" },
        channel: { type: "string", enum: [...INTERACTION_CHANNELS], description: "Canal (padrão manual)" },
      },
      required: ["contact_id", "subject"],
    },
  },
  {
    name: "create_task",
    description:
      "Cria uma tarefa/pendência para o Mario. REQUER CONFIRMAÇÃO. Status inicial 'open'.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Descrição da tarefa" },
        priority: { type: "string", enum: [...TASK_PRIORITIES], description: "Prioridade (padrão medium)" },
        due_at: { type: "string", description: "Prazo em ISO-8601 (opcional)" },
        entity_type: { type: "string", enum: ["contact", "client", "opportunity", "proposal", "deliverable"], description: "Entidade relacionada (opcional)" },
        entity_id: { type: "string", description: "UUID da entidade relacionada (opcional)" },
      },
      required: ["title"],
    },
  },
  {
    name: "update_opportunity_status",
    description:
      "Altera o status de uma oportunidade. REQUER CONFIRMAÇÃO. Status válidos: nova, em_contato, proposta, contrato, operacional, perdida.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID da oportunidade" },
        status: { type: "string", enum: [...OPPORTUNITY_STATUSES], description: "Novo status" },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "update_client_health",
    description:
      "Atualiza o health score (1-10) de um cliente e, opcionalmente, as notas. REQUER CONFIRMAÇÃO.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "UUID do cliente" },
        health_score: { type: "number", description: "Nota de 1 a 10" },
        health_notes: { type: "string", description: "Justificativa / observações (opcional)" },
      },
      required: ["client_id", "health_score"],
    },
  },
  {
    name: "update_proposal_status",
    description:
      "Altera o status de uma proposta. REQUER CONFIRMAÇÃO. Status válidos: draft, sent, viewed, accepted, rejected, expired.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID da proposta" },
        status: { type: "string", enum: [...PROPOSAL_STATUSES], description: "Novo status" },
      },
      required: ["id", "status"],
    },
  },
  {
    name: "create_contact",
    description:
      "Cria um novo contato (pessoa/empresa) no CRM. REQUER CONFIRMAÇÃO. Use antes de criar um cliente se o contato ainda não existir.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Nome do contato (obrigatório)" },
        email: { type: "string", description: "Email (opcional)" },
        phone: { type: "string", description: "Telefone (opcional)" },
        company: { type: "string", description: "Empresa (opcional)" },
        role: { type: "string", description: "Cargo (opcional)" },
        source: { type: "string", description: "Origem: whatsapp, email, fathom, calcom, manual, indication (padrão manual)" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_client",
    description:
      "Cria um cliente (relacionamento comercial) a partir de um contato existente. REQUER CONFIRMAÇÃO. Status inicial padrão 'prospect'.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "UUID do contato (opcional se informar company_name)" },
        company_name: { type: "string", description: "Nome de exibição do cliente (obrigatório se não houver contact_id)" },
        status: { type: "string", enum: [...CLIENT_STATUSES], description: "Status (padrão prospect)" },
        monthly_fee: { type: "number", description: "Fee mensal em R$ (opcional)" },
        dedication_hours: { type: "number", description: "Horas/mês dedicadas (opcional)" },
      },
    },
  },
  {
    name: "update_client",
    description:
      "Atualiza dados comerciais de um cliente (status, fee, horas, datas de contrato). REQUER CONFIRMAÇÃO. Para o health score use update_client_health.",
    input_schema: {
      type: "object",
      properties: {
        client_id: { type: "string", description: "UUID do cliente" },
        status: { type: "string", enum: [...CLIENT_STATUSES], description: "Novo status (opcional)" },
        monthly_fee: { type: "number", description: "Novo fee mensal em R$ (opcional)" },
        dedication_hours: { type: "number", description: "Novas horas/mês (opcional)" },
        contract_start: { type: "string", description: "Início do contrato (YYYY-MM-DD, opcional)" },
        contract_end: { type: "string", description: "Fim do contrato (YYYY-MM-DD, opcional)" },
      },
      required: ["client_id"],
    },
  },
  {
    name: "update_opportunity",
    description:
      "Edita campos de uma oportunidade (título, valor, descrição). REQUER CONFIRMAÇÃO. Para mudar o status use update_opportunity_status.",
    input_schema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID da oportunidade" },
        title: { type: "string", description: "Novo título (opcional)" },
        value: { type: "number", description: "Novo valor estimado em R$ (opcional)" },
        description: { type: "string", description: "Nova descrição (opcional)" },
      },
      required: ["id"],
    },
  },
  {
    name: "create_proposal",
    description:
      "Cria uma proposta comercial em rascunho. REQUER CONFIRMAÇÃO. Por padrão (generate=true) gera o conteúdo completo em Markdown via AI. Informe client_id ou company_name para vincular ao cliente.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título da proposta (obrigatório)" },
        client_id: { type: "string", description: "UUID do cliente (opcional)" },
        company_name: { type: "string", description: "Nome do cliente para vincular (alternativa ao client_id)" },
        value: { type: "number", description: "Valor da proposta em R$ (opcional)" },
        context: { type: "string", description: "Contexto/instruções extras para a geração (opcional)" },
        generate: { type: "boolean", description: "Gerar o conteúdo via AI (padrão true). Se false, cria só o rascunho vazio." },
      },
      required: ["title"],
    },
  },
  {
    name: "create_contract",
    description:
      "Cria um contrato em rascunho. REQUER CONFIRMAÇÃO. Por padrão (generate=true) gera o texto jurídico completo (padrão brasileiro) via AI. Informe client_id ou company_name para vincular.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Título/objeto do contrato (obrigatório)" },
        client_id: { type: "string", description: "UUID do cliente (opcional)" },
        company_name: { type: "string", description: "Nome do cliente para vincular (alternativa ao client_id)" },
        value: { type: "number", description: "Valor do contrato em R$ (opcional)" },
        context: { type: "string", description: "Contexto/instruções extras para a geração (opcional)" },
        generate: { type: "boolean", description: "Gerar o texto via AI (padrão true). Se false, cria só o rascunho vazio." },
      },
      required: ["title"],
    },
  },
];

// ────────────────────────────────────────────
// Tools de escrita — exigem confirmação antes de executar
// ────────────────────────────────────────────

export const WRITE_TOOLS = new Set<string>([
  "create_opportunity",
  "create_interaction",
  "create_task",
  "update_opportunity_status",
  "update_client_health",
  "update_proposal_status",
  "create_contact",
  "create_client",
  "update_client",
  "update_opportunity",
  "create_proposal",
  "create_contract",
]);

export function isWriteTool(name: string): boolean {
  return WRITE_TOOLS.has(name);
}

// ────────────────────────────────────────────
// Helpers internos
// ────────────────────────────────────────────

function ok(data: unknown): ToolResult {
  return { success: true, data };
}

function fail(error: string): ToolResult {
  return { success: false, error };
}

function str(input: Record<string, unknown>, key: string): string | undefined {
  const v = input[key];
  return typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;
}

function num(input: Record<string, unknown>, key: string): number | undefined {
  const v = input[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function bool(input: Record<string, unknown>, key: string): boolean | undefined {
  const v = input[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return v === "true" ? true : v === "false" ? false : undefined;
  return undefined;
}

// Resolve um client_id a partir do id direto ou do nome da empresa.
async function resolveClientId(
  db: ReturnType<typeof supabaseAdmin>,
  input: Record<string, unknown>
): Promise<string | undefined> {
  const direct = str(input, "client_id");
  if (direct) return direct;
  const name = str(input, "company_name");
  if (!name) return undefined;
  const { data } = await db
    .from("clients")
    .select("id")
    .ilike("company_name", `%${sanitizeLike(name)}%`)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id;
}

function intLimit(input: Record<string, unknown>, fallback: number, max = 50): number {
  const v = num(input, "limit");
  if (v === undefined) return fallback;
  return Math.min(Math.max(1, Math.floor(v)), max);
}

// Escapa caracteres que quebrariam o filtro `.or()` do PostgREST.
function sanitizeLike(term: string): string {
  return term.replace(/[%,()]/g, " ").trim();
}

// ────────────────────────────────────────────
// Executor de leitura
// ────────────────────────────────────────────

export async function executeReadTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  const db = supabaseAdmin();

  try {
    switch (name) {
      case "search_contacts": {
        const query = str(input, "query");
        if (!query) return fail("query é obrigatório");
        const term = sanitizeLike(query);
        if (!term) return fail("query inválido");
        const { data, error } = await db
          .from("contacts")
          .select("id, name, email, phone, company, category, ai_summary, tags")
          .or(`name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%,phone.ilike.%${term}%`)
          .order("updated_at", { ascending: false })
          .limit(intLimit(input, 10));
        if (error) return fail(error.message);
        return ok({ count: data?.length ?? 0, contacts: data ?? [] });
      }

      case "get_contact": {
        const contactId = str(input, "contact_id");
        if (!contactId) return fail("contact_id é obrigatório");
        const { data: contact, error } = await db
          .from("contacts")
          .select("*")
          .eq("id", contactId)
          .maybeSingle();
        if (error) return fail(error.message);
        if (!contact) return fail("Contato não encontrado");
        const { data: interactions } = await db
          .from("interactions")
          .select("id, channel, type, subject, summary, occurred_at")
          .eq("contact_id", contactId)
          .order("occurred_at", { ascending: false })
          .limit(10);
        return ok({ contact, recent_interactions: interactions ?? [] });
      }

      case "list_opportunities": {
        let q = db
          .from("opportunities")
          .select("id, title, status, confidence, channel, value, company, detected_at, contact:contacts(id, name, company)")
          .order("detected_at", { ascending: false })
          .limit(intLimit(input, 20));
        const status = str(input, "status");
        if (status) {
          if (!(OPPORTUNITY_STATUSES as readonly string[]).includes(status)) {
            return fail(`status inválido. Use: ${OPPORTUNITY_STATUSES.join(", ")}`);
          }
          q = q.eq("status", status);
        }
        const { data, error } = await q;
        if (error) return fail(error.message);
        return ok({ count: data?.length ?? 0, opportunities: data ?? [] });
      }

      case "get_client_summary": {
        const clientId = str(input, "client_id");
        const companyName = str(input, "company_name");
        if (!clientId && !companyName) return fail("Informe client_id ou company_name");

        let base = db
          .from("clients")
          .select("id, company_name, status, monthly_fee, dedication_hours, contract_start, contract_end, renewal_auto, health_score, health_notes, health_updated_at, notes");
        base = clientId ? base.eq("id", clientId) : base.ilike("company_name", `%${sanitizeLike(companyName!)}%`);
        const { data: client, error } = await base.order("updated_at", { ascending: false }).limit(1).maybeSingle();
        if (error) return fail(error.message);
        if (!client) return fail("Cliente não encontrado");

        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const monthIso = monthStart.toISOString().slice(0, 10);

        const [{ data: initiatives }, { data: deliverables }] = await Promise.all([
          db.from("initiatives").select("id, title, status, priority, due_date").eq("client_id", client.id).order("priority", { ascending: false }).limit(10),
          db.from("deliverables").select("id, title, done, due_date, month").eq("client_id", client.id).gte("month", monthIso).order("due_date", { ascending: true, nullsFirst: false }).limit(20),
        ]);

        return ok({ client, initiatives: initiatives ?? [], deliverables_this_month: deliverables ?? [] });
      }

      case "list_proposals": {
        let q = db
          .from("proposals")
          .select("id, title, status, value, version, created_at, client:clients(id, company_name)")
          .order("created_at", { ascending: false })
          .limit(intLimit(input, 20));
        const status = str(input, "status");
        if (status) {
          if (!(PROPOSAL_STATUSES as readonly string[]).includes(status)) {
            return fail(`status inválido. Use: ${PROPOSAL_STATUSES.join(", ")}`);
          }
          q = q.eq("status", status);
        }
        const clientId = str(input, "client_id");
        if (clientId) q = q.eq("client_id", clientId);
        const { data, error } = await q;
        if (error) return fail(error.message);
        return ok({ count: data?.length ?? 0, proposals: data ?? [] });
      }

      case "list_tasks": {
        const status = str(input, "status") ?? "open";
        if (!(TASK_STATUSES as readonly string[]).includes(status)) {
          return fail(`status inválido. Use: ${TASK_STATUSES.join(", ")}`);
        }
        let q = db
          .from("tasks")
          .select("id, title, status, priority, source, entity_type, entity_id, due_at, created_at")
          .eq("status", status)
          .order("due_at", { ascending: true, nullsFirst: false })
          .order("created_at", { ascending: false })
          .limit(intLimit(input, 20));
        const priority = str(input, "priority");
        if (priority) {
          if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) {
            return fail(`priority inválido. Use: ${TASK_PRIORITIES.join(", ")}`);
          }
          q = q.eq("priority", priority);
        }
        const { data, error } = await q;
        if (error) return fail(error.message);
        return ok({ count: data?.length ?? 0, tasks: data ?? [] });
      }

      case "get_financial_summary": {
        const today = new Date().toISOString().slice(0, 10);
        const [{ data: activeClients }, { data: openInvoices }, { data: expenses }] = await Promise.all([
          db.from("clients").select("monthly_fee").eq("status", "active"),
          db.from("invoices").select("amount, status, due_date").in("status", ["pendente", "emitida"]),
          db.from("company_expenses").select("amount, recurrence").eq("active", true).eq("recurrence", "mensal"),
        ]);

        const expected_monthly_revenue = (activeClients ?? []).reduce((s, c) => s + (Number(c.monthly_fee) || 0), 0);
        const open_total = (openInvoices ?? []).reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const overdue = (openInvoices ?? []).filter((i) => i.due_date && i.due_date < today);
        const overdue_total = overdue.reduce((s, i) => s + (Number(i.amount) || 0), 0);
        const monthly_expenses = (expenses ?? []).reduce((s, e) => s + (Number(e.amount) || 0), 0);

        return ok({
          active_clients: activeClients?.length ?? 0,
          expected_monthly_revenue,
          monthly_expenses,
          monthly_net: expected_monthly_revenue - monthly_expenses,
          open_invoices: { count: openInvoices?.length ?? 0, total: open_total },
          overdue_invoices: { count: overdue.length, total: overdue_total },
        });
      }

      case "list_interactions": {
        let q = db
          .from("interactions")
          .select("id, channel, type, subject, summary, occurred_at, contact:contacts(id, name)")
          .order("occurred_at", { ascending: false })
          .limit(intLimit(input, 15));
        const contactId = str(input, "contact_id");
        if (contactId) q = q.eq("contact_id", contactId);
        const { data, error } = await q;
        if (error) return fail(error.message);
        return ok({ count: data?.length ?? 0, interactions: data ?? [] });
      }

      default:
        return fail(`Tool de leitura desconhecida: ${name}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}

// ────────────────────────────────────────────
// Executor de escrita (só após confirmação do usuário)
// ────────────────────────────────────────────

export async function executeWriteTool(name: string, input: Record<string, unknown>): Promise<ToolResult> {
  const db = supabaseAdmin();

  try {
    switch (name) {
      case "create_opportunity": {
        const title = str(input, "title");
        if (!title) return fail("title é obrigatório");
        const confidence = str(input, "confidence") ?? "medium";
        const { data, error } = await db
          .from("opportunities")
          .insert({
            title,
            contact_id: str(input, "contact_id") ?? null,
            channel: str(input, "channel") ?? "manual",
            confidence,
            value: num(input, "value") ?? null,
            description: str(input, "description") ?? null,
            status: "nova",
          })
          .select("id, title, status, confidence, channel, value")
          .single();
        if (error) return fail(error.message);
        return ok(data);
      }

      case "create_interaction": {
        const contactId = str(input, "contact_id");
        const subject = str(input, "subject");
        if (!contactId) return fail("contact_id é obrigatório");
        if (!subject) return fail("subject é obrigatório");
        const type = str(input, "type") ?? "note";
        if (!(INTERACTION_TYPES as readonly string[]).includes(type)) {
          return fail(`type inválido. Use: ${INTERACTION_TYPES.join(", ")}`);
        }
        const channel = str(input, "channel") ?? "manual";
        if (!(INTERACTION_CHANNELS as readonly string[]).includes(channel)) {
          return fail(`channel inválido. Use: ${INTERACTION_CHANNELS.join(", ")}`);
        }
        const { data, error } = await db
          .from("interactions")
          .insert({
            contact_id: contactId,
            channel,
            type,
            subject,
            content: str(input, "content") ?? null,
            occurred_at: new Date().toISOString(),
          })
          .select("id, contact_id, channel, type, subject, occurred_at")
          .single();
        if (error) return fail(error.message);
        return ok(data);
      }

      case "create_task": {
        const title = str(input, "title");
        if (!title) return fail("title é obrigatório");
        const priority = str(input, "priority") ?? "medium";
        if (!(TASK_PRIORITIES as readonly string[]).includes(priority)) {
          return fail(`priority inválido. Use: ${TASK_PRIORITIES.join(", ")}`);
        }
        const { data, error } = await db
          .from("tasks")
          .insert({
            title,
            priority,
            status: "open",
            source: "manual",
            due_at: str(input, "due_at") ?? null,
            entity_type: str(input, "entity_type") ?? null,
            entity_id: str(input, "entity_id") ?? null,
          })
          .select("id, title, status, priority, due_at")
          .single();
        if (error) return fail(error.message);
        return ok(data);
      }

      case "update_opportunity_status": {
        const id = str(input, "id");
        const status = str(input, "status");
        if (!id) return fail("id é obrigatório");
        if (!status || !(OPPORTUNITY_STATUSES as readonly string[]).includes(status)) {
          return fail(`status inválido. Use: ${OPPORTUNITY_STATUSES.join(", ")}`);
        }
        const { data, error } = await db
          .from("opportunities")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id, title, status")
          .maybeSingle();
        if (error) return fail(error.message);
        if (!data) return fail("Oportunidade não encontrada");
        return ok(data);
      }

      case "update_client_health": {
        const clientId = str(input, "client_id");
        const score = num(input, "health_score");
        if (!clientId) return fail("client_id é obrigatório");
        if (score === undefined) return fail("health_score é obrigatório");
        if (score < 1 || score > 10) return fail("health_score deve estar entre 1 e 10");
        const update: Record<string, unknown> = {
          health_score: Math.round(score),
          health_updated_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        const notes = str(input, "health_notes");
        if (notes !== undefined) update.health_notes = notes;
        const { data, error } = await db
          .from("clients")
          .update(update)
          .eq("id", clientId)
          .select("id, company_name, health_score, health_notes")
          .maybeSingle();
        if (error) return fail(error.message);
        if (!data) return fail("Cliente não encontrado");
        return ok(data);
      }

      case "update_proposal_status": {
        const id = str(input, "id");
        const status = str(input, "status");
        if (!id) return fail("id é obrigatório");
        if (!status || !(PROPOSAL_STATUSES as readonly string[]).includes(status)) {
          return fail(`status inválido. Use: ${PROPOSAL_STATUSES.join(", ")}`);
        }
        const { data, error } = await db
          .from("proposals")
          .update({ status, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select("id, title, status")
          .maybeSingle();
        if (error) return fail(error.message);
        if (!data) return fail("Proposta não encontrada");
        return ok(data);
      }

      case "create_contact": {
        const name2 = str(input, "name");
        if (!name2) return fail("name é obrigatório");
        const { data, error } = await db
          .from("contacts")
          .insert({
            name: name2,
            email: str(input, "email") ?? null,
            phone: str(input, "phone") ?? null,
            company: str(input, "company") ?? null,
            role: str(input, "role") ?? null,
            source: str(input, "source") ?? "manual",
          })
          .select("id, name, email, company")
          .single();
        if (error) return fail(error.message);
        return ok(data);
      }

      case "create_client": {
        const contactId = str(input, "contact_id");
        let companyName = str(input, "company_name");
        if (!contactId && !companyName) return fail("Informe contact_id ou company_name");
        // Deriva o nome de exibição a partir do contato, se necessário.
        if (!companyName && contactId) {
          const { data: c } = await db.from("contacts").select("name, company").eq("id", contactId).maybeSingle();
          companyName = c?.company ?? c?.name ?? "Novo cliente";
        }
        const status = str(input, "status") ?? "prospect";
        if (!(CLIENT_STATUSES as readonly string[]).includes(status)) {
          return fail(`status inválido. Use: ${CLIENT_STATUSES.join(", ")}`);
        }
        const { data, error } = await db
          .from("clients")
          .insert({
            contact_id: contactId ?? null,
            company_name: companyName,
            status,
            monthly_fee: num(input, "monthly_fee") ?? null,
            dedication_hours: num(input, "dedication_hours") ?? null,
          })
          .select("id, company_name, status, monthly_fee")
          .single();
        if (error) return fail(error.message);
        return ok(data);
      }

      case "update_client": {
        const clientId = str(input, "client_id");
        if (!clientId) return fail("client_id é obrigatório");
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const status = str(input, "status");
        if (status) {
          if (!(CLIENT_STATUSES as readonly string[]).includes(status)) {
            return fail(`status inválido. Use: ${CLIENT_STATUSES.join(", ")}`);
          }
          update.status = status;
        }
        const fee = num(input, "monthly_fee");
        if (fee !== undefined) update.monthly_fee = fee;
        const hours = num(input, "dedication_hours");
        if (hours !== undefined) update.dedication_hours = hours;
        const cstart = str(input, "contract_start");
        if (cstart) update.contract_start = cstart;
        const cend = str(input, "contract_end");
        if (cend) update.contract_end = cend;
        if (Object.keys(update).length === 1) return fail("Nenhum campo para atualizar");
        const { data, error } = await db
          .from("clients")
          .update(update)
          .eq("id", clientId)
          .select("id, company_name, status, monthly_fee, dedication_hours, contract_start, contract_end")
          .maybeSingle();
        if (error) return fail(error.message);
        if (!data) return fail("Cliente não encontrado");
        return ok(data);
      }

      case "update_opportunity": {
        const id = str(input, "id");
        if (!id) return fail("id é obrigatório");
        const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
        const title = str(input, "title");
        if (title) update.title = title;
        const value = num(input, "value");
        if (value !== undefined) update.value = value;
        const description = str(input, "description");
        if (description) update.description = description;
        if (Object.keys(update).length === 1) return fail("Nenhum campo para atualizar");
        const { data, error } = await db
          .from("opportunities")
          .update(update)
          .eq("id", id)
          .select("id, title, status, value")
          .maybeSingle();
        if (error) return fail(error.message);
        if (!data) return fail("Oportunidade não encontrada");
        return ok(data);
      }

      case "create_proposal": {
        const title = str(input, "title");
        if (!title) return fail("title é obrigatório");
        const clientId = await resolveClientId(db, input);
        const shouldGenerate = bool(input, "generate") !== false; // default true
        let content_md: string | null = null;
        if (shouldGenerate) {
          try {
            content_md = await generateProposalMarkdown(title, str(input, "context"));
          } catch (e) {
            return fail(`Falha ao gerar a proposta: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        // proposal_group_id/version têm default no DB (igual à rota POST /api/proposals).
        const { data, error } = await db
          .from("proposals")
          .insert({
            title,
            client_id: clientId ?? null,
            value: num(input, "value") ?? null,
            content_md,
            status: "draft",
          })
          .select("id, title, status, value, client_id")
          .single();
        if (error) return fail(error.message);
        await db.from("proposals").update({ viewer_url: proposalViewerUrl(data.id) }).eq("id", data.id);
        return ok({ ...data, navigate_to: `/propostas/${data.id}`, generated: shouldGenerate });
      }

      case "create_contract": {
        const title = str(input, "title");
        if (!title) return fail("title é obrigatório");
        const clientId = await resolveClientId(db, input);
        const shouldGenerate = bool(input, "generate") !== false; // default true
        let content_md: string | null = null;
        if (shouldGenerate) {
          try {
            content_md = await generateContractMarkdown(title, str(input, "context"));
          } catch (e) {
            return fail(`Falha ao gerar o contrato: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        // contract_group_id/version têm default no DB (igual à rota POST /api/contracts).
        const { data, error } = await db
          .from("contracts")
          .insert({
            title,
            client_id: clientId ?? null,
            value: num(input, "value") ?? null,
            content_md,
            status: "draft",
          })
          .select("id, title, status, value, client_id")
          .single();
        if (error) return fail(error.message);
        await db.from("contracts").update({ viewer_url: contractViewerUrl(data.id) }).eq("id", data.id);
        return ok({ ...data, navigate_to: `/contratos/${data.id}`, generated: shouldGenerate });
      }

      default:
        return fail(`Tool de escrita desconhecida: ${name}`);
    }
  } catch (e) {
    return fail(e instanceof Error ? e.message : String(e));
  }
}
