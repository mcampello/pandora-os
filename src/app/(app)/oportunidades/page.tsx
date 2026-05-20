"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type {
  Contact,
  OpportunityChannel,
  OpportunityConfidence,
  OpportunityStatus,
  OpportunityWithContact,
} from "@/lib/types";
import {
  STATUS_LABEL,
  STATUS_COLOR,
  CHANNEL_LABEL,
  CONFIDENCE_LABEL,
  CONFIDENCE_COLOR,
  STATUS_COLUMNS,
  NEXT_STATUS,
  timeAgo,
  inputStyle,
} from "@/lib/opportunities";
import {
  Plus,
  Search,
  Zap,
  LayoutGrid,
  List,
  X,
  ChevronRight,
  User,
  FileText,
  ScrollText,
} from "lucide-react";

type ViewMode = "kanban" | "list";

interface OppFormState {
  title: string;
  description: string;
  channel: OpportunityChannel;
  confidence: OpportunityConfidence;
  status: OpportunityStatus;
  notes: string;
  contact_id: string;
  value: string;
  contract_model: string;
  company: string;
}

const emptyForm = (): OppFormState => ({
  title: "",
  description: "",
  channel: "manual",
  confidence: "medium",
  status: "new",
  notes: "",
  contact_id: "",
  value: "",
  contract_model: "",
  company: "",
});

function OportunidadesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const contactIdParam = searchParams.get("contact_id");

  const [opportunities, setOpportunities] = useState<OpportunityWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<OpportunityStatus | "all">("all");
  const [filterChannel, setFilterChannel] = useState<OpportunityChannel | "all">("all");
  const [filterConfidence, setFilterConfidence] = useState<OpportunityConfidence | "all">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("kanban");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<OpportunityWithContact | null>(null);
  const [form, setForm] = useState<OppFormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [contactFilterName, setContactFilterName] = useState<string | null>(null);
  const [contactSearch, setContactSearch] = useState("");
  const [contactHits, setContactHits] = useState<Pick<Contact, "id" | "name" | "email" | "company">[]>([]);
  const [sortCol, setSortCol] = useState<SortCol>("detected");
  const [sortAsc, setSortAsc] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const supabase = supabaseBrowser();

  useEffect(() => {
    const saved = localStorage.getItem("opportunities-view") as ViewMode | null;
    if (saved === "kanban" || saved === "list") setViewMode(saved);
  }, []);

  function toggleView(mode: ViewMode) {
    setViewMode(mode);
    localStorage.setItem("opportunities-view", mode);
  }

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (contactIdParam) params.set("contact_id", contactIdParam);
    const res = await fetch(`/api/opportunities?${params}`);
    if (res.ok) {
      const data = await res.json();
      setOpportunities(data as OpportunityWithContact[]);
    }
    setLoading(false);
  }, [contactIdParam]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!contactIdParam) {
      setContactFilterName(null);
      return;
    }
    const fromList = opportunities.find((o) => o.contact_id === contactIdParam)?.contact?.name;
    if (fromList) {
      setContactFilterName(fromList);
      return;
    }
    supabase
      .from("contacts")
      .select("name")
      .eq("id", contactIdParam)
      .maybeSingle()
      .then(({ data }) => setContactFilterName(data?.name ?? "Contato"));
  }, [contactIdParam, opportunities, supabase]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen || contactSearch.length < 2) {
      setContactHits([]);
      return;
    }
    const t = setTimeout(async () => {
      const q = contactSearch.trim();
      const { data } = await supabase
        .from("contacts")
        .select("id, name, email, company")
        .or(`name.ilike.%${q}%,email.ilike.%${q}%`)
        .limit(8);
      setContactHits((data as Pick<Contact, "id" | "name" | "email" | "company">[]) ?? []);
    }, 200);
    return () => clearTimeout(t);
  }, [contactSearch, drawerOpen, supabase]);

  const statusCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of opportunities) {
      map[o.status] = (map[o.status] ?? 0) + 1;
    }
    return map;
  }, [opportunities]);

  const processed = useMemo(() => {
    const q = query.toLowerCase().trim();
    let result = opportunities.filter((o) => {
      if (filterStatus !== "all" && o.status !== filterStatus) return false;
      if (filterChannel !== "all" && o.channel !== filterChannel) return false;
      if (filterConfidence !== "all" && o.confidence !== filterConfidence) return false;
      if (q) {
        const hay = [o.title, o.description, o.contact?.name, o.contact?.company]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortCol === "title") cmp = a.title.localeCompare(b.title, "pt-BR");
      else if (sortCol === "contact")
        cmp = (a.contact?.name ?? "zzz").localeCompare(b.contact?.name ?? "zzz", "pt-BR");
      else if (sortCol === "status") cmp = a.status.localeCompare(b.status);
      else if (sortCol === "channel") cmp = a.channel.localeCompare(b.channel);
      else if (sortCol === "company")
        cmp = (a.company ?? "zzz").localeCompare(b.company ?? "zzz", "pt-BR");
      else if (sortCol === "value") cmp = (a.value ?? -1) - (b.value ?? -1);
      else if (sortCol === "confidence") {
        const order: Record<string, number> = { very_high: 0, high: 1, medium: 2, low: 3 };
        cmp = (order[a.confidence] ?? 9) - (order[b.confidence] ?? 9);
      } else cmp = a.detected_at < b.detected_at ? -1 : a.detected_at > b.detected_at ? 1 : 0;
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [opportunities, query, filterStatus, filterChannel, filterConfidence, sortCol, sortAsc]);

  const byStatus = useMemo(() => {
    const map: Record<OpportunityStatus, OpportunityWithContact[]> = {
      new: [],
      qualified: [],
      converted: [],
      dismissed: [],
    };
    for (const o of processed) map[o.status].push(o);
    return map;
  }, [processed]);

  function openCreate() {
    setEditing(null);
    setSaveError(null);
    setForm({
      ...emptyForm(),
      contact_id: contactIdParam ?? "",
    });
    setContactSearch("");
    setContactHits([]);
    setDrawerOpen(true);
  }

  function openEdit(opp: OpportunityWithContact) {
    router.push(`/oportunidades/${opp.id}`);
  }

  async function patchStatus(opp: OpportunityWithContact, status: OpportunityStatus) {
    if (status === "converted" && !opp.contact_id) {
      setActionError("Vincule um contato antes de converter a oportunidade.");
      setTimeout(() => setActionError(null), 4000);
      return;
    }
    const res = await fetch(`/api/opportunities/${opp.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, contact_id: opp.contact_id }),
    });
    if (res.ok) {
      await load();
    } else {
      const body = await res.json().catch(() => ({}));
      setActionError(body.error ?? "Erro ao atualizar oportunidade.");
      setTimeout(() => setActionError(null), 4000);
    }
  }

  async function saveForm() {
    if (!form.title.trim()) return;
    setSaving(true);
    setSaveError(null);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      channel: form.channel,
      confidence: form.confidence,
      status: form.status,
      notes: form.notes.trim() || null,
      contact_id: form.contact_id || null,
      value: form.value.trim() ? parseFloat(form.value) : null,
      contract_model: form.contract_model.trim() || null,
      company: form.company.trim() || null,
    };

    const res = editing
      ? await fetch(`/api/opportunities/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      : await fetch("/api/opportunities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

    setSaving(false);
    if (res.ok) {
      setDrawerOpen(false);
      await load();
    } else {
      const body = await res.json().catch(() => ({}));
      setSaveError(body.error ?? "Erro ao salvar. Tente novamente.");
    }
  }

  function clearContactFilter() {
    router.push("/oportunidades");
  }

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Oportunidades</h1>
          <span className="pda-chip">{opportunities.length}</span>
        </div>
        <div className="pda-topbar-right" style={{ gap: 8 }}>
          <div className="pda-view-toggle">
            <button
              type="button"
              className={`pda-view-toggle-btn${viewMode === "kanban" ? " active" : ""}`}
              onClick={() => toggleView("kanban")}
              title="Kanban"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              type="button"
              className={`pda-view-toggle-btn${viewMode === "list" ? " active" : ""}`}
              onClick={() => toggleView("list")}
              title="Lista"
            >
              <List size={15} />
            </button>
          </div>
          <button type="button" className="pda-btn" onClick={openCreate}>
            <Plus size={14} /> Nova
          </button>
        </div>
      </header>

      <div className="pda-content">
        {actionError && (
          <div className="pda-error-banner">
            {actionError}
          </div>
        )}
        {contactIdParam && contactFilterName && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
              padding: "8px 12px",
              background: "var(--pandora-violet-50)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
            }}
          >
            <User size={14} color="var(--pandora-violet-600)" />
            <span>
              Filtrando por contato:{" "}
              <Link href={`/clientes/${contactIdParam}`} style={{ fontWeight: 600, color: "var(--pandora-violet-700)" }}>
                {contactFilterName}
              </Link>
            </span>
            <button
              type="button"
              onClick={clearContactFilter}
              className="pda-btn pda-btn-ghost"
              style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 12 }}
            >
              Limpar filtro
            </button>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--pandora-ink-400)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </div>
          <select
            value={filterChannel}
            onChange={(e) => setFilterChannel(e.target.value as OpportunityChannel | "all")}
            style={{ padding: "7px 10px", border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-md)", fontSize: 13, background: "#fff" }}
          >
            <option value="all">Todos os canais</option>
            {(Object.keys(CHANNEL_LABEL) as OpportunityChannel[]).map((c) => (
              <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
            ))}
          </select>
          <select
            value={filterConfidence}
            onChange={(e) => setFilterConfidence(e.target.value as OpportunityConfidence | "all")}
            style={{ padding: "7px 10px", border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-md)", fontSize: 13, background: "#fff" }}
          >
            <option value="all">Toda confiança</option>
            {(Object.keys(CONFIDENCE_LABEL) as OpportunityConfidence[]).map((c) => (
              <option key={c} value={c}>{CONFIDENCE_LABEL[c]}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          <FilterChip active={filterStatus === "all"} onClick={() => setFilterStatus("all")}>
            Todos {opportunities.length}
          </FilterChip>
          {STATUS_COLUMNS.map((st) => (
            <FilterChip
              key={st}
              active={filterStatus === st}
              color={STATUS_COLOR[st]}
              onClick={() => setFilterStatus(filterStatus === st ? "all" : st)}
            >
              {STATUS_LABEL[st]} {statusCounts[st] ?? 0}
            </FilterChip>
          ))}
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>
        ) : opportunities.length === 0 ? (
          <div className="pda-empty">
            <Zap />
            <div className="pda-empty-title">Nenhuma oportunidade</div>
            <div className="pda-empty-desc">Crie a primeira oportunidade manualmente ou a partir de um contato.</div>
            <button type="button" className="pda-btn" onClick={openCreate}>
              <Plus size={14} /> Nova oportunidade
            </button>
          </div>
        ) : processed.length === 0 ? (
          <div className="pda-empty">
            <Zap />
            <div className="pda-empty-title">Nenhum resultado</div>
            <div className="pda-empty-desc">Ajuste os filtros ou limpe a busca.</div>
          </div>
        ) : viewMode === "kanban" ? (
          <div className="pda-kanban">
            {STATUS_COLUMNS.map((st) => (
              <div key={st} className={`pda-kanban-col${st === "dismissed" ? " dimmed" : ""}`}>
                <div className="pda-kanban-col-head">
                  <span style={{ color: STATUS_COLOR[st] }}>{STATUS_LABEL[st]}</span>
                  <span>{byStatus[st].length}</span>
                </div>
                <div className="pda-kanban-col-body">
                  {byStatus[st].map((opp) => (
                    <KanbanCard
                      key={opp.id}
                      opp={opp}
                      onEdit={() => openEdit(opp)}
                      onAdvance={() => {
                        const next = NEXT_STATUS[opp.status];
                        if (next) patchStatus(opp, next);
                      }}
                      onDismiss={() => patchStatus(opp, "dismissed")}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <OpportunityTable
            rows={processed}
            sortCol={sortCol}
            sortAsc={sortAsc}
            onSort={(col) => {
              if (sortCol === col) setSortAsc((v) => !v);
              else {
                setSortCol(col);
                setSortAsc(false);
              }
            }}
            onRowClick={openEdit}
          />
        )}
      </div>

      {drawerOpen && (
        <>
          <div className="pda-drawer-backdrop" onClick={() => setDrawerOpen(false)} aria-hidden />
          <aside className="pda-drawer" role="dialog" aria-label={editing ? "Editar oportunidade" : "Nova oportunidade"}>
            <div className="pda-drawer-head">
              <span className="pda-eyebrow">{editing ? "Editar oportunidade" : "Nova oportunidade"}</span>
              <button type="button" className="pda-collapse-btn" onClick={() => setDrawerOpen(false)} aria-label="Fechar">
                <X size={18} />
              </button>
            </div>
            <div className="pda-drawer-body">
              <Field label="Título *">
                <input
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  style={inputStyle}
                  placeholder="Título da oportunidade…"
                  autoFocus
                />
              </Field>
              <Field label="Descrição">
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  style={{ ...inputStyle, height: 80, resize: "vertical" }}
                  placeholder="Contexto (opcional)…"
                />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Canal">
                  <select
                    value={form.channel}
                    onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value as OpportunityChannel }))}
                    style={inputStyle}
                  >
                    {(Object.keys(CHANNEL_LABEL) as OpportunityChannel[]).map((c) => (
                      <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Confiança">
                  <select
                    value={form.confidence}
                    onChange={(e) => setForm((f) => ({ ...f, confidence: e.target.value as OpportunityConfidence }))}
                    style={inputStyle}
                  >
                    {(Object.keys(CONFIDENCE_LABEL) as OpportunityConfidence[]).map((c) => (
                      <option key={c} value={c}>{CONFIDENCE_LABEL[c]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as OpportunityStatus }))}
                  style={inputStyle}
                >
                  {STATUS_COLUMNS.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </Field>
              <Field label="Contato (opcional)">
                <input
                  value={contactSearch}
                  onChange={(e) => {
                    setContactSearch(e.target.value);
                    if (!e.target.value) setForm((f) => ({ ...f, contact_id: "" }));
                  }}
                  style={inputStyle}
                  placeholder="Buscar por nome ou email…"
                />
                {form.contact_id && (
                  <p style={{ fontSize: 11, color: "var(--pandora-ink-500)", margin: "4px 0 0" }}>
                    Selecionado ·{" "}
                    <button
                      type="button"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-danger)", fontSize: 11 }}
                      onClick={() => {
                        setForm((f) => ({ ...f, contact_id: "" }));
                        setContactSearch("");
                      }}
                    >
                      remover
                    </button>
                  </p>
                )}
                {contactHits.length > 0 && (
                  <ul style={{ listStyle: "none", margin: "6px 0 0", padding: 0, border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-sm)" }}>
                    {contactHits.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setForm((f) => ({ ...f, contact_id: c.id }));
                            setContactSearch(c.name);
                            setContactHits([]);
                          }}
                          style={{
                            width: "100%",
                            textAlign: "left",
                            padding: "8px 12px",
                            border: "none",
                            background: "transparent",
                            cursor: "pointer",
                            fontSize: 13,
                          }}
                        >
                          {c.name}
                          {c.company ? ` · ${c.company}` : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <Field label="Valor (R$)">
                  <input
                    type="number"
                    value={form.value}
                    onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
                    style={inputStyle}
                    placeholder="0,00"
                    min="0"
                    step="0.01"
                  />
                </Field>
                <Field label="Empresa">
                  <input
                    value={form.company}
                    onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
                    style={inputStyle}
                    placeholder="Nome da empresa…"
                  />
                </Field>
              </div>
              <Field label="Modelo de Contratação">
                <input
                  value={form.contract_model}
                  onChange={(e) => setForm((f) => ({ ...f, contract_model: e.target.value }))}
                  style={inputStyle}
                  placeholder="Ex: mensal, projeto, retainer…"
                />
              </Field>
              <Field label="Notas">
                <textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  style={{ ...inputStyle, height: 64, resize: "vertical" }}
                />
              </Field>

              {editing && (
                <div style={{ borderTop: "1px solid var(--pandora-ink-100)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                  <span className="pda-eyebrow">Documentos</span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Link
                      href={`/propostas?opportunity_id=${editing.id}`}
                      className="pda-btn pda-btn-ghost"
                      style={{ fontSize: 12, padding: "6px 12px", flex: 1, justifyContent: "center" }}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <FileText size={13} /> Propostas
                    </Link>
                    <Link
                      href={`/contratos?opportunity_id=${editing.id}`}
                      className="pda-btn pda-btn-ghost"
                      style={{ fontSize: 12, padding: "6px 12px", flex: 1, justifyContent: "center" }}
                      onClick={() => setDrawerOpen(false)}
                    >
                      <ScrollText size={13} /> Contratos
                    </Link>
                  </div>
                </div>
              )}

            </div>
            <div className="pda-drawer-foot" style={{ flexDirection: "column", gap: 12 }}>
              {saveError && <div className="pda-error-banner">{saveError}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="pda-btn" disabled={saving || !form.title.trim()} onClick={saveForm}>
                  {saving ? "Salvando…" : "Salvar"}
                </button>
                <button type="button" className="pda-btn pda-btn-ghost" onClick={() => setDrawerOpen(false)}>
                  Cancelar
                </button>
              </div>
            </div>
          </aside>
        </>
      )}
    </>
  );
}

function KanbanCard({
  opp,
  onEdit,
  onAdvance,
  onDismiss,
}: {
  opp: OpportunityWithContact;
  onEdit: () => void;
  onAdvance: () => void;
  onDismiss: () => void;
}) {
  const next = NEXT_STATUS[opp.status];
  return (
    <div className="pda-kanban-card" onClick={onEdit} onKeyDown={(e) => e.key === "Enter" && onEdit()} role="button" tabIndex={0}>
      <div className="pda-kanban-card-title">{opp.title}</div>
      <div className="pda-kanban-card-meta">
        <span style={{ color: CONFIDENCE_COLOR[opp.confidence], fontWeight: 600 }}>{CONFIDENCE_LABEL[opp.confidence]}</span>
        <span>·</span>
        <span>{CHANNEL_LABEL[opp.channel]}</span>
        <span>·</span>
        <span style={{ fontFamily: "var(--font-mono)" }}>{timeAgo(opp.detected_at)}</span>
      </div>
      {opp.contact_id ? (
        <Link
          href={`/clientes/${opp.contact_id}`}
          onClick={(e) => e.stopPropagation()}
          style={{ fontSize: 12, color: "var(--pandora-violet-600)", marginTop: 6, display: "inline-block" }}
        >
          {opp.contact?.name ?? "Ver contato"}
        </Link>
      ) : (
        <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", marginTop: 6, display: "block" }}>Sem contato</span>
      )}
      {(opp.company || opp.value != null || opp.contract_model) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          {opp.company && (
            <span style={{ fontSize: 11, color: "var(--pandora-ink-600)", background: "var(--pandora-ink-50)", borderRadius: 4, padding: "2px 6px" }}>
              {opp.company}
            </span>
          )}
          {opp.value != null && (
            <span style={{ fontSize: 11, color: "var(--pandora-green-600)", background: "var(--pandora-green-50)", borderRadius: 4, padding: "2px 6px", fontFamily: "var(--font-mono)", fontWeight: 600 }}>
              {opp.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
            </span>
          )}
          {opp.contract_model && (
            <span style={{ fontSize: 11, color: "var(--pandora-violet-600)", background: "var(--pandora-violet-50)", borderRadius: 4, padding: "2px 6px" }}>
              {opp.contract_model}
            </span>
          )}
        </div>
      )}
      {opp.proposals && opp.proposals.length > 0 && (
        <div style={{ marginTop: 6, padding: "5px 8px", background: "var(--pandora-ink-25)", borderRadius: 4, borderLeft: "2px solid var(--pandora-violet-300)" }}>
          <span style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Proposta</span>
          <p style={{ fontSize: 11, color: "var(--pandora-ink-700)", margin: "2px 0 0", fontWeight: 500, display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {opp.proposals[0].title}
            {opp.proposals[0].value != null && (
              <span style={{ color: "var(--pandora-green-600)", fontFamily: "var(--font-mono)", marginLeft: 6 }}>
                {opp.proposals[0].value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}
              </span>
            )}
          </p>
        </div>
      )}
      {opp.notes && (
        <p style={{ fontSize: 11, color: "var(--pandora-ink-500)", marginTop: 6, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {opp.notes}
        </p>
      )}
      <div className="pda-kanban-card-actions" onClick={(e) => e.stopPropagation()}>
        {next && (
          <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={onAdvance}>
            <ChevronRight size={12} /> {STATUS_LABEL[next]}
          </button>
        )}
        {opp.status !== "dismissed" && (
          <button type="button" className="pda-btn pda-btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={onDismiss}>
            Descartar
          </button>
        )}
      </div>
    </div>
  );
}

type SortCol = "title" | "contact" | "status" | "detected" | "channel" | "confidence" | "company" | "value";

function OpportunityTable({
  rows,
  sortCol,
  sortAsc,
  onSort,
  onRowClick,
}: {
  rows: OpportunityWithContact[];
  sortCol: SortCol;
  sortAsc: boolean;
  onSort: (col: SortCol) => void;
  onRowClick: (opp: OpportunityWithContact) => void;
}) {
  function Th({ col, children }: { col: SortCol; children: React.ReactNode }) {
    const active = sortCol === col;
    return (
      <th
        onClick={() => onSort(col)}
        style={{
          padding: "8px 12px",
          textAlign: "left",
          fontSize: 11,
          fontFamily: "var(--font-display)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: active ? "var(--pandora-violet-600)" : "var(--pandora-ink-400)",
          cursor: "pointer",
          borderBottom: "1px solid var(--pandora-ink-100)",
        }}
      >
        {children} {active ? (sortAsc ? "↑" : "↓") : ""}
      </th>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ background: "var(--pandora-ink-25)" }}>
            <Th col="title">Título</Th>
            <Th col="company">Empresa</Th>
            <Th col="contact">Contato</Th>
            <Th col="value">Valor</Th>
            <Th col="status">Status</Th>
            <Th col="channel">Canal</Th>
            <Th col="confidence">Confiança</Th>
            <Th col="detected">Detectada</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr
              key={o.id}
              onClick={() => onRowClick(o)}
              style={{ cursor: "pointer", borderBottom: "1px solid var(--pandora-ink-50)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = "var(--pandora-ink-25)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = ""; }}
            >
              <td style={{ padding: "10px 12px", fontWeight: 500, color: "var(--pandora-violet-900)" }}>{o.title}</td>
              <td style={{ padding: "10px 12px", color: "var(--pandora-ink-600)" }}>{o.company ?? <span style={{ color: "var(--pandora-ink-300)" }}>—</span>}</td>
              <td style={{ padding: "10px 12px" }}>
                {o.contact_id ? (
                  <Link href={`/clientes/${o.contact_id}`} onClick={(e) => e.stopPropagation()} style={{ color: "var(--pandora-violet-600)" }}>
                    {o.contact?.name ?? "—"}
                  </Link>
                ) : (
                  <span style={{ color: "var(--pandora-ink-400)" }}>—</span>
                )}
              </td>
              <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--pandora-green-600)", fontWeight: 600 }}>
                {o.value != null ? o.value.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }) : <span style={{ color: "var(--pandora-ink-300)", fontWeight: 400 }}>—</span>}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <StatusBadge status={o.status} />
              </td>
              <td style={{ padding: "10px 12px", color: "var(--pandora-ink-600)" }}>{CHANNEL_LABEL[o.channel]}</td>
              <td style={{ padding: "10px 12px", color: CONFIDENCE_COLOR[o.confidence] }}>{CONFIDENCE_LABEL[o.confidence]}</td>
              <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pandora-ink-500)" }}>{timeAgo(o.detected_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: OpportunityStatus }) {
  return (
    <span
      className="pda-badge"
      style={{
        background: `${STATUS_COLOR[status]}18`,
        color: STATUS_COLOR[status],
      }}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function FilterChip({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const c = color ?? "var(--pandora-violet-600)";
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 99,
        fontSize: 12,
        cursor: "pointer",
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        border: `1.5px solid ${active ? c : "var(--pandora-ink-100)"}`,
        background: active ? c : "transparent",
        color: active ? "#fff" : "var(--pandora-ink-500)",
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={{ fontSize: 11, color: "var(--pandora-ink-500)", fontFamily: "var(--font-display)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

export default function OportunidadesPage() {
  return (
    <Suspense fallback={<p style={{ padding: 32, fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>}>
      <OportunidadesPageInner />
    </Suspense>
  );
}
