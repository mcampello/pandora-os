"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Plus, Sparkles, AlertCircle } from "lucide-react";
import type { Task, TaskRule, TaskPriority } from "@/lib/tasks";
import TaskBell from "@/components/TaskBell";

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; color: string; bg: string }> = {
  critical: { label: "Crítico",  color: "#dc2626", bg: "rgba(220,38,38,0.08)" },
  high:     { label: "Alto",     color: "#d97706", bg: "rgba(217,119,6,0.08)" },
  medium:   { label: "Médio",    color: "#7A1CB5", bg: "rgba(122,28,181,0.08)" },
  low:      { label: "Baixo",    color: "#6b7280", bg: "rgba(107,114,128,0.06)" },
};

const SOURCE_BADGE: Record<string, { label: string; cls: string }> = {
  ai:     { label: "IA",     cls: "pda-badge-violet" },
  rule:   { label: "Regra",  cls: "pda-badge-success" },
  manual: { label: "Manual", cls: "pda-badge-warning" },
};

function entityLink(task: Task): { href: string; label: string } | null {
  if (!task.entity_id || !task.entity_type) return null;
  switch (task.entity_type) {
    case "contact":     return { href: `/clientes/${task.entity_id}`, label: "Ver contato" };
    case "client":      return { href: `/operacao?client=${task.entity_id}`, label: "Ver cliente" };
    case "opportunity": return { href: `/oportunidades/${task.entity_id}`, label: "Ver oportunidade" };
    case "proposal":    return { href: `/propostas`, label: "Ver proposta" };
    case "deliverable": return { href: `/operacao`, label: "Ver entrega" };
    default: return null;
  }
}

function TaskRow({ task, onUpdate }: { task: Task; onUpdate: () => void }) {
  const [loading, setLoading] = useState(false);
  const [exiting, setExiting] = useState(false);
  const link = entityLink(task);
  const srcBadge = SOURCE_BADGE[task.source] ?? SOURCE_BADGE.manual;
  const isOverdue = task.due_at && new Date(task.due_at) < new Date();

  async function update(status: "done" | "dismissed") {
    setLoading(true);
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setExiting(true);
    setTimeout(onUpdate, 320);
  }

  const cfg = PRIORITY_CONFIG[task.priority];

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "9px 0",
      borderBottom: "1px solid var(--pandora-ink-100)",
      overflow: "hidden",
      maxHeight: exiting ? 0 : 80,
      opacity: exiting ? 0 : 1,
      transform: exiting ? "translateX(24px)" : "translateX(0)",
      transition: exiting ? "max-height 0.3s ease, opacity 0.25s ease, transform 0.25s ease, padding 0.3s ease" : "none",
      paddingTop: exiting ? 0 : undefined,
      paddingBottom: exiting ? 0 : undefined,
    }}>
      <span style={{
        width: 3, height: 32, borderRadius: 2, flexShrink: 0,
        background: cfg.color, opacity: 0.7,
      }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, color: "var(--pandora-ink-800)", fontWeight: 500 }}>
            {task.title}
          </span>
          <span className={`pda-badge ${srcBadge.cls}`} style={{ fontSize: 10 }}>
            {srcBadge.label}
          </span>
          <span style={{ fontSize: 10, fontFamily: "var(--font-display)", color: cfg.color, textTransform: "uppercase", letterSpacing: "0.08em", opacity: 0.8 }}>
            {cfg.label}
          </span>
          {link && (
            <Link href={link.href} style={{ fontSize: 11, color: "var(--pandora-violet-500)", textDecoration: "none" }}>
              {link.label} →
            </Link>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {task.due_at && (
            <span style={{
              fontSize: 11, fontFamily: "var(--font-mono)",
              color: isOverdue ? "var(--pandora-amber-500)" : "var(--pandora-ink-400)"
            }}>
              {isOverdue ? "⚠ " : ""}
              {new Date(task.due_at).toLocaleDateString("pt-BR")}
            </span>
          )}
          {task.ai_reasoning && (
            <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontStyle: "italic", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>
              {task.ai_reasoning}
            </span>
          )}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        <button
          onClick={() => update("done")}
          disabled={loading || exiting}
          title="Concluir"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--pandora-green-400)", opacity: loading || exiting ? 0.4 : 1 }}
        >
          <CheckCircle2 size={18} strokeWidth={1.5} />
        </button>
        <button
          onClick={() => update("dismissed")}
          disabled={loading || exiting}
          title="Dispensar"
          style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "var(--pandora-ink-400)", opacity: loading || exiting ? 0.4 : 1 }}
        >
          <XCircle size={18} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

