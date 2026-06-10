import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [
    { count: clients_active },
    { count: opportunities_open },
    { count: proposals_pending },
    { data: activeClients },
    { data: criticalTasks },
    { data: recentActivity },
  ] = await Promise.all([
    supabase.from("clients").select("*", { count: "exact", head: true }).eq("status", "active"),
    supabase.from("opportunities").select("*", { count: "exact", head: true }).in("status", ["new", "qualified"]),
    supabase.from("proposals").select("*", { count: "exact", head: true }).in("status", ["draft", "sent", "viewed"]),
    supabase.from("clients").select("monthly_fee").eq("status", "active"),
    supabase
      .from("initiative_tasks")
      .select("id, title, status, due_date, initiative:initiatives(title, client:clients(company_name))")
      .in("status", ["todo", "in_progress", "blocked"])
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(5),
    supabase
      .from("interactions")
      .select("id, channel, type, subject, summary, occurred_at, contact:contacts(name)")
      .order("occurred_at", { ascending: false })
      .limit(6),
  ]);

  const revenue_monthly = (activeClients ?? []).reduce(
    (sum, c) => sum + (c.monthly_fee ?? 0),
    0
  );

  return NextResponse.json({
    clients_active: clients_active ?? 0,
    opportunities_open: opportunities_open ?? 0,
    proposals_pending: proposals_pending ?? 0,
    revenue_monthly,
    tasks_critical: criticalTasks ?? [],
    recent_activity: recentActivity ?? [],
  });
}
