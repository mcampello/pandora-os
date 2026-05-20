"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus, Search, X, ExternalLink, Copy, Check, Eye, EyeOff,
  Zap, FileText,
} from "lucide-react";
import type { ProposalWithRefs, ProposalStatus } from "@/lib/types";
import {
  PROPOSAL_STATUS_LABEL, PROPOSAL_STATUS_COLOR,
  formatBRL, fmtDate, inputStyle,
} from "@/lib/docs";
import { FilterChip, Field } from "@/components/FormUI";

const STATUS_ORDER: ProposalStatus[] = ["draft", "sent", "viewed", "accepted", "rejected", "expired"];

interface FormState {
  title: string;
  content_md: string;
  value: string;
  client_id: string;
  opportunity_id: string;
  status: ProposalStatus;
}

const emptyForm = (): FormState => ({
  title: "", content_md: "", value: "", client_id: "", opportunity_id: "", status: "draft",
});

function PropostasInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oppId = searchParams.get("opportunity_id") ?? "";
  const clientId = searchParams.get("client_id") ?? "";

  const [proposals, setProposals] = useState<ProposalWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<ProposalStatus | "all">("all");
  const [filterClient, setFilterClient] = useState(clientId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ProposalWithRefs | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (oppId) params.set("opportunity_id", oppId);
    const res = await fetch(`/api/proposals?${params}`);
    if (res.ok) setProposals(await res.json());
    setLoading(false);
  }, [oppId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setDrawerOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const clientOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; company_name: string }[] = [];
    for (const p of proposals) {
      if (p.client && !seen.has(p.client.id)) {
        seen.add(p.client.id);
        result.push(p.client);
      }
    }
    return result.sort((a, b) => a.company_name.localeCompare(b.company_name));
  }, [proposals]);

  const filtered = useMemo(() => proposals.filter(p => {
    if (filterStatus !== "all" && p.status !== filterStatus) return false;
    if (filterClient && p.client_id !== filterClient) return false;
    if (query) {
      const hay = [p.title, p.client?.company_name, p.opportunity?.title].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }), [proposals, filterStatus, filterClient, query]);

  const statusCounts = useMemo(() => proposals.reduce<Record<string, number>>((acc, p) => {
    acc[p.status] = (acc[p.status] ?? 0) + 1;
    return acc;
  }, {}), [proposals]);

  function openCreate() {
    setEditing(null);
    setSaveError(null);
    setPreview(false);
    setForm({ ...emptyForm(), opportunity_id: oppId, client_id: clientId });
    setDrawerOpen(true);
  }

  function openEdit(p: ProposalWithRefs) {
    setEditing(p);
    setSaveError(null);
    setPreview(false);
    setForm({
      title: p.title,
      content_md: p.content_md ?? "",
      value: p.value != null ? String(p.value) : "",
      client_id: p.client_id ?? "",
      opportunity_id: p.opportunity_id ?? "",
      status: p.status,
    });
    setDrawerOpen(true);
  }

  async function saveForm() {
    if (!form.title.trim()) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      title: form.title.trim(),
      content_md: form.content_md.trim() || null,
      value: form.value ? parseFloat(form.value) : null,
      client_id: form.client_id || null,
      opportunity_id: form.opportunity_id || null,
      status: form.status,
    };

    const res = editing
      ? await fetch(`/api/proposals/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    setSaving(false);
    if (res.ok) { setDrawerOpen(false); await load(); }
    else { const b = await res.json().catch(() => ({})); setSaveError(b.error ?? "Erro ao salvar."); }
  }

  async function generateWithAI() {
    if (!form.title.trim()) { setSaveError("Preencha o título antes de gerar."); return; }
    setGenerating(true);
    setSaveError(null);
    try {
      const res = await fetch("/api/proposals/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: form.title, context: form.content_md }),
      });
      if (res.ok) {
        const { content_md } = await res.json();
        setForm(f => ({ ...f, content_md }));
        setPreview(true);
      } else {
        const b = await res.json().catch(() => ({}));
        setSaveError(b.error ?? "Erro ao gerar proposta.");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function patchStatus(p: ProposalWithRefs, status: ProposalStatus) {
    setActionError(null);
    try {
      const res = await fetch(`/api/proposals/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string };
        setActionError(b.error ?? "Erro ao atualizar status.");
        setTimeout(() => setActionError(null), 4000);
        return;
      }
      await load();
    } catch {
      setActionError("Erro de conexão. Tente novamente.");
      setTimeout(() => setActionError(null), 4000);
    }
  }

  function copyLink(p: ProposalWithRefs) {
    if (!p.viewer_url) return;
    navigator.clipboard.writeText(p.viewer_url);
    setCopied(p.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Propostas</h1>
          <span className="pda-chip">{proposals.length}</span>
        </div>
        <div className="pda-topbar-right">
          <button type="button" className="pda-btn" onClick={openCreate}>
            <Plus size={14} /> Nova
          </button>
        </div>
      </header>

      <div className="pda-content">
        <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 180 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--pandora-ink-400)" }} />
            <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar…" style={{ ...inputStyle, paddingLeft: 30 }} />
          </div>
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            style={{ ...inputStyle, minWidth: 180, flex: "1 1 180px" }}
          >
            <option value="">Todos os clientes</option>
            {clientOptions.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
          </select>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: oppId ? 12 : 20, flexWrap: "wrap" }}>
          <FilterChip active={filterStatus === "all"} onClick={() => setFilterStatus("all")}>
            Todas {proposals.length}
          </FilterChip>
          {STATUS_ORDER.map(st => (
            <FilterChip key={st} active={filterStatus === st} color={PROPOSAL_STATUS_COLOR[st]} onClick={() => setFilterStatus(filterStatus === st ? "all" : st)}>
              {PROPOSAL_STATUS_LABEL[st]} {statusCounts[st] ?? 0}
            </FilterChip>
          ))}
        </div>

        {oppId && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--pandora-violet-50, #f8f4ff)", border: "1px solid var(--pandora-violet-200, #e0d0f5)", borderRadius: "var(--radius-sm)", marginBottom: 20, fontSize: 12, color: "var(--pandora-violet-700, #6d1aa0)" }}>
            <span>Filtrado por oportunidade</span>
            <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "2px 8px", marginLeft: "auto" }} onClick={() => router.push("/propostas")}>
              <X size={10} /> Limpar filtro
            </button>
          </div>
        )}

        {actionError && (
          <div className="pda-error-banner" style={{ marginBottom: 12 }}>{actionError}</div>
        )}

        {/* Lista */}
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>
        ) : filtered.length === 0 ? (
          <div className="pda-empty">
            <FileText />
            <div className="pda-empty-title">Nenhuma proposta{oppId ? " vinculada a esta oportunidade" : ""}</div>
            <div className="pda-empty-desc">
              {oppId
                ? "Crie uma proposta para esta oportunidade ou remova o filtro para ver todas."
                : "Crie a primeira proposta ou vincule a uma oportunidade."}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="pda-btn" onClick={openCreate}><Plus size={14} /> Nova proposta</button>
              {oppId && (
                <button type="button" className="pda-btn pda-btn-ghost" onClick={() => router.push("/propostas")}><X size={14} /> Ver todas</button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--pandora-ink-25)" }}>
                  {["Título", "Cliente", "Oportunidade", "Valor", "Status", "Criada", ""].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pandora-ink-400)", borderBottom: "1px solid var(--pandora-ink-100)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => (
                  <tr key={p.id} onClick={() => router.push(`/propostas/${p.id}`)} style={{ cursor: "pointer", borderBottom: "1px solid var(--pandora-ink-50)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--pandora-ink-25)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--pandora-violet-900)" }}>{p.title}</td>
                    <td style={{ padding: "10px 12px", color: "var(--pandora-ink-600)" }}>{p.client?.company_name ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--pandora-ink-500)", fontSize: 12 }}>{p.opportunity?.title ?? "—"}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12 }}>{formatBRL(p.value)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className="pda-badge" style={{ background: `${PROPOSAL_STATUS_COLOR[p.status]}18`, color: PROPOSAL_STATUS_COLOR[p.status] }}>
                        {PROPOSAL_STATUS_LABEL[p.status]}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pandora-ink-400)" }}>{fmtDate(p.created_at)}</td>
                    <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {p.status === "draft" && (
                          <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => patchStatus(p, "sent")}>Enviar</button>
                        )}
                        {p.viewer_url && p.status !== "draft" && (
                          <>
                            <a href={p.viewer_url} target="_blank" rel="noopener noreferrer" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={e => e.stopPropagation()}>
                              <ExternalLink size={11} />
                            </a>
                            <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => copyLink(p)}>
                              {copied === p.id ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drawer */}
      {drawerOpen && (
        <>
          <div className="pda-drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="pda-drawer" style={{ width: "min(680px, 100vw)" }} role="dialog" aria-label={editing ? "Editar proposta" : "Nova proposta"}>
            <div className="pda-drawer-head">
              <span className="pda-eyebrow">{editing ? "Editar proposta" : "Nova proposta"}</span>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {editing?.viewer_url && editing.status !== "draft" && (
                  <a href={editing.viewer_url} target="_blank" rel="noopener noreferrer" className="pda-btn pda-btn-ghost" style={{ fontSize: 12, padding: "5px 10px" }}>
                    <ExternalLink size={12} /> Visualizar
                  </a>
                )}
                <button type="button" className="pda-collapse-btn" onClick={() => setDrawerOpen(false)} aria-label="Fechar"><X size={18} /></button>
              </div>
            </div>
            <div className="pda-drawer-body">
              <Field label="Título *">
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="Ex: Proposta Fee Mensal — Baila Creative" autoFocus />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ProposalStatus }))} style={inputStyle}>
                    {STATUS_ORDER.map(s => <option key={s} value={s}>{PROPOSAL_STATUS_LABEL[s]}</option>)}
                  </select>
                </Field>
                <Field label="Valor (R$)">
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} style={inputStyle} placeholder="0,00" min={0} step={0.01} />
                </Field>
              </div>

              {/* Editor Markdown */}
              <Field label={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Conteúdo (Markdown)</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setPreview(v => !v)}>
                      {preview ? <><EyeOff size={11} /> Editar</> : <><Eye size={11} /> Preview</>}
                    </button>
                    <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={generateWithAI} disabled={generating}>
                      <Zap size={11} /> {generating ? "Gerando…" : "Gerar com AI"}
                    </button>
                  </div>
                </div>
              }>
                {preview ? (
                  <div style={{ border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-sm)", padding: "16px 20px", minHeight: 300, fontSize: 13, lineHeight: 1.7, overflow: "auto", maxHeight: 500, background: "#fff", color: "var(--pandora-ink-800)" }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.content_md || "_Conteúdo vazio_"}</ReactMarkdown>
                  </div>
                ) : (
                  <textarea
                    value={form.content_md}
                    onChange={e => setForm(f => ({ ...f, content_md: e.target.value }))}
                    style={{ ...inputStyle, height: 320, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6 }}
                    placeholder={"# Título da proposta\n\n## Objeto\n\nDescrição do serviço…\n\n## Investimento\n\n| Item | Valor |\n|------|------|\n| … | R$ 0,00 |"}
                  />
                )}
              </Field>
            </div>
            <div className="pda-drawer-foot" style={{ flexDirection: "column", gap: 10 }}>
              {saveError && <div className="pda-error-banner">{saveError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="pda-btn" disabled={saving || !form.title.trim()} onClick={saveForm}>
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className="pda-btn pda-btn-ghost" onClick={() => setDrawerOpen(false)}>Cancelar</button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}


export default function PropostasPage() {
  return (
    <Suspense fallback={<p style={{ padding: 32, fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>}>
      <PropostasInner />
    </Suspense>
  );
}
