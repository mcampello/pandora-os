import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { aiJson } from "@/lib/ai";
import { upsertTask, todayStr } from "@/lib/tasks";
import type { TaskPriority, TaskEntityType } from "@/lib/tasks";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

interface AISuggestedTask {
  title: string;
  priority: TaskPriority;
  entity_type?: TaskEntityType;
  entity_id?: string;
  ai_reasoning: string;
  rule_key: string;
}

interface AIScanResponse {
  tasks: AISuggestedTask[];
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const summary = { clients_scanned: 0, tasks_created: 0, tasks_skipped: 0, errors: [] as string[] };

  // Busca clientes ativos
  const { data: clients, error: clientsError } = await db
    .from("clients")
    .select("id, company_name, contact_id")
    .eq("status", "active");

  if (clientsError) {
    return NextResponse.json({ error: clientsError.message }, { status: 500 });
  }

  const since7d = new Date(Date.now() - 7 * 86400_000).toISOString();

  for (const client of clients ?? []) {
    try {
      summary.clients_scanned++;

      // Busca interações dos últimos 7 dias para o contato principal
      let interactions: Array<{ channel: string; type: string; occurred_at: string; subject?: string; content?: string; summary?: string }> = [];

      if (client.contact_id) {
        const { data } = await db
          .from("interactions")
          .select("channel, type, occurred_at, subject, summary, content")
          .eq("contact_id", client.contact_id)
          .gte("occurred_at", since7d)
          .order("occurred_at", { ascending: false })
          .limit(20);
        interactions = data ?? [];
      }

      if (interactions.length === 0) continue;

      const interactionsText = interactions
        .map(i => {
          const text = i.subject ?? i.summary ?? (i.content ?? "").slice(0, 300);
          return `[${i.channel}/${i.type}] ${i.occurred_at.slice(0, 10)}: ${text}`;
        })
        .join("\n");

      const response = await aiJson<AIScanResponse>([
        {
          role: "system",
          content: `Você é o assistente operacional do Mario Campello (Pandora Tech).
Analise as interações recentes com o cliente e extraia tarefas implícitas que Mario precisa fazer.
Foque em: follow-ups prometidos mas não executados, perguntas do cliente sem resposta, entregas mencionadas sem prazo formal, ações comerciais urgentes, próximos passos claramente necessários.
Retorne apenas tarefas concretas e acionáveis. Se não houver tarefas claras, retorne uma lista vazia.
Responda em JSON: { "tasks": [...] }`,
        },
        {
          role: "user",
          content: `Cliente: ${client.company_name}
Interações dos últimos 7 dias:
${interactionsText}

Para cada tarefa, retorne:
{
  "title": "verbo no infinitivo, máx 80 chars, em português",
  "priority": "critical|high|medium|low",
  "entity_type": "client",
  "entity_id": "${client.id}",
  "ai_reasoning": "1 frase explicando por que esta tarefa foi identificada",
  "rule_key": "snake_case descrevendo a classe da tarefa (ex: followup_prometido, pergunta_sem_resposta)"
}`,
        },
      ], {
        model: "google/gemini-2.5-flash",
        temperature: 0.3,
        max_tokens: 1000,
      });

      const suggested = response?.tasks ?? [];

      for (const task of suggested) {
        if (!task.title || !task.priority) continue;

        const today = todayStr();
        const dedup = `ai_${task.rule_key ?? "misc"}_${client.id}_${today}`;

        const { created } = await upsertTask(db, {
          title: task.title,
          priority: task.priority,
          source: "ai",
          rule_key: task.rule_key ?? null,
          entity_type: "client",
          entity_id: client.id,
          ai_reasoning: task.ai_reasoning,
          dedup_key: dedup,
        });

        created ? summary.tasks_created++ : summary.tasks_skipped++;

        // Incrementa contagem da regra para detecção de padrões
        if (task.rule_key) {
          await db.rpc("increment_rule_count", { p_rule_key: task.rule_key });
        }
      }
    } catch (e) {
      summary.errors.push(
        `${client.company_name}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  return NextResponse.json(summary);
}
