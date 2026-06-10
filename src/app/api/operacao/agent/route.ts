import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { aiJson, type AIMessage } from "@/lib/ai";
import type { Initiative, Deliverable, ProposedAction } from "@/lib/types";

const SYSTEM_PROMPT = `Você é o Pandora Ops, assistente de operações de Mario Campello na Pandora Tech LTDA.

Mario entrega consultoria, automações e agentes de IA para empresas. Você ajuda a manter o roadmap de cada cliente atualizado com base em reuniões, transcrições e comandos diretos.

## Sua função

Ao receber uma transcrição de reunião, mensagem ou instrução:
1. Identifique menções a tarefas, entregas, problemas ou mudanças de prioridade
2. Proponha ações concretas e específicas com justificativa clara
3. **NUNCA aplique diretamente** — apenas proponha. Mario revisa e decide o que aplicar.

## Tipos de ações que você pode propor

- **create_initiative**: Nova iniciativa (projeto/tema de trabalho) para o cliente
- **create_task**: Nova tarefa dentro de uma iniciativa existente ou nova
- **update_task**: Atualizar status/título de tarefa existente (forneça o id da tarefa)
- **update_initiative**: Atualizar status/título de iniciativa existente (forneça o id)
- **add_deliverable**: Registrar entrega mensal para o cliente

## Formato de resposta

Retorne SEMPRE um JSON válido com este formato exato:
{
  "reply": "Resposta conversacional para Mario (markdown permitido)",
  "proposed_actions": [
    {
      "id": "acao-1",
      "type": "create_task",
      "description": "Criar tarefa: Implementar autenticação OAuth",
      "reasoning": "Na reunião foi mencionado: 'precisamos resolver o login na próxima semana'",
      "payload": {
        "initiative_id": "uuid-se-souber",
        "initiative_title": "Nome da iniciativa (se não souber o id)",
        "title": "Implementar autenticação OAuth",
        "status": "todo"
      }
    }
  ]
}

## Regras importantes

- Se não houver ações claras a propor, retorne "proposed_actions": []
- Para update_task e update_initiative, inclua sempre o "id" no payload
- Para create_task, prefira vincular a uma iniciativa existente pelo id; se não existir, informe o initiative_title
- Seja preciso e objetivo — uma ação por item identificado
- Cite o trecho exato que motivou cada ação no campo "reasoning"
- Responda sempre em português brasileiro`;

interface AgentRequest {
  client_id: string;
  messages: { role: "user" | "assistant"; content: string }[];
  context?: {
    initiatives?: Initiative[];
    recent_meetings?: { id: string; subject?: string; content?: string; occurred_at: string; channel?: string }[];
    deliverables?: Deliverable[];
  };
}

interface AgentResponse {
  reply: string;
  proposed_actions: ProposedAction[];
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as AgentRequest;
  const { client_id, messages, context } = body;

  if (!client_id || !messages?.length) {
    return NextResponse.json({ error: "client_id e messages são obrigatórios" }, { status: 400 });
  }

  // Build context block for the AI
  let contextBlock = "";

  if (context?.initiatives?.length) {
    contextBlock += "\n## Iniciativas atuais do cliente\n";
    for (const init of context.initiatives) {
      contextBlock += `\n### [${init.status.toUpperCase()}] ${init.title} (id: ${init.id})\n`;
      if (init.tasks?.length) {
        for (const task of init.tasks) {
          contextBlock += `  - [${task.status}] ${task.title} (id: ${task.id})\n`;
        }
      } else {
        contextBlock += "  (sem tarefas)\n";
      }
    }
  }

  if (context?.deliverables?.length) {
    contextBlock += "\n## Entregas do mês atual\n";
    for (const d of context.deliverables) {
      contextBlock += `  - [${d.done ? "✓" : "○"}] ${d.title}\n`;
    }
  }

  if (context?.recent_meetings?.length) {
    contextBlock += "\n## Reuniões/Interações recentes\n";
    for (const m of context.recent_meetings) {
      const date = new Date(m.occurred_at).toLocaleDateString("pt-BR");
      const channel = m.channel ? ` (${m.channel})` : "";
      contextBlock += `\n### ${m.subject ?? "Reunião"} — ${date}${channel}\n`;
      if (m.content) {
        contextBlock += m.content.substring(0, 2000);
        if (m.content.length > 2000) contextBlock += "\n[...trecho inicial da transcrição]";
        contextBlock += "\n";
      }
    }
  }

  const aiMessages: AIMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  // Inject context as first user/assistant exchange if we have it
  if (contextBlock) {
    aiMessages.push({
      role: "user",
      content: `[CONTEXTO DO CLIENTE]\n${contextBlock}`,
    });
    aiMessages.push({
      role: "assistant",
      content: "Contexto recebido. Pode me enviar uma transcrição, instrução ou pedir análise das reuniões.",
    });
  }

  aiMessages.push(...messages);

  let result: AgentResponse;
  try {
    result = await aiJson<AgentResponse>(aiMessages, {
      model: "anthropic/claude-sonnet-4-5",
      temperature: 0.2,
      max_tokens: 4000,
    });
  } catch {
    return NextResponse.json({ error: "Erro ao processar resposta do agente" }, { status: 500 });
  }

  // Ensure proposed_actions is always an array
  if (!Array.isArray(result.proposed_actions)) result.proposed_actions = [];

  // Assign stable ids if missing
  result.proposed_actions = result.proposed_actions.map((a, i) => ({
    ...a,
    id: a.id ?? `action-${Date.now()}-${i}`,
  }));

  return NextResponse.json(result);
}
