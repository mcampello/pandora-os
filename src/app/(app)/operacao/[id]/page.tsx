"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, Trash2, Heart, Clock, Video,
  ChevronDown, ChevronRight, X, Check, MoreHorizontal,
  AlertCircle, Loader2, Pencil,
} from "lucide-react";
import type { Client, Initiative, InitiativeTask, InitiativeStatus, InitiativeTaskStatus } from "@/lib/types";
import { formatBRL } from "@/lib/docs";

// ── constants ─────────────────────────────────────────────────────────────

const KANBAN_COLUMNS: { id: InitiativeStatus; label: string; color: string }[] = [
  { id: "backlog",  label: "Backlog",       color: "var(--pandora-ink-300)" },
  { id: "active",   label: "Em andamento",  color: "var(--pandora-violet-600)" },
  { id: "paused",   label: "Pausado",       color: "#f59e0b" },
  { id: "done",     label: "Concluído",     color: "var(--pandora-green-400)" },
];

const TASK_STATUS_META: Record<InitiativeTaskStatus, { label: string; color: string; bg: string }> = {
  todo:        { label: "A fazer",      color: "var(--pandora-ink-500)",  bg: "var(--pandora-ink-100)" },
  in_progress: { label: "Em andamento", color: "var(--pandora-violet-600)", bg: "rgba(122,28,181,0.1)" },
  blocked:     { label: "Bloqueado",    color: "#ef4444",                bg: "rgba(239,68,68,0.1)" },
  done:        { label: "Concluído",    color: "var(--pandora-green-400)", bg: "rgba(45,212,160,0.1)" },
};

const TASK_STATUSES: InitiativeTaskStatus[] = ["todo", "in_progress", "blocked", "done"];

function healthColor(score?: number | null) {
  if (!score) return "var(--pandora-ink-300)";
  if (score >= 8) return "var(--pandora-green-400)";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
}

function hoursColor(logged: number, target?: number | null) {
  if (!target) return "var(--pandora-ink-300)";
  const pct = logged / target;
  if (pct >= 0.8) return "var(--pandora-green-400)";
  if (pct >= 0.4) return "#f59e0b";
  return "var(--pandora-ink-300)";
}

// ── types ──────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  subject?: string;
  content?: string;
  occurred_at: string;
  external_url?: string;
}

// ── sub-components ─────────────────────────────────────────────────────────

function TaskRow({
  task,
  onStatusChange,
  onDelete,
  onTitleEdit,
}: {
  task: InitiativeTask;
  onStatusChange: (id: string, status: InitiativeTaskStatus) => void;
  onDelete: (id: string) => void;
  onTitleEdit: (id: string, title: string) => void;
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const meta = TASK_STATUS_META[task.status];
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showMenu]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== task.title) onTitleEdit(task.id, trimmed);
    setEditing(false);
  }

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 10px",
      background: "var(--pandora-ink-50)",
      borderRadius: 6,
      border: "1px solid var(--pandora-ink-100)",
    }}>
      {/* status badge */}
      <button
        onClick={() => setShowMenu(v => !v)}
        style={{
          flexShrink: 0, fontSize: 10, fontWeight: 700, padding: "2px 7px",
          borderRadius: 20, border: "none", cursor: "pointer",
          background: meta.bg, color: meta.color,
          fontFamily: "var(--font-chakra)", whiteSpace: "nowrap",
          position: "relative",
        }}
        title="Mudar status"
      >
        {meta.label}
        {showMenu && (
          <div ref={menuRef} style={{
            position: "absolute", top: "110%", left: 0, zIndex: 50,
            background: "var(--pandora-ink-0)", border: "1px solid var(--pandora-ink-200)",
            borderRadius: 8, overflow: "hidden", minWidth: 130,
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          }}>
            {TASK_STATUSES.map(s => {
              const m = TASK_STATUS_META[s];
              return (
                <button key={s}
                  onClick={e => { e.stopPropagation(); onStatusChange(task.id, s); setShowMenu(false); }}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "7px 12px", background: "none", border: "none",
                    cursor: "pointer", fontSize: 12, color: m.color,
                    fontWeight: task.status === s ? 700 : 400,
                  }}>
                  {m.label}
                </button>
              );
            })}
          </div>
        )}
      </button>

      {/* title */}
      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") { setDraft(task.title); setEditing(false); } }}
          style={{
            flex: 1, padding: "2px 6px", borderRadius: 4,
            border: "1px solid var(--pandora-violet-600)",
            background: "var(--pandora-ink-0)", fontSize: 13,
          }}
        />
      ) : (
        <span
          onDoubleClick={() => { setDraft(task.title); setEditing(true); }}
          style={{
            flex: 1, fontSize: 13,
            textDecoration: task.status === "done" ? "line-through" : "none",
            color: task.status === "done" ? "var(--pandora-ink-400)" : "var(--pandora-ink-800)",
            cursor: "text",
          }}
        >
          {task.title}
        </span>
      )}

      {task.assignee && (
        <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", flexShrink: 0 }}>
          {task.assignee}
        </span>
      )}

      <button
        onClick={() => { setDraft(task.title); setEditing(true); }}
        style={{ flexShrink: 0, padding: 3, background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-300)", opacity: 0.6 }}
        title="Editar"
      >
        <Pencil size={11} />
      </button>

      <button
        onClick={() => onDelete(task.id)}
        style={{ flexShrink: 0, padding: 3, background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-300)" }}
        title="Remover"
      >
        <X size={12} />
      </button>
    </div>
  );
}

