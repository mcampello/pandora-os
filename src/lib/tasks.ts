// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = import("@supabase/supabase-js").SupabaseClient<any, any, any>;

export type TaskPriority = "critical" | "high" | "medium" | "low";
export type TaskStatus   = "open" | "done" | "dismissed";
export type TaskSource   = "manual" | "rule" | "ai";
export type TaskEntityType = "contact" | "client" | "opportunity" | "proposal" | "deliverable";

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  source: TaskSource;
  rule_key?: string | null;
  entity_type?: TaskEntityType | null;
  entity_id?: string | null;
  ai_reasoning?: string | null;
  dedup_key?: string | null;
  due_at?: string | null;
  done_at?: string | null;
  dismissed_at?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaskRule {
  id: string;
  rule_key: string;
  label: string;
  description?: string | null;
  active: boolean;
  source: string;
  ai_generation_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TaskInsert {
  title: string;
  priority: TaskPriority;
  source: TaskSource;
  dedup_key: string;
  rule_key?: string;
  entity_type?: TaskEntityType;
  entity_id?: string;
  ai_reasoning?: string;
  due_at?: string;
  metadata?: Record<string, unknown>;
}

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function sortByPriority(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const diff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
    if (diff !== 0) return diff;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

export async function upsertTask(
  supabase: AnySupabaseClient,
  payload: TaskInsert
): Promise<{ created: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from("tasks")
    .upsert(
      { ...payload, status: "open" },
      { onConflict: "dedup_key", ignoreDuplicates: true }
    )
    .select("id");

  if (error) return { created: false, error: error.message };
  return { created: (data?.length ?? 0) > 0, error: null };
}

// Verifica se já existe tarefa aberta para o mesmo dedup_key
export async function taskExists(
  supabase: AnySupabaseClient,
  dedup_key: string
): Promise<boolean> {
  const { count } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("dedup_key", dedup_key)
    .eq("status", "open");
  return (count ?? 0) > 0;
}

// Retorna a semana ISO no formato YYYY-WXX
export function isoWeek(date: Date = new Date()): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  const weekNum = 1 + Math.round(
    ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
  );
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function monthStr(): string {
  return new Date().toISOString().slice(0, 7);
}
