import { Users, Zap, FileText, Wallet, Clock, AlertCircle } from "lucide-react";
import { supabaseServer } from "@/lib/supabase-server";

interface DashboardData {
  clients_active: number;
  opportunities_open: number;
  proposals_pending: number;
  revenue_monthly: number;
  tasks_critical: Array<{
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    initiative: { title: string; client: { company_name: string } | null } | null;
  }>;
  recent_activity: Array<{
    id: string;
    channel: string;
    type: string;
    subject: string | null;
    summary: string | null;
    occurred_at: string;
    contact: { name: string } | null;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  todo: "a fazer",
  in_progress: "em progresso",
  blocked: "bloqueada",
};

const STATUS_DOT: Record<string, string> = {
  todo: "pda-dot-gray",
  in_progress: "pda-dot-green",
  blocked: "pda-dot-amber",
};

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Agora";
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h atrás`;
  const d = Math.floor(h / 24);
  return `${d}d atrás`;
}

export default async function DashboardPage() {
  let data: DashboardData | null = null;
  try {
    const supabase = await supabaseServer();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
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
      const revenue_monthly = (activeClients ?? []).reduce((sum, c) => sum + (c.monthly_fee ?? 0), 0);
      data = {
        clients_active: clients_active ?? 0,
        opportunities_open: opportunities_open ?? 0,
        proposals_pending: proposals_pending ?? 0,
        revenue_monthly,
        tasks_critical: (criticalTasks ?? []) as unknown as DashboardData["tasks_critical"],
        recent_activity: (recentActivity ?? []) as unknown as DashboardData["recent_activity"],
      };
    }
  } catch {
    // silently degrade — mostra fallback
  }

  const stats = [
    {
      label: "Clientes ativos",
      value: data ? String(data.clients_active) : "—",
      sub: data ? `de ${data.clients_active} ativos` : "carregando...",
      icon: Users,
      dot: data && data.clients_active > 0 ? "pda-dot-green" : "pda-dot-gray",
    },
    {
      label: "Oportunidades",
      value: data ? String(data.opportunities_open) : "—",
      sub: data ? (data.opportunities_open === 0 ? "nenhuma detectada" : "em aberto") : "carregando...",
      icon: Zap,
      dot: data && data.opportunities_open > 0 ? "pda-dot-green" : "pda-dot-gray",
    },
    {
      label: "Propostas abertas",
      value: data ? String(data.proposals_pending) : "—",
      sub: data ? (data.proposals_pending === 0 ? "nenhuma pendente" : "aguardando resposta") : "carregando...",
      icon: FileText,
      dot: data && data.proposals_pending > 0 ? "pda-dot-amber" : "pda-dot-gray",
    },
    {
      label: "Receita mensal",
      value: data
        ? data.revenue_monthly > 0
          ? `R$ ${data.revenue_monthly.toLocaleString("pt-BR")}`
          : "R$ 0"
        : "—",
      sub: data ? "soma dos clientes ativos" : "carregando...",
      icon: Wallet,
      dot: data && data.revenue_monthly > 0 ? "pda-dot-green" : "pda-dot-amber",
    },
  ];

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Dashboard</h1>
          <span className="pda-chip">Pandora OS</span>
        </div>
        <div className="pda-topbar-right">
          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--pandora-ink-400)" }}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
          <TaskBell />
        </div>
      </header>

      <div className="pda-content">
        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
          {stats.map(({ label, value, sub, icon: Icon, dot }) => (
            <div key={label} className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="pda-eyebrow">{label}</span>
                <div style={{ color: "var(--pandora-violet-400)", opacity: 0.7 }}>
                  <Icon size={16} strokeWidth={1.5} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 600, color: "var(--pandora-violet-900)", lineHeight: 1 }}>
                  {value}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className={`pda-dot ${dot}`} />
                <span style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>{sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Two columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Resumo de tarefas por prioridade */}
          <div className="pda-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CheckSquare size={14} color="var(--pandora-violet-500)" strokeWidth={1.5} />
                <span className="pda-eyebrow">Tarefas</span>
              </div>
              <Link href="/tarefas" style={{ fontSize: 11, color: "var(--pandora-violet-500)", textDecoration: "none", fontFamily: "var(--font-display)" }}>
                Ver todas →
              </Link>
            </div>

            {loadingTasks ? (
              <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", padding: "8px 0" }}>Carregando…</div>
            ) : tasks.length === 0 ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "16px 0", color: "var(--pandora-ink-400)" }}>
                <AlertCircle size={24} strokeWidth={1} />
                <span style={{ fontSize: 12 }}>Nenhuma tarefa aberta</span>
              </div>
            ) : (
              <>
                {/* Resumo de contadores */}
                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  {criticalCount > 0 && (
                    <span style={{ fontSize: 11, background: "rgba(220,38,38,0.1)", color: "#dc2626", borderRadius: 6, padding: "2px 8px", fontFamily: "var(--font-mono)" }}>
                      {criticalCount} crítica{criticalCount > 1 ? "s" : ""}
                    </span>
                  )}
                  {highCount > 0 && (
                    <span style={{ fontSize: 11, background: "rgba(217,119,6,0.1)", color: "#d97706", borderRadius: 6, padding: "2px 8px", fontFamily: "var(--font-mono)" }}>
                      {highCount} alta{highCount > 1 ? "s" : ""}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)" }}>
                    {tasks.length} total abertas
                  </span>
                </div>

                {/* Top 5 tarefas */}
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {tasks.slice(0, 5).map((task, i) => (
                    <div key={task.id} style={{
                      display: "flex", gap: 10, alignItems: "flex-start",
                      padding: "8px 0",
                      borderBottom: i < Math.min(tasks.length, 5) - 1 ? "1px solid var(--pandora-ink-100)" : "none",
                    }}>
                      <div style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: PRIORITY_DOT[task.priority] ?? "#9ca3af",
                        marginTop: 5, flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, color: "var(--pandora-ink-700)", lineHeight: 1.4 }}>
                        {task.title}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Atividade recente */}
          <div className="pda-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Clock size={14} color="var(--pandora-violet-500)" strokeWidth={1.5} />
              <span className="pda-eyebrow">Atividade recente</span>
            </div>
            {data && data.recent_activity.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {data.recent_activity.map((item, i) => (
                  <div key={item.id} style={{
                    display: "flex", gap: 12, alignItems: "flex-start",
                    padding: "10px 0",
                    borderBottom: i < data!.recent_activity.length - 1 ? "1px solid var(--pandora-ink-100)" : "none"
                  }}>
                    <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", marginTop: 1 }}>
                      {formatRelative(item.occurred_at)}
                    </span>
                    <span style={{ fontSize: 13, color: "var(--pandora-violet-800)" }}>
                      {item.contact?.name && <strong>{item.contact.name} · </strong>}
                      {item.subject ?? item.summary ?? item.type}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="pda-empty">Nenhuma interação registrada ainda.</p>
            )}
          </div>

          {/* Critical tasks */}
          <div className="pda-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <AlertCircle size={14} color="var(--pandora-violet-500)" strokeWidth={1.5} />
              <span className="pda-eyebrow">Tarefas em aberto</span>
            </div>
            {data && data.tasks_critical.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {data.tasks_critical.map((task, i) => (
                  <div key={task.id} style={{
                    display: "flex", alignItems: "flex-start", gap: 10,
                    padding: "10px 0",
                    borderBottom: i < data!.tasks_critical.length - 1 ? "1px solid var(--pandora-ink-100)" : "none"
                  }}>
                    <span className={`pda-dot ${STATUS_DOT[task.status] ?? "pda-dot-gray"}`} style={{ marginTop: 5, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, color: "var(--pandora-violet-800)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {task.title}
                      </span>
                      <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)" }}>
                        {task.initiative?.client?.company_name ?? task.initiative?.title ?? ""} · {STATUS_LABEL[task.status] ?? task.status}
                      </span>
                    </div>
                    {task.due_date && (
                      <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", flexShrink: 0 }}>
                        {new Date(task.due_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="pda-empty">Nenhuma tarefa em aberto.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
