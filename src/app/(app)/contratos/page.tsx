"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useRouter, useSearchParams } from "next/navigation";
import TaskBell from "@/components/TaskBell";
import Link from "next/link";
import {
  Plus, Search, X, ExternalLink, Copy, Check, Eye, EyeOff, ScrollText, Sparkles,
} from "lucide-react";
import type { ContractWithRefs, ContractStatus } from "@/lib/types";
import {
  CONTRACT_STATUS_LABEL, CONTRACT_STATUS_COLOR,
  formatBRL, fmtDate, inputStyle,
} from "@/lib/docs";
import { FilterChip, Field } from "@/components/FormUI";

const STATUS_ORDER: ContractStatus[] = ["draft", "in_review", "signed", "active", "ended", "cancelled"];

interface FormState {
  title: string;
  content_md: string;
  value: string;
  client_id: string;
  opportunity_id: string;
  company_id: string;
  status: ContractStatus;
  starts_at: string;
  ends_at: string;
}

const emptyForm = (): FormState => ({
  title: "", content_md: "", value: "", client_id: "", opportunity_id: "", company_id: "",
  status: "draft", starts_at: "", ends_at: "",
});

function ContratosInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oppId = searchParams.get("opportunity_id") ?? "";
  const clientId = searchParams.get("client_id") ?? "";

  const [contracts, setContracts] = useState<ContractWithRefs[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<ContractStatus | "all">("all");
  const [filterClient, setFilterClient] = useState(clientId);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<ContractWithRefs | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (oppId) params.set("opportunity_id", oppId);
    const res = await fetch(`/api/contracts?${params}`);
    if (res.ok) setContracts(await res.json());
    setLoading(false);
  }, [oppId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setDrawerOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || companiesList.length > 0) return;
    fetch("/api/companies").then(r => r.ok ? r.json() : []).then(setCompaniesList);
  }, [drawerOpen, companiesList.length]);

  const clientOptions = useMemo(() => {
    const seen = new Set<string>();
    const result: { id: string; company_name: string }[] = [];
    for (const c of contracts) {
      if (c.client && !seen.has(c.client.id)) {
        seen.add(c.client.id);
        result.push(c.client);
      }
    }
    return result.sort((a, b) => a.company_name.localeCompare(b.company_name));
  }, [contracts]);

  const filtered = useMemo(() => contracts.filter(c => {
    if (filterStatus !== "all" && c.status !== filterStatus) return false;
    if (filterClient && c.client_id !== filterClient) return false;
    if (query) {
      const hay = [c.title, c.client?.company_name, c.opportunity?.title].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(query.toLowerCase())) return false;
    }
    return true;
  }), [contracts, filterStatus, filterClient, query]);

  const statusCounts = useMemo(() => contracts.reduce<Record<string, number>>((acc, c) => {
    acc[c.status] = (acc[c.status] ?? 0) + 1;
    return acc;
  }, {}), [contracts]);

  function openCreate() {
    setEditing(null);
    setSaveError(null);
    setPreview(false);
    setForm({ ...emptyForm(), opportunity_id: oppId, client_id: clientId });
    setDrawerOpen(true);
  }

  function openEdit(c: ContractWithRefs) {
    setEditing(c);
    setSaveError(null);
    setPreview(false);
    setForm({
      title: c.title,
      content_md: c.content_md ?? "",
      value: c.value != null ? String(c.value) : "",
      client_id: c.client_id ?? "",
      opportunity_id: c.opportunity_id ?? "",
      company_id: c.company_id ?? "",
      status: c.status,
      starts_at: c.starts_at ?? "",
      ends_at: c.ends_at ?? "",
    });
    setDrawerOpen(true);
  }

  async function saveForm() {
    if (!form.title.trim() || !form.company_id) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      title: form.title.trim(),
      content_md: form.content_md.trim() || null,
      value: form.value ? parseFloat(form.value) : null,
      client_id: form.client_id || null,
      opportunity_id: form.opportunity_id || null,
      company_id: form.company_id,
      status: form.status,
      starts_at: form.starts_at || null,
      ends_at: form.ends_at || null,
    };

    const res = editing
      ? await fetch(`/api/contracts/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch("/api/contracts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });

    setSaving(false);
    if (res.ok) { setDrawerOpen(false); await load(); }
    else { const b = await res.json().catch(() => ({})); setSaveError(b.error ?? "Erro ao salvar."); }
  }

  function copyLink(c: ContractWithRefs) {
    if (!c.viewer_url) return;
    navigator.clipboard.writeText(c.viewer_url);
    setCopied(c.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Contratos</h1>
          <span className="pda-chip">{contracts.length}</span>
        </div>
        <div className="pda-topbar-right">
          <Link href="/contratos/novo" className="pda-btn-ghost" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6, textDecoration: "none" }}>
            <Sparkles size={14} /> Com IA
          </Link>
          <button type="button" className="pda-btn" onClick={openCreate}>
            <Plus size={14} /> Novo
          </button>
          <TaskBell />
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
            Todos {contracts.length}
          </FilterChip>
          {STATUS_ORDER.map(st => (
            <FilterChip key={st} active={filterStatus === st} color={CONTRACT_STATUS_COLOR[st]} onClick={() => setFilterStatus(filterStatus === st ? "all" : st)}>
              {CONTRACT_STATUS_LABEL[st]} {statusCounts[st] ?? 0}
            </FilterChip>
          ))}
        </div>

        {oppId && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "var(--pandora-violet-50, #f8f4ff)", border: "1px solid var(--pandora-violet-200, #e0d0f5)", borderRadius: "var(--radius-sm)", marginBottom: 20, fontSize: 12, color: "var(--pandora-violet-700, #6d1aa0)" }}>
            <span>Filtrado por oportunidade</span>
            <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "2px 8px", marginLeft: "auto" }} onClick={() => router.push("/contratos")}>
              <X size={10} /> Limpar filtro
            </button>
          </div>
        )}

        {actionError && (
          <div className="pda-error-banner" style={{ marginBottom: 12 }}>{actionError}</div>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>
        ) : filtered.length === 0 ? (
          <div className="pda-empty">
            <ScrollText />
            <div className="pda-empty-title">Nenhum contrato{oppId ? " vinculado a esta oportunidade" : ""}</div>
            <div className="pda-empty-desc">
              {oppId
                ? "Crie um contrato para esta oportunidade ou remova o filtro para ver todos."
                : "Crie o primeiro contrato ou vincule a uma oportunidade."}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="pda-btn" onClick={openCreate}><Plus size={14} /> Novo contrato</button>
              {oppId && (
                <button type="button" className="pda-btn pda-btn-ghost" onClick={() => router.push("/contratos")}><X size={14} /> Ver todos</button>
              )}
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "var(--pandora-ink-25)" }}>
                  {["Título", "Cliente", "Oportunidade", "Valor", "Vigência", "Status", ""].map(h => (
                    <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pandora-ink-400)", borderBottom: "1px solid var(--pandora-ink-100)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} onClick={() => router.push(`/contratos/${c.id}`)} style={{ cursor: "pointer", borderBottom: "1px solid var(--pandora-ink-50)" }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--pandora-ink-25)"; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}>
                    <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--pandora-violet-900)" }}>{c.title}</td>
                    <td style={{ padding: "10px 12px", color: "var(--pandora-ink-600)" }}>{c.client?.company_name ?? "—"}</td>
                    <td style={{ padding: "10px 12px", color: "var(--pandora-ink-500)", fontSize: 12 }}>{c.opportunity?.title ?? "—"}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12 }}>{formatBRL(c.value)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: "var(--pandora-ink-500)", fontFamily: "var(--font-mono)" }}>
                      {c.starts_at ? `${fmtDate(c.starts_at)} → ${fmtDate(c.ends_at)}` : "—"}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span className="pda-badge" style={{ background: `${CONTRACT_STATUS_COLOR[c.status]}18`, color: CONTRACT_STATUS_COLOR[c.status] }}>
                        {CONTRACT_STATUS_LABEL[c.status]}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 6 }}>
                        {c.viewer_url && c.status !== "draft" && (
                          <>
                            <a href={c.viewer_url} target="_blank" rel="noopener noreferrer" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={e => e.stopPropagation()}>
                              <ExternalLink size={11} />
                            </a>
                            <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => copyLink(c)}>
                              {copied === c.id ? <Check size={11} /> : <Copy size={11} />}
                            </button>
                          </>
                        )}
                        <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }}
                          title="Duplicar contrato"
                          onClick={() => router.push(`/contratos/novo?source=${c.id}&mode=duplicate`)}>
                          Duplicar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {drawerOpen && (
        <>
          <div className="pda-drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="pda-drawer" style={{ width: "min(680px, 100vw)" }} role="dialog" aria-label={editing ? "Editar contrato" : "Novo contrato"}>
            <div className="pda-drawer-head">
              <span className="pda-eyebrow">{editing ? "Editar contrato" : "Novo contrato"}</span>
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
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="Ex: Contrato de Prestação de Serviços — Baila Creative" autoFocus />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ContractStatus }))} style={inputStyle}>
                    {STATUS_ORDER.map(s => <option key={s} value={s}>{CONTRACT_STATUS_LABEL[s]}</option>)}
                  </select>
                </Field>
                <Field label="Valor (R$)">
                  <input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} style={inputStyle} placeholder="0,00" min={0} step={0.01} />
                </Field>
                <Field label="Início">
                  <input type="date" value={form.starts_at} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} style={inputStyle} />
                </Field>
              </div>
              <Field label="Término">
                <input type="date" value={form.ends_at} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))} style={inputStyle} />
              </Field>

              <Field label="Empresa *">
                <select value={form.company_id} onChange={e => setForm(f => ({ ...f, company_id: e.target.value }))} style={inputStyle}>
                  <option value="">— selecione a empresa —</option>
                  {companiesList.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              <Field label={
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--pandora-ink-500)", fontFamily: "var(--font-display)", letterSpacing: "0.06em", textTransform: "uppercase" }}>Conteúdo (Markdown)</span>
                  <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setPreview(v => !v)}>
                    {preview ? <><EyeOff size={11} /> Editar</> : <><Eye size={11} /> Preview</>}
                  </button>
                </div>
              }>
                {preview ? (
                  <div style={{ border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-sm)", padding: "16px 20px", minHeight: 300, fontSize: 13, lineHeight: 1.7, overflow: "auto", maxHeight: 500 }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.content_md || "_Conteúdo vazio_"}</ReactMarkdown>
                  </div>
                ) : (
                  <textarea
                    value={form.content_md}
                    onChange={e => setForm(f => ({ ...f, content_md: e.target.value }))}
                    style={{ ...inputStyle, height: 320, resize: "vertical", fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6 }}
                    placeholder={"# CONTRATO DE PRESTAÇÃO DE SERVIÇOS\n\n## PARTES\n\n**CONTRATANTE:**\n[Nome]\n\n**CONTRATADO:**\nPANDORA TECH LTDA…\n\n## CLÁUSULA PRIMEIRA — DO OBJETO\n\n1.1. …"}
                  />
                )}
              </Field>
            </div>
            <div className="pda-drawer-foot" style={{ flexDirection: "column", gap: 10 }}>
              {saveError && <div className="pda-error-banner">{saveError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="pda-btn" disabled={saving || !form.title.trim() || !form.company_id} onClick={saveForm}>
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

export default function ContratosPage() {
  return (
    <Suspense fallback={<p style={{ padding: 32, fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>}>
      <ContratosInner />
    </Suspense>
  );
}