function InitiativeCard({
  initiative,
  onStatusChange,
  onDelete,
  onTitleEdit,
  onDescEdit,
  onAddTask,
  onTaskStatusChange,
  onTaskDelete,
  onTaskTitleEdit,
}: {
  initiative: Initiative;
  onStatusChange: (id: string, status: InitiativeStatus) => void;
  onDelete: (id: string) => void;
  onTitleEdit: (id: string, title: string) => void;
  onDescEdit: (id: string, description: string) => void;
  onAddTask: (initiativeId: string, title: string) => void;
  onTaskStatusChange: (taskId: string, status: InitiativeTaskStatus) => void;
  onTaskDelete: (taskId: string, initiativeId: string) => void;
  onTaskTitleEdit: (taskId: string, title: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [addingTask, setAddingTask] = useState(false);
  const [newTask, setNewTask] = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(initiative.title);
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement>(null);
  const tasks = initiative.tasks ?? [];
  const done = tasks.filter(t => t.status === "done").length;

  useEffect(() => {
    if (!showStatusMenu) return;
    function close(e: MouseEvent) {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) setShowStatusMenu(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [showStatusMenu]);

  function commitTitle() {
    const t = titleDraft.trim();
    if (t && t !== initiative.title) onTitleEdit(initiative.id, t);
    setEditingTitle(false);
  }

  function submitTask() {
    const t = newTask.trim();
    if (!t) return;
    onAddTask(initiative.id, t);
    setNewTask("");
    setAddingTask(false);
  }

  const colMeta = KANBAN_COLUMNS.find(c => c.id === initiative.status)!;

  return (
    <div style={{
      background: "var(--pandora-ink-0)",
      border: "1.5px solid var(--pandora-ink-100)",
      borderRadius: 12, overflow: "hidden",
      marginBottom: 10,
    }}>
      {/* card header */}
      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => setExpanded(v => !v)}
            style={{ padding: 0, background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", flexShrink: 0 }}
          >
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>

          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === "Enter") commitTitle(); if (e.key === "Escape") { setTitleDraft(initiative.title); setEditingTitle(false); } }}
              style={{
                flex: 1, padding: "2px 6px", borderRadius: 4,
                border: "1px solid var(--pandora-violet-600)",
                background: "var(--pandora-ink-50)", fontSize: 14, fontWeight: 600,
              }}
            />
          ) : (
            <span
              onDoubleClick={() => { setTitleDraft(initiative.title); setEditingTitle(true); }}
              style={{ flex: 1, fontSize: 14, fontWeight: 600, fontFamily: "var(--font-chakra)", cursor: "text" }}
            >
              {initiative.title}
            </span>
          )}

          {/* status chip */}
          <div style={{ position: "relative", flexShrink: 0 }} ref={statusMenuRef}>
            <button
              onClick={() => setShowStatusMenu(v => !v)}
              style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
                border: `1px solid ${colMeta.color}`, background: "transparent",
                color: colMeta.color, cursor: "pointer", fontFamily: "var(--font-chakra)",
              }}
            >
              {colMeta.label}
            </button>
            {showStatusMenu && (
              <div style={{
                position: "absolute", top: "110%", right: 0, zIndex: 50,
                background: "var(--pandora-ink-0)", border: "1px solid var(--pandora-ink-200)",
                borderRadius: 8, overflow: "hidden", minWidth: 140,
                boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              }}>
                {KANBAN_COLUMNS.map(col => (
                  <button key={col.id}
                    onClick={e => { e.stopPropagation(); onStatusChange(initiative.id, col.id); setShowStatusMenu(false); }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      padding: "7px 12px", background: "none", border: "none",
                      cursor: "pointer", fontSize: 12, color: col.color,
                      fontWeight: initiative.status === col.id ? 700 : 400,
                    }}>
                    {col.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            onClick={() => onDelete(initiative.id)}
            style={{ padding: 4, background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-300)", flexShrink: 0 }}
            title="Remover iniciativa"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {initiative.description && (
          <p
            onDoubleClick={() => {/* could add desc edit */}}
            style={{ margin: "0 0 0 22px", fontSize: 12, color: "var(--pandora-ink-500)", lineHeight: 1.4 }}
          >
            {initiative.description}
          </p>
        )}

        {tasks.length > 0 && (
          <div style={{ margin: "0 0 0 22px", fontSize: 11, color: "var(--pandora-ink-400)" }}>
            {done}/{tasks.length} tarefas · {Math.round((done / tasks.length) * 100)}%
          </div>
        )}
      </div>

      {/* tasks */}
      {expanded && (
        <div style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
          {tasks.map(t => (
            <TaskRow
              key={t.id}
              task={t}
              onStatusChange={onTaskStatusChange}
              onDelete={(tid) => onTaskDelete(tid, initiative.id)}
              onTitleEdit={onTaskTitleEdit}
            />
          ))}

          {addingTask ? (
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <input
                autoFocus
                placeholder="Nova tarefa..."
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") submitTask(); if (e.key === "Escape") { setAddingTask(false); setNewTask(""); } }}
                style={{
                  flex: 1, padding: "5px 8px", borderRadius: 6,
                  border: "1px solid var(--pandora-ink-200)",
                  background: "var(--pandora-ink-50)", fontSize: 13,
                }}
              />
              <button className="pda-btn" style={{ padding: "5px 12px", fontSize: 12 }} onClick={submitTask}>
                <Check size={13} />
              </button>
              <button className="pda-btn-ghost" style={{ padding: "5px 10px", fontSize: 12 }}
                onClick={() => { setAddingTask(false); setNewTask(""); }}>
                <X size={13} />
              </button>
            </div>
          ) : (
            <button
              className="pda-btn-ghost"
              style={{ alignSelf: "flex-start", fontSize: 12, padding: "4px 8px", display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}
              onClick={() => setAddingTask(true)}
            >
              <Plus size={12} /> Tarefa
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────

export default function OperacaoClientePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [initiatives, setInitiatives] = useState<Initiative[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);

  // health edit
  const [editingHealth, setEditingHealth] = useState(false);
  const [healthForm, setHealthForm] = useState({ score: "", notes: "" });

  // new initiative
  const [addingInit, setAddingInit] = useState<InitiativeStatus | null>(null);
  const [newInitTitle, setNewInitTitle] = useState("");

  // expanded meeting transcript
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);

  // ── loaders ──────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    const [cRes, iRes, mRes, hRes] = await Promise.all([
      fetch(`/api/clients/${id}`),
      fetch(`/api/initiatives?client_id=${id}`),
      fetch(`/api/meetings?client_id=${id}`),
      fetch(`/api/hours?client_id=${id}&month=${mk}`),
    ]);

    const [clientData, initiativesData, meetingsData, hoursData] = await Promise.all([
      cRes.ok ? cRes.json() : null,
      iRes.ok ? iRes.json() : [],
      mRes.ok ? mRes.json() : [],
      hRes.ok ? hRes.json() : [],
    ]);

    if (!clientData) { router.push("/operacao"); return; }

    setClient(clientData);
    setInitiatives(initiativesData);
    setMeetings(meetingsData);
    setTotalHours((hoursData as { hours: number }[]).reduce((s, e) => s + Number(e.hours), 0));
    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // ── initiative actions ────────────────────────────────────────────────────

  async function addInitiative(status: InitiativeStatus) {
    const title = newInitTitle.trim();
    if (!title || !client) return;
    const res = await fetch("/api/initiatives", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: client.id, title, status }),
    });
    if (res.ok) {
      const created = await res.json();
      setInitiatives(prev => [...prev, created]);
    }
    setNewInitTitle("");
    setAddingInit(null);
  }

  async function updateInitiativeStatus(initiativeId: string, status: InitiativeStatus) {
    await fetch(`/api/initiatives/${initiativeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInitiatives(prev => prev.map(i => i.id === initiativeId ? { ...i, status } : i));
  }

  async function deleteInitiative(initiativeId: string) {
    await fetch(`/api/initiatives/${initiativeId}`, { method: "DELETE" });
    setInitiatives(prev => prev.filter(i => i.id !== initiativeId));
  }

  async function editInitiativeTitle(initiativeId: string, title: string) {
    await fetch(`/api/initiatives/${initiativeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setInitiatives(prev => prev.map(i => i.id === initiativeId ? { ...i, title } : i));
  }

  async function editInitiativeDesc(initiativeId: string, description: string) {
    await fetch(`/api/initiatives/${initiativeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    setInitiatives(prev => prev.map(i => i.id === initiativeId ? { ...i, description } : i));
  }

  // ── task actions ──────────────────────────────────────────────────────────

  async function addTask(initiativeId: string, title: string) {
    const res = await fetch("/api/initiative-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ initiative_id: initiativeId, title }),
    });
    if (res.ok) {
      const task = await res.json();
      setInitiatives(prev => prev.map(i =>
        i.id === initiativeId ? { ...i, tasks: [...(i.tasks ?? []), task] } : i
      ));
    }
  }

  async function updateTaskStatus(taskId: string, status: InitiativeTaskStatus) {
    await fetch(`/api/initiative-tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInitiatives(prev => prev.map(i => ({
      ...i,
      tasks: (i.tasks ?? []).map(t => t.id === taskId ? { ...t, status } : t),
    })));
  }

  async function deleteTask(taskId: string, initiativeId: string) {
    await fetch(`/api/initiative-tasks/${taskId}`, { method: "DELETE" });
    setInitiatives(prev => prev.map(i =>
      i.id === initiativeId ? { ...i, tasks: (i.tasks ?? []).filter(t => t.id !== taskId) } : i
    ));
  }

  async function editTaskTitle(taskId: string, title: string) {
    await fetch(`/api/initiative-tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setInitiatives(prev => prev.map(i => ({
      ...i,
      tasks: (i.tasks ?? []).map(t => t.id === taskId ? { ...t, title } : t),
    })));
  }

  // ── health actions ────────────────────────────────────────────────────────

  async function saveHealth() {
    if (!client) return;
    const score = parseInt(healthForm.score);
    if (isNaN(score) || score < 1 || score > 10) return;
    const res = await fetch(`/api/clients/${client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ health_score: score, health_notes: healthForm.notes }),
    });
    if (res.ok) {
      const updated = await res.json();
      setClient(updated);
      setEditingHealth(false);
    }
  }

  // ── derived ───────────────────────────────────────────────────────────────

  const initiativesByStatus = useMemo(() => {
    const map: Record<InitiativeStatus, Initiative[]> = { backlog: [], active: [], paused: [], done: [] };
    for (const i of initiatives) map[i.status].push(i);
    return map;
  }, [initiatives]);

  // ── render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="pda-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--pandora-violet-600)" }} />
      </div>
    );
  }

  if (!client) return null;

  return (
    <div className="pda-main" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

      {/* ── topbar ── */}
      <div className="pda-topbar" style={{ flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="pda-btn-ghost" style={{ padding: "4px 8px", display: "flex", alignItems: "center", gap: 4, fontSize: 13 }}
            onClick={() => router.push("/operacao")}>
            <ArrowLeft size={14} /> Operação
          </button>
          <span style={{ color: "var(--pandora-ink-200)" }}>·</span>
          <h1 style={{ margin: 0, fontSize: 18, fontFamily: "var(--font-chakra)", fontWeight: 700 }}>
            {client.company_name}
          </h1>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* fee */}
          {client.monthly_fee && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-chakra)", textTransform: "uppercase", letterSpacing: 1 }}>Fee</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--pandora-violet-600)", fontFamily: "var(--font-chakra)" }}>
                {formatBRL(client.monthly_fee)}
              </span>
            </div>
          )}

          {/* hours */}
          {(client.dedication_hours || totalHours > 0) && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
              <span style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-chakra)", textTransform: "uppercase", letterSpacing: 1 }}>Horas</span>
              <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-chakra)", color: hoursColor(totalHours, client.dedication_hours) }}>
                {totalHours.toFixed(1)}h{client.dedication_hours ? ` / ${client.dedication_hours}h` : ""}
              </span>
            </div>
          )}

          {/* health score */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => {
                setHealthForm({ score: String(client.health_score ?? ""), notes: client.health_notes ?? "" });
                setEditingHealth(v => !v);
              }}
              title="Editar health score"
              style={{
                width: 38, height: 38, borderRadius: "50%",
                background: healthColor(client.health_score),
                border: "none", cursor: "pointer",
                fontSize: 15, fontWeight: 800, color: "#fff",
                fontFamily: "var(--font-chakra)", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              {client.health_score ?? "?"}
            </button>

            {editingHealth && (
              <div style={{
                position: "absolute", top: "110%", right: 0, zIndex: 100,
                background: "var(--pandora-ink-0)", border: "1px solid var(--pandora-ink-200)",
                borderRadius: 10, padding: 12, display: "flex", flexDirection: "column", gap: 8,
                minWidth: 260, boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: "var(--pandora-ink-500)" }}>
                  <Heart size={12} /> Health Score
                </div>
                <input type="number" min={1} max={10} placeholder="Score 1–10"
                  value={healthForm.score}
                  onChange={e => setHealthForm(f => ({ ...f, score: e.target.value }))}
                  style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
                <input placeholder="Observações..."
                  value={healthForm.notes}
                  onChange={e => setHealthForm(f => ({ ...f, notes: e.target.value }))}
                  onKeyDown={e => { if (e.key === "Enter") saveHealth(); }}
                  style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="pda-btn" style={{ flex: 1, fontSize: 12 }} onClick={saveHealth}>Salvar</button>
                  <button className="pda-btn-ghost" style={{ fontSize: 12 }} onClick={() => setEditingHealth(false)}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── main layout: meetings panel + kanban ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* meetings sidebar */}
        <div style={{
          width: 300, flexShrink: 0,
          borderRight: "1px solid var(--pandora-ink-100)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "14px 16px 10px", borderBottom: "1px solid var(--pandora-ink-100)", flexShrink: 0 }}>
            <p className="pda-eyebrow" style={{ margin: 0 }}>Reuniões</p>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
            {meetings.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", textAlign: "center", marginTop: 20 }}>
                Nenhuma reunião encontrada.
              </p>
            ) : (
              meetings.map(m => (
                <div key={m.id} style={{
                  background: "var(--pandora-ink-0)", borderRadius: 10,
                  border: "1px solid var(--pandora-ink-100)",
                  overflow: "hidden",
                }}>
                  <div
                    onClick={() => setExpandedMeeting(v => v === m.id ? null : m.id)}
                    style={{ padding: "10px 12px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.subject ?? "Reunião"}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--pandora-ink-400)", marginTop: 2 }}>
                        {new Date(m.occurred_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                      {m.external_url && (
                        <a href={m.external_url} target="_blank" rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          style={{ color: "var(--pandora-violet-600)", display: "flex" }}
                          title="Abrir no Fathom">
                          <Video size={12} />
                        </a>
                      )}
                      {expandedMeeting === m.id ? <ChevronDown size={12} style={{ color: "var(--pandora-ink-400)" }} /> : <ChevronRight size={12} style={{ color: "var(--pandora-ink-400)" }} />}
                    </div>
                  </div>

                  {expandedMeeting === m.id && m.content && (
                    <div style={{ padding: "0 12px 10px", borderTop: "1px solid var(--pandora-ink-100)" }}>
                      <p style={{ fontSize: 11, color: "var(--pandora-ink-500)", margin: "8px 0 0", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {m.content}
                      </p>
                    </div>
                  )}

                  {expandedMeeting === m.id && !m.content && (
                    <div style={{ padding: "8px 12px 10px", borderTop: "1px solid var(--pandora-ink-100)" }}>
                      <p style={{ fontSize: 11, color: "var(--pandora-ink-400)", margin: 0 }}>
                        Transcrição não disponível.
                      </p>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── kanban ── */}
        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden", display: "flex", padding: "16px 20px", gap: 16 }}>
          {KANBAN_COLUMNS.map(col => {
            const colInitiatives = initiativesByStatus[col.id];
            const isAdding = addingInit === col.id;

            return (
              <div key={col.id} style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%" }}>
                {/* column header */}
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  marginBottom: 12, paddingBottom: 10,
                  borderBottom: `2px solid ${col.color}`,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 800, fontFamily: "var(--font-chakra)",
                      textTransform: "uppercase", letterSpacing: 1, color: col.color,
                    }}>
                      {col.label}
                    </span>
                    <span style={{
                      fontSize: 11, fontWeight: 700, color: "#fff",
                      background: col.color, borderRadius: 20, padding: "1px 7px",
                      fontFamily: "var(--font-chakra)",
                    }}>
                      {colInitiatives.length}
                    </span>
                  </div>
                  <button
                    className="pda-btn-ghost"
                    style={{ padding: 4, display: "flex", alignItems: "center", gap: 3, fontSize: 12 }}
                    onClick={() => {
                      setAddingInit(isAdding ? null : col.id);
                      setNewInitTitle("");
                    }}
                    title="Nova iniciativa"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* new initiative input */}
                {isAdding && (
                  <div style={{ marginBottom: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                    <input
                      autoFocus
                      placeholder="Nome da iniciativa..."
                      value={newInitTitle}
                      onChange={e => setNewInitTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter") addInitiative(col.id);
                        if (e.key === "Escape") { setAddingInit(null); setNewInitTitle(""); }
                      }}
                      style={{
                        padding: "7px 10px", borderRadius: 8, fontSize: 13,
                        border: `1.5px solid ${col.color}`,
                        background: "var(--pandora-ink-0)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="pda-btn" style={{ flex: 1, fontSize: 12, padding: "5px 10px" }}
                        onClick={() => addInitiative(col.id)}>
                        Adicionar
                      </button>
                      <button className="pda-btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}
                        onClick={() => { setAddingInit(null); setNewInitTitle(""); }}>
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                )}

                {/* initiatives list */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                  {colInitiatives.length === 0 && !isAdding && (
                    <div style={{ textAlign: "center", padding: "24px 0" }}>
                      <p style={{ fontSize: 12, color: "var(--pandora-ink-300)", margin: 0 }}>Sem iniciativas</p>
                    </div>
                  )}
                  {colInitiatives.map(initiative => (
                    <InitiativeCard
                      key={initiative.id}
                      initiative={initiative}
                      onStatusChange={updateInitiativeStatus}
                      onDelete={deleteInitiative}
                      onTitleEdit={editInitiativeTitle}
                      onDescEdit={editInitiativeDesc}
                      onAddTask={addTask}
                      onTaskStatusChange={updateTaskStatus}
                      onTaskDelete={deleteTask}
                      onTaskTitleEdit={editTaskTitle}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
