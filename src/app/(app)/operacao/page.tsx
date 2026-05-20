"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Check, X,
  Clock, Heart, Sparkles, Video, Copy, CheckCheck,
} from "lucide-react";
import type { Client, Contract, Deliverable, HoursEntry } from "@/lib/types";
import { formatBRL } from "@/lib/docs";

// ── helpers ────────────────────────────────────────────────────────────────

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtMonth(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

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

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ height: 6, background: "var(--pandora-ink-100)", borderRadius: 3, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3, transition: "width 0.3s" }} />
    </div>
  );
}

// ── types ──────────────────────────────────────────────────────────────────

interface Meeting {
  id: string;
  subject?: string;
  content?: string;
  occurred_at: string;
  external_url?: string;
  metadata?: Record<string, unknown>;
}

interface ClientOpData {
  client: Client;
  deliverables: Deliverable[];
  hours: HoursEntry[];
  contracts: Contract[];
  meetings: Meeting[];
}

type Tab = "planejamento" | "reunioes" | "tarefas" | "horas" | "relatorio" | "financeiro";

const TABS: { id: Tab; label: string }[] = [
  { id: "planejamento", label: "Planejamento" },
  { id: "reunioes",     label: "Reuniões" },
  { id: "tarefas",      label: "Tarefas" },
  { id: "horas",        label: "Horas" },
  { id: "relatorio",    label: "Relatório" },
  { id: "financeiro",   label: "Financeiro" },
];

// ── main component ─────────────────────────────────────────────────────────