function PromotionBanner({ rules, onDismiss }: { rules: TaskRule[]; onDismiss: () => void }) {
  if (rules.length === 0) return null;
  const rule = rules[0];

  return (
    <div className="pda-card" style={{ borderColor: "var(--pandora-amber-400)", background: "rgba(255,180,0,0.05)", display: "flex", alignItems: "flex-start", gap: 12 }}>
      <Sparkles size={16} color="var(--pandora-amber-500)" style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <span style={{ fontSize: 13, color: "var(--pandora-ink-700)" }}>
          A IA criou <strong>{rule.ai_generation_count}</strong> tarefas do tipo{" "}
          <strong>&ldquo;{rule.label || rule.rule_key}&rdquo;</strong> recentemente.
          Ativar como regra automática?
        </span>
      </div>
      <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
        <button className="pda-btn" style={{ fontSize: 12, padding: "4px 12px" }}
          onClick={async () => {
            await fetch(`/api/tasks/rules/${rule.rule_key}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: true }) });
            onDismiss();
          }}>
          Ativar
        </button>
        <button className="pda-btn pda-btn-ghost" style={{ fontSize: 12, padding: "4px 12px" }} onClick={onDismiss}>
          Ignorar
        </button>
      </div>
    </div>
  );
}

export default function TarefasPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [flaggedRules, setFlaggedRules] = useState<TaskRule[]>([]);
  const [statusFilter, setStatusFilter] = useState<"open" | "done">("open");
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newPriority, setNewPriority] = useState<TaskPriority>("medium");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [tasksRes, rulesRes] = await Promise.all([
      fetch(`/api/tasks?status=${statusFilter}`),
      fetch("/api/tasks/rules?flagged=true"),
    ]);
    if (tasksRes.ok) setTasks(await tasksRes.json());
    if (rulesRes.ok) setFlaggedRules(await rulesRes.json());
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  async function createTask() {
    if (!newTitle.trim()) return;
    setSaving(true);
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newTitle.trim(), priority: newPriority, source: "manual" }),
    });
    setNewTitle("");
    setShowNewForm(false);
    setSaving(false);
    load();
  }

  const PRIORITY_ORDER: TaskPriority[] = ["critical", "high", "medium", "low"];
  const sorted = [...tasks].sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
  );

  const total = tasks.length;

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Tarefas</h1>
          <span className="pda-chip">{total} {statusFilter === "open" ? "abertas" : "concluídas"}</span>
        </div>
        <div className="pda-topbar-right" style={{ gap: 8 }}>
          <div style={{ display: "flex", border: "1px solid var(--pandora-ink-200)", borderRadius: 8, overflow: "hidden" }}>
            {(["open", "done"] as const).map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: "5px 14px", fontSize: 12, border: "none", cursor: "pointer",
                background: statusFilter === s ? "var(--pandora-violet-600)" : "transparent",
                color: statusFilter === s ? "#fff" : "var(--pandora-ink-500)",
                fontFamily: "var(--font-display)",
              }}>
                {s === "open" ? "Abertas" : "Concluídas"}
              </button>
            ))}
          </div>
          <button className="pda-btn" style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setShowNewForm(v => !v)}>
            <Plus size={14} /> Nova tarefa
          </button>
          <TaskBell />
        </div>
      </header>

      <div className="pda-content" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Promoção de regra */}
        {flaggedRules.length > 0 && (
          <PromotionBanner rules={flaggedRules} onDismiss={() => { setFlaggedRules([]); load(); }} />
        )}

        {/* Form nova tarefa */}
        {showNewForm && (
          <div className="pda-card" style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createTask()}
              placeholder="Título da tarefa..."
              style={{
                flex: 1, border: "1px solid var(--pandora-ink-200)", borderRadius: 8,
                padding: "7px 12px", fontSize: 13, fontFamily: "var(--font-text)",
                outline: "none",
              }}
            />
            <select
              value={newPriority}
              onChange={e => setNewPriority(e.target.value as TaskPriority)}
              style={{ border: "1px solid var(--pandora-ink-200)", borderRadius: 8, padding: "7px 10px", fontSize: 12, fontFamily: "var(--font-display)" }}
            >
              {(["critical", "high", "medium", "low"] as TaskPriority[]).map(p => (
                <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>
              ))}
            </select>
            <button className="pda-btn" onClick={createTask} disabled={saving || !newTitle.trim()}>
              Criar
            </button>
            <button className="pda-btn pda-btn-ghost" onClick={() => setShowNewForm(false)}>
              Cancelar
            </button>
          </div>
        )}

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--pandora-ink-400)", fontSize: 13 }}>
            Carregando tarefas…
          </div>
        )}

        {!loading && total === 0 && (
          <div className="pda-empty">
            <AlertCircle size={32} strokeWidth={1} />
            <p style={{ fontFamily: "var(--font-display)", fontSize: 14, marginTop: 8 }}>
              {statusFilter === "open" ? "Nenhuma tarefa aberta" : "Nenhuma tarefa concluída"}
            </p>
            <p style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>
              {statusFilter === "open" ? "Os agentes criam tarefas automaticamente. Você também pode criar manualmente." : ""}
            </p>
          </div>
        )}

        {!loading && sorted.length > 0 && (
          <div className="pda-card" style={{ padding: "0 16px" }}>
            {sorted.map(t => <TaskRow key={t.id} task={t} onUpdate={load} />)}
          </div>
        )}
      </div>
    </>
  );
}
