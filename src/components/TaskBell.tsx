"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Bell, CheckCircle2, XCircle } from "lucide-react";
import type { Task } from "@/lib/tasks";

const PRIORITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high:     "#d97706",
  medium:   "#7A1CB5",
  low:      "#9ca3af",
};

export default function TaskBell() {
  const [tasks, setTasks]     = useState<Task[]>([]);
  const [open, setOpen]       = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/tasks?status=open&limit=5");
      if (res.ok) setTasks(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Fechar ao clicar fora
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  async function updateTask(id: string, status: "done" | "dismissed") {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setTasks(prev => prev.filter(t => t.id !== id));
  }

  const count = tasks.length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => { setOpen(v => !v); if (!open) load(); }}
        style={{
          position: "relative",
          background: "none", border: "1px solid var(--pandora-ink-200)",
          borderRadius: 8, padding: "6px 8px", cursor: "pointer",
          display: "flex", alignItems: "center", color: "var(--pandora-ink-500)",
        }}
        title="Tarefas abertas"
      >
        <Bell size={16} strokeWidth={1.5} />
        {count > 0 && (
          <span style={{
            position: "absolute", top: -5, right: -5,
            background: "#dc2626", color: "#fff",
            fontSize: 10, fontFamily: "var(--font-mono)", fontWeight: 700,
            borderRadius: 10, minWidth: 16, height: 16,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "0 3px",
          }}>
            {count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0,
          width: 340, background: "#fff",
          border: "1px solid var(--pandora-ink-200)", borderRadius: 12,
          boxShadow: "var(--shadow-lg)", zIndex: 200,
        }}>
          <div style={{
            padding: "12px 16px", borderBottom: "1px solid var(--pandora-ink-100)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <span style={{ fontFamily: "var(--font-display)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--pandora-ink-600)" }}>
              Tarefas abertas
            </span>
            {count > 0 && (
              <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "#dc2626" }}>
                {count}
              </span>
            )}
          </div>

          {loading && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--pandora-ink-400)" }}>
              Carregando…
            </div>
          )}

          {!loading && count === 0 && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: "var(--pandora-ink-400)" }}>
              Nenhuma tarefa aberta
            </div>
          )}

          {!loading && tasks.map(task => (
            <div key={task.id} style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              padding: "10px 16px",
              borderBottom: "1px solid var(--pandora-ink-100)",
            }}>
              <div style={{
                width: 6, height: 6, borderRadius: "50%",
                background: PRIORITY_COLOR[task.priority] ?? "#9ca3af",
                marginTop: 5, flexShrink: 0,
              }} />
              <span style={{ flex: 1, fontSize: 12, color: "var(--pandora-ink-700)", lineHeight: 1.4 }}>
                {task.title}
              </span>
              <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
                <button onClick={() => updateTask(task.id, "done")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--pandora-green-400)" }}>
                  <CheckCircle2 size={14} strokeWidth={1.5} />
                </button>
                <button onClick={() => updateTask(task.id, "dismissed")}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--pandora-ink-300)" }}>
                  <XCircle size={14} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          ))}

          <div style={{ padding: "10px 16px" }}>
            <Link href="/tarefas" onClick={() => setOpen(false)}
              style={{ fontSize: 12, color: "var(--pandora-violet-600)", textDecoration: "none", fontFamily: "var(--font-display)" }}>
              Ver todas as tarefas →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