export default function OperacaoPage() {
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<ClientOpData | null>(null);
  const [loading, setLoading] = useState(true);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("planejamento");

  // planejamento tab state
  const [newDeliverable, setNewDeliverable] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set());

  // horas tab state
  const [addingHours, setAddingHours] = useState(false);
  const [hoursForm, setHoursForm] = useState({ hours: "", description: "", date: "" });

  // health state
  const [editingHealth, setEditingHealth] = useState(false);
  const [healthForm, setHealthForm] = useState({ score: "", notes: "" });

  // relatorio state
  const [copied, setCopied] = useState(false);

  const drawerRef = useRef<HTMLDivElement>(null);

  // load active clients
  const loadClients = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/clients?status=active");
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setSelected(null); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // load per-client operational data
  const openClient = useCallback(async (client: Client) => {
    setDrawerLoading(true);
    setSelected({ client, deliverables: [], hours: [], contracts: [], meetings: [] });
    setActiveTab("planejamento");
    setSuggestions([]);
    setSelectedSuggestions(new Set());

    const mk = monthKey(month);
    const [dRes, hRes, cRes, mRes] = await Promise.all([
      fetch(`/api/deliverables?client_id=${client.id}&month=${mk}`),
      fetch(`/api/hours?client_id=${client.id}&month=${mk}`),
      fetch(`/api/contracts?client_id=${client.id}&status=active,signed`),
      fetch(`/api/meetings?client_id=${client.id}`),
    ]);

    const [deliverables, hours, contracts, meetings] = await Promise.all([
      dRes.ok ? dRes.json() : [],
      hRes.ok ? hRes.json() : [],
      cRes.ok ? cRes.json() : [],
      mRes.ok ? mRes.json() : [],
    ]);

    setSelected({ client, deliverables, hours, contracts, meetings });
    setEditingHealth(false);
    setAddingHours(false);
    setNewDeliverable("");
    setDrawerLoading(false);
  }, [month]);

  // reload deliverables + hours (keeping drawer open)
  const reloadSelected = useCallback(async () => {
    if (!selected) return;
    const mk = monthKey(month);
    const [dRes, hRes] = await Promise.all([
      fetch(`/api/deliverables?client_id=${selected.client.id}&month=${mk}`),
      fetch(`/api/hours?client_id=${selected.client.id}&month=${mk}`),
    ]);
    const [deliverables, hours] = await Promise.all([
      dRes.ok ? dRes.json() : selected.deliverables,
      hRes.ok ? hRes.json() : selected.hours,
    ]);
    setSelected(s => s ? { ...s, deliverables, hours } : s);
  }, [selected, month]);

  useEffect(() => {
    if (selected) reloadSelected();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  // ── planejamento actions ──────────────────────────────────────────────────

  async function toggleDeliverable(d: Deliverable) {
    await fetch(`/api/deliverables/${d.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !d.done }),
    });
    reloadSelected();
  }

  async function addDeliverable() {
    if (!newDeliverable.trim() || !selected) return;
    await fetch("/api/deliverables", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: selected.client.id, month: monthKey(month), title: newDeliverable.trim() }),
    });
    setNewDeliverable("");
    reloadSelected();
  }

  async function deleteDeliverable(id: string) {
    await fetch(`/api/deliverables/${id}`, { method: "DELETE" });
    reloadSelected();
  }

  async function suggestDeliverables() {
    if (!selected) return;
    setSuggesting(true);
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    try {
      const res = await fetch("/api/deliverables/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selected.client.id, month: monthKey(month) }),
      });
      if (res.ok) {
        const { items } = await res.json();
        setSuggestions(items ?? []);
        setSelectedSuggestions(new Set((items ?? []).map((_: string, i: number) => i)));
      }
    } finally {
      setSuggesting(false);
    }
  }

  async function addSelectedSuggestions() {
    if (!selected || selectedSuggestions.size === 0) return;
    const toAdd = suggestions.filter((_, i) => selectedSuggestions.has(i));
    await Promise.all(toAdd.map(title =>
      fetch("/api/deliverables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: selected.client.id, month: monthKey(month), title }),
      })
    ));
    setSuggestions([]);
    setSelectedSuggestions(new Set());
    reloadSelected();
  }

  // ── horas actions ──────────────────────────────────────────────────────

  async function addHours() {
    if (!hoursForm.hours || !selected) return;
    const date = hoursForm.date || monthKey(month);
    await fetch("/api/hours", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: selected.client.id,
        date,
        hours: parseFloat(hoursForm.hours),
        description: hoursForm.description || undefined,
      }),
    });
    setHoursForm({ hours: "", description: "", date: "" });
    setAddingHours(false);
    reloadSelected();
  }

  async function deleteHours(id: string) {
    await fetch(`/api/hours/${id}`, { method: "DELETE" });
    reloadSelected();
  }

  // ── health actions ────────────────────────────────────────────────────

  async function saveHealth() {
    if (!selected) return;
    const score = parseInt(healthForm.score);
    if (isNaN(score) || score < 1 || score > 10) return;
    const res = await fetch(`/api/clients/${selected.client.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ health_score: score, health_notes: healthForm.notes }),
    });
    if (res.ok) {
      const updated = await res.json();
      setSelected(s => s ? { ...s, client: updated } : s);
      setClients(cs => cs.map(c => c.id === updated.id ? updated : c));
      setEditingHealth(false);
    }
  }

  // ── aggregates ──────────────────────────────────────────────────────────

  const totalHours = useMemo(() => selected?.hours.reduce((s, e) => s + Number(e.hours), 0) ?? 0, [selected]);
  const doneCount  = useMemo(() => selected?.deliverables.filter(d => d.done).length ?? 0, [selected]);

  function buildReport() {
    if (!selected) return "";
    const c = selected.client;
    const mk = fmtMonth(month);
    const lines = [
      `# Relatório — ${c.company_name} — ${mk}`,
      "",
      `**Fee mensal:** ${formatBRL(c.monthly_fee)}`,
      "",
      `## Horas`,
      `${totalHours.toFixed(1)}h de ${c.dedication_hours ?? "—"}h contratadas`,
      "",
      `## Entregas (${doneCount}/${selected.deliverables.length})`,
      ...selected.deliverables.map(d => `- [${d.done ? "x" : " "}] ${d.title}`),
    ];
    return lines.join("\n");
  }

  async function copyReport() {
    await navigator.clipboard.writeText(buildReport());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // ── render ────────────────────────────────────────────────────────────────

  return (
    <div className="pda-main" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* topbar */}
      <div className="pda-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-chakra)", fontWeight: 700 }}>Operação</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--pandora-ink-100)", borderRadius: 8, padding: "4px 10px" }}>
            <button className="pda-btn-ghost" style={{ padding: "2px 6px", minWidth: 0 }}
              onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>
              {fmtMonth(month)}
            </span>
            <button className="pda-btn-ghost" style={{ padding: "2px 6px", minWidth: 0 }}
              onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <span className="pda-chip">{clients.length} ativos</span>
      </div>

      {/* content */}
      <div className="pda-content" style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <p className="pda-empty">Carregando clientes...</p>
        ) : clients.length === 0 ? (
          <div className="pda-empty">
            <p>Nenhum cliente ativo.</p>
            <a href="/clientes" className="pda-btn" style={{ marginTop: 8 }}>Ver Contatos</a>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {clients.map(c => (
              <ClientCard key={c.id} client={c} month={month}
                onClick={() => openClient(c)} selected={selected?.client.id === c.id} />
            ))}
          </div>
        )}
      </div>

      {/* drawer */}
      {selected && (
        <div
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.4)", display: "flex", justifyContent: "flex-end" }}
          onClick={e => { if (e.target === e.currentTarget) setSelected(null); }}
        >
          <div ref={drawerRef} style={{ width: 520, maxWidth: "100vw", background: "var(--pandora-ink-50)", height: "100%", display: "flex", flexDirection: "column" }}>

            {/* drawer header */}
            <div style={{ padding: "20px 24px 0", borderBottom: "1px solid var(--pandora-ink-100)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-chakra)" }}>
                    {selected.client.company_name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>
                    {fmtMonth(month)} · fee {formatBRL(selected.client.monthly_fee)}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* inline health badge */}
                  <button
                    onClick={() => {
                      setHealthForm({ score: String(selected.client.health_score ?? ""), notes: selected.client.health_notes ?? "" });
                      setEditingHealth(v => !v);
                    }}
                    title="Editar health score"
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      background: healthColor(selected.client.health_score),
                      border: "none", cursor: "pointer",
                      fontSize: 14, fontWeight: 800, color: "#fff",
                      fontFamily: "var(--font-chakra)",
                    }}
                  >
                    {selected.client.health_score ?? "?"}
                  </button>
                  <button className="pda-btn-ghost" style={{ padding: 6 }} onClick={() => setSelected(null)}>
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* inline health editor */}
              {editingHealth && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 12, padding: "10px 12px", background: "var(--pandora-ink-0)", borderRadius: 8, border: "1px solid var(--pandora-ink-100)" }}>
                  <Heart size={13} color="var(--pandora-ink-400)" />
                  <input type="number" min={1} max={10} placeholder="Score 1–10"
                    value={healthForm.score}
                    onChange={e => setHealthForm(f => ({ ...f, score: e.target.value }))}
                    style={{ width: 80, padding: "4px 8px", borderRadius: 5, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
                  <input placeholder="Observações..."
                    value={healthForm.notes}
                    onChange={e => setHealthForm(f => ({ ...f, notes: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") saveHealth(); }}
                    style={{ flex: 1, padding: "4px 8px", borderRadius: 5, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
                  <button className="pda-btn" style={{ padding: "4px 12px", fontSize: 12 }} onClick={saveHealth}>OK</button>
                </div>
              )}

              {/* tabs */}
              <div style={{ display: "flex", gap: 0, overflowX: "auto" }}>
                {TABS.map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer",
                      padding: "8px 14px", fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500,
                      color: activeTab === tab.id ? "var(--pandora-violet-600)" : "var(--pandora-ink-400)",
                      borderBottom: `2px solid ${activeTab === tab.id ? "var(--pandora-violet-600)" : "transparent"}`,
                      whiteSpace: "nowrap", transition: "color 0.15s",
                    }}>
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* tab content */}
            {drawerLoading ? (
              <p style={{ padding: 24, color: "var(--pandora-ink-400)" }}>Carregando...</p>
            ) : (
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>

                {/* ── PLANEJAMENTO ── */}
                {activeTab === "planejamento" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* contract reference */}
                    {selected.contracts.length > 0 && (
                      <div style={{ background: "var(--pandora-ink-0)", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--pandora-ink-100)" }}>
                        <p className="pda-eyebrow" style={{ margin: "0 0 6px" }}>Contrato de referência</p>
                        {selected.contracts.slice(0, 1).map(c => (
                          <div key={c.id}>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
                            <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>
                              {formatBRL(c.value)} · {c.starts_at ? `início ${c.starts_at}` : c.status}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* deliverables checklist */}
                    <div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                        <p className="pda-eyebrow" style={{ margin: 0 }}>
                          Entregas · {doneCount}/{selected.deliverables.length}
                        </p>
                        <button
                          className="pda-btn-ghost"
                          style={{ fontSize: 12, padding: "3px 10px", display: "flex", alignItems: "center", gap: 4 }}
                          onClick={suggestDeliverables}
                          disabled={suggesting}
                        >
                          <Sparkles size={12} />
                          {suggesting ? "Gerando..." : "Sugerir com AI"}
                        </button>
                      </div>

                      {/* AI suggestions panel */}
                      {suggestions.length > 0 && (
                        <div style={{ background: "rgba(122,28,181,0.06)", border: "1px solid rgba(122,28,181,0.2)", borderRadius: 10, padding: 14, marginBottom: 12 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--pandora-violet-600)", margin: "0 0 8px", display: "flex", alignItems: "center", gap: 6 }}>
                            <Sparkles size={12} /> Sugestões da AI — selecione as que deseja adicionar
                          </p>
                          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                            {suggestions.map((s, i) => (
                              <label key={i} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
                                <input
                                  type="checkbox"
                                  checked={selectedSuggestions.has(i)}
                                  onChange={() => setSelectedSuggestions(prev => {
                                    const next = new Set(prev);
                                    next.has(i) ? next.delete(i) : next.add(i);
                                    return next;
                                  })}
                                />
                                {s}
                              </label>
                            ))}
                          </div>
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button className="pda-btn" style={{ fontSize: 12 }} onClick={addSelectedSuggestions}
                              disabled={selectedSuggestions.size === 0}>
                              Adicionar ({selectedSuggestions.size})
                            </button>
                            <button className="pda-btn-ghost" style={{ fontSize: 12 }} onClick={() => setSuggestions([])}>
                              Descartar
                            </button>
                          </div>
                        </div>
                      )}

                      {selected.deliverables.length === 0 && suggestions.length === 0 && (
                        <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", margin: "0 0 8px" }}>
                          Nenhuma entrega. Use "Sugerir com AI" ou adicione manualmente.
                        </p>
                      )}

                      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                        {selected.deliverables.map(d => (
                          <li key={d.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--pandora-ink-0)", borderRadius: 8, padding: "8px 12px", border: "1px solid var(--pandora-ink-100)" }}>
                            <button onClick={() => toggleDeliverable(d)} style={{
                              width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                              border: `2px solid ${d.done ? "var(--pandora-green-400)" : "var(--pandora-ink-300)"}`,
                              background: d.done ? "var(--pandora-green-400)" : "transparent",
                              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                            }}>
                              {d.done && <Check size={12} color="#fff" strokeWidth={3} />}
                            </button>
                            <span style={{ flex: 1, fontSize: 13, textDecoration: d.done ? "line-through" : "none", color: d.done ? "var(--pandora-ink-400)" : "var(--pandora-ink-800)" }}>
                              {d.title}
                            </span>
                            <button className="pda-btn-ghost" style={{ padding: 4, color: "var(--pandora-ink-300)" }} onClick={() => deleteDeliverable(d.id)}>
                              <Trash2 size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>

                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          placeholder="Nova entrega..."
                          value={newDeliverable}
                          onChange={e => setNewDeliverable(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") addDeliverable(); }}
                          style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-0)", fontSize: 13 }}
                        />
                        <button className="pda-btn" style={{ padding: "6px 12px" }} onClick={addDeliverable}>
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── REUNIÕES ── */}
                {activeTab === "reunioes" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {!selected.client.contact_id && (
                      <div style={{ background: "var(--pandora-ink-0)", border: "1px solid var(--pandora-ink-100)", borderRadius: 8, padding: 16, textAlign: "center" }}>
                        <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", margin: 0 }}>
                          Este cliente não tem contato vinculado. Vincule um contato para ver reuniões.
                        </p>
                      </div>
                    )}
                    {selected.client.contact_id && selected.meetings.length === 0 && (
                      <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>
                        Nenhuma reunião Fathom encontrada para este cliente.
                      </p>
                    )}
                    {selected.meetings.map(m => (
                      <div key={m.id} style={{ background: "var(--pandora-ink-0)", borderRadius: 10, padding: "12px 14px", border: "1px solid var(--pandora-ink-100)" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>{m.subject ?? "Reunião"}</div>
                            <div style={{ fontSize: 11, color: "var(--pandora-ink-400)", marginTop: 2 }}>
                              {new Date(m.occurred_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                          {m.external_url && (
                            <a href={m.external_url} target="_blank" rel="noreferrer"
                              style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--pandora-violet-600)", textDecoration: "none" }}>
                              <Video size={13} /> Ver
                            </a>
                          )}
                        </div>
                        {m.content && (
                          <p style={{ fontSize: 12, color: "var(--pandora-ink-500)", margin: 0, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                            {m.content}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── TAREFAS ── */}
                {activeTab === "tarefas" && (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <p style={{ fontSize: 14, color: "var(--pandora-ink-400)", margin: 0 }}>
                      Tarefas em breve — extração automática de action items das reuniões via AI.
                    </p>
                  </div>
                )}

                {/* ── HORAS ── */}
                {activeTab === "horas" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <p className="pda-eyebrow" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
                        <Clock size={13} /> {totalHours.toFixed(1)}h
                        {selected.client.dedication_hours && (
                          <span style={{ color: hoursColor(totalHours, selected.client.dedication_hours), fontWeight: 700 }}>
                            /{selected.client.dedication_hours}h
                          </span>
                        )}
                      </p>
                      <button className="pda-btn-ghost" style={{ fontSize: 12, padding: "3px 10px" }}
                        onClick={() => setAddingHours(v => !v)}>
                        {addingHours ? "Cancelar" : "Registrar"}
                      </button>
                    </div>

                    {selected.client.dedication_hours && (
                      <ProgressBar value={totalHours} max={selected.client.dedication_hours}
                        color={hoursColor(totalHours, selected.client.dedication_hours)} />
                    )}

                    {addingHours && (
                      <div style={{ padding: 12, background: "var(--pandora-ink-0)", borderRadius: 8, border: "1px solid var(--pandora-ink-100)", display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 8 }}>
                          <input type="number" min="0.25" step="0.25" placeholder="Horas"
                            value={hoursForm.hours}
                            onChange={e => setHoursForm(f => ({ ...f, hours: e.target.value }))}
                            style={{ width: 90, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
                          <input type="date" value={hoursForm.date}
                            onChange={e => setHoursForm(f => ({ ...f, date: e.target.value }))}
                            style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
                        </div>
                        <input placeholder="Descrição (opcional)" value={hoursForm.description}
                          onChange={e => setHoursForm(f => ({ ...f, description: e.target.value }))}
                          style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
                        <button className="pda-btn" style={{ alignSelf: "flex-start", fontSize: 13 }} onClick={addHours}>Salvar</button>
                      </div>
                    )}

                    {selected.hours.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>Nenhuma hora registrada.</p>
                    ) : (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                        {selected.hours.map(h => (
                          <li key={h.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "var(--pandora-ink-0)", borderRadius: 8, padding: "7px 12px", border: "1px solid var(--pandora-ink-100)" }}>
                            <span style={{ fontSize: 13, fontWeight: 700, minWidth: 40, color: "var(--pandora-violet-600)" }}>{Number(h.hours).toFixed(1)}h</span>
                            <span style={{ fontSize: 12, color: "var(--pandora-ink-400)", minWidth: 80 }}>
                              {new Date(h.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                            </span>
                            <span style={{ flex: 1, fontSize: 13, color: "var(--pandora-ink-600)" }}>{h.description || "—"}</span>
                            <button className="pda-btn-ghost" style={{ padding: 4, color: "var(--pandora-ink-300)" }} onClick={() => deleteHours(h.id)}>
                              <Trash2 size={13} />
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* ── RELATÓRIO ── */}
                {activeTab === "relatorio" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <p className="pda-eyebrow" style={{ margin: 0 }}>Resumo — {fmtMonth(month)}</p>
                      <button className="pda-btn-ghost" style={{ fontSize: 12, padding: "3px 10px", display: "flex", alignItems: "center", gap: 4 }}
                        onClick={copyReport}>
                        {copied ? <><CheckCheck size={12} /> Copiado!</> : <><Copy size={12} /> Copiar MD</>}
                      </button>
                    </div>

                    {/* fee */}
                    <div style={{ background: "var(--pandora-ink-0)", borderRadius: 8, padding: "10px 14px", border: "1px solid var(--pandora-ink-100)" }}>
                      <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginBottom: 2 }}>Fee mensal</div>
                      <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-chakra)", color: "var(--pandora-violet-600)" }}>
                        {formatBRL(selected.client.monthly_fee)}
                      </div>
                    </div>

                    {/* hours progress */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600 }}>Horas</span>
                        <span style={{ color: hoursColor(totalHours, selected.client.dedication_hours ?? undefined) }}>
                          {totalHours.toFixed(1)}h / {selected.client.dedication_hours ?? "—"}h
                        </span>
                      </div>
                      {selected.client.dedication_hours && (
                        <ProgressBar value={totalHours} max={selected.client.dedication_hours}
                          color={hoursColor(totalHours, selected.client.dedication_hours)} />
                      )}
                    </div>

                    {/* deliverables progress */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600 }}>Entregas</span>
                        <span style={{ color: selected.deliverables.length > 0 && doneCount === selected.deliverables.length ? "var(--pandora-green-400)" : "var(--pandora-ink-600)" }}>
                          {doneCount} / {selected.deliverables.length}
                        </span>
                      </div>
                      <ProgressBar value={doneCount} max={Math.max(selected.deliverables.length, 1)}
                        color={doneCount === selected.deliverables.length && selected.deliverables.length > 0 ? "var(--pandora-green-400)" : "var(--pandora-violet-600)"} />
                    </div>

                    {/* deliverables list */}
                    {selected.deliverables.length > 0 && (
                      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                        {selected.deliverables.map(d => (
                          <li key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                            <span style={{ color: d.done ? "var(--pandora-green-400)" : "var(--pandora-ink-300)" }}>
                              {d.done ? "✓" : "○"}
                            </span>
                            <span style={{ textDecoration: d.done ? "line-through" : "none", color: d.done ? "var(--pandora-ink-400)" : "var(--pandora-ink-700)" }}>
                              {d.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* ── FINANCEIRO ── */}
                {activeTab === "financeiro" && (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    <p style={{ fontSize: 14, color: "var(--pandora-ink-400)", margin: 0 }}>
                      Financeiro em breve — integração com Asaas (cobranças e notas fiscais).
                    </p>
                  </div>
                )}

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── client card ────────────────────────────────────────────────────────────

function ClientCard({ client, month, onClick, selected }: {
  client: Client; month: Date; onClick: () => void; selected: boolean;
}) {
  const [summary, setSummary] = useState<{ deliverables: number; done: number; hours: number } | null>(null);

  useEffect(() => {
    const mk = monthKey(month);
    Promise.all([
      fetch(`/api/deliverables?client_id=${client.id}&month=${mk}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/hours?client_id=${client.id}&month=${mk}`).then(r => r.ok ? r.json() : []),
    ]).then(([deliverables, hours]: [Deliverable[], HoursEntry[]]) => {
      setSummary({
        deliverables: deliverables.length,
        done: deliverables.filter(d => d.done).length,
        hours: hours.reduce((s, e) => s + Number(e.hours), 0),
      });
    });
  }, [client.id, month]);

  return (
    <div onClick={onClick}
      style={{
        background: selected ? "var(--pandora-violet-950)" : "var(--pandora-ink-0)",
        border: `1.5px solid ${selected ? "var(--pandora-violet-600)" : "var(--pandora-ink-100)"}`,
        borderRadius: 12, padding: 18, cursor: "pointer", transition: "border-color 0.15s",
      }}
      onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = "var(--pandora-violet-400)"; }}
      onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLElement).style.borderColor = "var(--pandora-ink-100)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-chakra)", color: selected ? "#fff" : "var(--pandora-ink-900)" }}>
          {client.company_name}
        </span>
        {client.health_score && (
          <span style={{ background: healthColor(client.health_score), color: "#fff", borderRadius: 20, fontSize: 12, fontWeight: 800, padding: "2px 10px", fontFamily: "var(--font-chakra)" }}>
            {client.health_score}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: selected ? "rgba(255,255,255,0.5)" : "var(--pandora-ink-400)" }}>Fee mensal</span>
          <span style={{ fontWeight: 600, color: selected ? "rgba(255,255,255,0.9)" : "var(--pandora-ink-700)" }}>
            {formatBRL(client.monthly_fee)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: selected ? "rgba(255,255,255,0.5)" : "var(--pandora-ink-400)" }}>Horas</span>
          <span style={{ fontWeight: 600, color: summary ? hoursColor(summary.hours, client.dedication_hours ?? undefined) : (selected ? "rgba(255,255,255,0.5)" : "var(--pandora-ink-400)") }}>
            {summary ? `${summary.hours.toFixed(1)}h` : "—"}{client.dedication_hours ? ` / ${client.dedication_hours}h` : ""}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
          <span style={{ color: selected ? "rgba(255,255,255,0.5)" : "var(--pandora-ink-400)" }}>Entregas</span>
          <span style={{ fontWeight: 600, color: selected ? "rgba(255,255,255,0.9)" : "var(--pandora-ink-700)" }}>
            {summary ? `${summary.done}/${summary.deliverables}` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
