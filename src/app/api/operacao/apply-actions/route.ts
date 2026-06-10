import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import type { ProposedAction } from "@/lib/types";

interface ApplyRequest {
  client_id: string;
  actions: ProposedAction[];
}

interface ActionResult {
  id: string;
  success: boolean;
  error?: string;
  created_id?: string;
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as ApplyRequest;
  const { client_id, actions } = body;

  if (!client_id || !actions?.length) {
    return NextResponse.json({ error: "client_id e actions são obrigatórios" }, { status: 400 });
  }

  const results: ActionResult[] = [];

  for (const action of actions) {
    try {
      const p = action.payload as Record<string, unknown>;

      switch (action.type) {
        case "create_initiative": {
          const { data, error } = await supabase
            .from("initiatives")
            .insert({
              client_id,
              title: p.title as string,
              description: (p.description as string) ?? null,
              status: (p.status as string) ?? "backlog",
              priority: (p.priority as number) ?? null,
              start_date: (p.start_date as string) ?? null,
              due_date: (p.due_date as string) ?? null,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          results.push({ id: action.id, success: true, created_id: data.id });
          break;
        }

        case "create_task": {
          // If no initiative_id, try to find one by title or create it
          let initiativeId = p.initiative_id as string | undefined;

          if (!initiativeId && p.initiative_title) {
            // Try to find existing initiative by title
            const { data: found } = await supabase
              .from("initiatives")
              .select("id")
              .eq("client_id", client_id)
              .ilike("title", `%${p.initiative_title}%`)
              .limit(1)
              .maybeSingle();

            if (found) {
              initiativeId = found.id;
            } else {
              // Create the initiative
              const { data: created, error: initErr } = await supabase
                .from("initiatives")
                .insert({ client_id, title: p.initiative_title as string, status: "backlog" })
                .select("id")
                .single();
              if (initErr) throw new Error(initErr.message);
              initiativeId = created.id;
            }
          }

          if (!initiativeId) throw new Error("initiative_id ou initiative_title obrigatório");

          // Get max sort_order
          const { data: maxRow } = await supabase
            .from("initiative_tasks")
            .select("sort_order")
            .eq("initiative_id", initiativeId)
            .order("sort_order", { ascending: false })
            .limit(1)
            .maybeSingle();
          const sortOrder = ((maxRow?.sort_order as number) ?? 0) + 1;

          const { data, error } = await supabase
            .from("initiative_tasks")
            .insert({
              initiative_id: initiativeId,
              title: p.title as string,
              status: (p.status as string) ?? "todo",
              assignee: (p.assignee as string) ?? null,
              due_date: (p.due_date as string) ?? null,
              sort_order: sortOrder,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          results.push({ id: action.id, success: true, created_id: data.id });
          break;
        }

        case "update_task": {
          const taskId = p.id as string;
          if (!taskId) throw new Error("id da tarefa obrigatório para update_task");
          const update: Record<string, unknown> = {};
          if (p.title) update.title = p.title;
          if (p.status) update.status = p.status;
          if (p.assignee !== undefined) update.assignee = p.assignee;
          if (p.due_date !== undefined) update.due_date = p.due_date;
          const { error } = await supabase.from("initiative_tasks").update(update).eq("id", taskId);
          if (error) throw new Error(error.message);
          results.push({ id: action.id, success: true });
          break;
        }

        case "update_initiative": {
          const initId = p.id as string;
          if (!initId) throw new Error("id da iniciativa obrigatório para update_initiative");
          const update: Record<string, unknown> = {};
          if (p.title) update.title = p.title;
          if (p.status) update.status = p.status;
          if (p.description !== undefined) update.description = p.description;
          if (p.priority !== undefined) update.priority = p.priority;
          if (p.due_date !== undefined) update.due_date = p.due_date;
          const { error } = await supabase.from("initiatives").update(update).eq("id", initId);
          if (error) throw new Error(error.message);
          results.push({ id: action.id, success: true });
          break;
        }

        case "add_deliverable": {
          const month = (p.month as string) ?? new Date().toISOString().substring(0, 7) + "-01";
          const { data, error } = await supabase
            .from("deliverables")
            .insert({
              client_id,
              month,
              title: p.title as string,
              done: (p.done as boolean) ?? false,
              notes: (p.notes as string) ?? null,
              due_date: (p.due_date as string) ?? null,
            })
            .select("id")
            .single();
          if (error) throw new Error(error.message);
          results.push({ id: action.id, success: true, created_id: data.id });
          break;
        }

        default:
          results.push({ id: action.id, success: false, error: `Tipo de ação desconhecido: ${action.type}` });
      }
    } catch (err) {
      results.push({ id: action.id, success: false, error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
