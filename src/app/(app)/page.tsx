"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Users, Zap, FileText, Wallet, Clock, CheckSquare, AlertCircle } from "lucide-react";
import TaskBell from "@/components/TaskBell";
import type { Task } from "@/lib/tasks";

const PRIORITY_DOT: Record<string, string> = {
  critical: "#dc2626",
  high:     "#d97706",
  medium:   "#7A1CB5",
  low:      "#9ca3af",
};

interface DashStats {
  clients_active: number;
  opportunities_open: number;
  proposals_pending: number;
  revenue_monthly: number;
}

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [dash, setDash] = useState<DashStats | null>(null);

  useEffect(() => {
    fetch("/api/tasks?status=open&limit=5")
      .then(r => r.ok ? r.json() : [])
      .then(setTasks)
      .finally(() => setLoadingTasks(false));
  }, []);

  useEffect(() => {
    fetch("/api/dashboard")
      .then(r => r.ok ? r.json() : null)
      .then(setDash)
      .catch(() => {});
  }, []);

  const criticalCount = tasks.filter(t => t.priority === "critical").length;
  const highCount     = tasks.filter(t => t.priority === "high").length;

  const stats = [
    {
      label: "Clientes ativos",
      value: dash ? String(dash.clients_active) : "—",
      sub: dash ? `${dash.clients_active} ativo${dash.clients_active !== 1 ? "s" : ""}` : "carregando",
      icon: Users, dot: dash && dash.clients_active > 0 ? "pda-dot-green" : "pda-dot-gray",
    },
    {
      label: "Oportunidades",
      value: dash ? String(dash.opportunities_open) : "—",
      sub: dash ? (dash.opportunities_open === 0 ? "nenhuma detectada" : "em aberto") : "carregando",
      icon: Zap, dot: dash && dash.opportunities_open > 0 ? "pda-dot-green" : "pda-dot-gray",
    },
    {
      label: "Propostas abertas",
      value: dash ? String(dash.proposals_pending) : "—",
      sub: dash ? (dash.proposals_pending === 0 ? "nenhuma pendente" : "aguardando resposta") : "carregando",
      icon: FileText, dot: dash && dash.proposals_pending > 0 ? "pda-dot-amber" : "pda-dot-gray",
    },
    {
      label: "Receita mensal",
      value: dash ? (dash.revenue_monthly > 0 ? `R$ ${dash.revenue_monthly.toLocaleString("pt-BR")}` : "R$ 0") : "—",
      sub: dash ? "soma dos clientes ativos" : "carregando",
      icon: Wallet, dot: dash && dash.revenue_monthly > 0 ? "pda-dot-green" : "pda-dot-amber",
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
                <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--pandora-violet-900)", lineHeight: 1 }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {[
                { time: "Agora",    text: "Sistema inicializado",              type: "system" },
                { time: "Em breve", text: "Monitoramento WhatsApp conectado",  type: "pending" },
                { time: "Em breve", text: "Email mario@ sincronizado",         type: "pending" },
              ].map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  padding: "10px 0",
                  borderBottom: i < 2 ? "1px solid var(--pandora-ink-100)" : "none"
                }}>
                  <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", marginTop: 1 }}>
                    {item.time}
                  </span>
                  <span style={{ fontSize: 13, color: item.type === "system" ? "var(--pandora-violet-800)" : "var(--pandora-ink-400)" }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
