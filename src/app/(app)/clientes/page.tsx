"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { ContactWithStats, ContactCategory } from "@/lib/types";
import type { MergeSuggestion } from "@/app/api/contacts/suggestions/route";
import {
  Plus, Search, Users, Phone, Mail, Building2, RefreshCw, Sparkles,
  GitMerge, ChevronDown, ChevronUp, LayoutGrid, List, CalendarDays,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  if (d < 30) return `há ${Math.floor(d / 7)} sem`;
  if (d < 365) return `há ${Math.floor(d / 30)} m`;
  return `há ${Math.floor(d / 365)} a`;
}

function isCold(c: ContactWithStats): boolean {
  const ref = c.last_interaction_at ?? c.created_at;
  return Date.now() - new Date(ref).getTime() > 30 * 86400000;
}

const CHANNEL_LABEL: Record<string, string> = {
  calcom: "Cal.com", email: "Email", whatsapp: "WhatsApp",
  manual: "Manual", fathom: "Fathom",
};

const CATEGORY_COLOR: Record<string, string> = {
  prospect:      "var(--pandora-violet-600)",
  cliente:       "#059669",
  fornecedor:    "#0284c7",
  desenvolvedor: "#7c3aed",
  parceiro:      "#d97706",
  casual:        "#6b7280",
  desconhecido:  "#9ca3af",
};

const CATEGORY_LABEL: Record<string, string> = {
  prospect: "Prospect", cliente: "Cliente", fornecedor: "Fornecedor",
  desenvolvedor: "Dev", parceiro: "Parceiro", casual: "Casual", desconhecido: "?",
};

// ── main component ────────────────────────────────────────────────────

export default function ClientesPage() {
  const [contacts, setContacts]       = useState<ContactWithStats[]>([]);
  const [loading, setLoading]         = useState(true);
  const [query, setQuery]             = useState("");
  const [syncing, setSyncing]         = useState(false);
  const [classifying, setCL]          = useState(false);
  const [toast, setToast]             = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [suggestions, setSuggestions] = useState<MergeSuggestion[]>([]);
  const [showMerge, setShowMerge]     = useState(false);
  const [loadingSugg, setLoadingSugg] = useState(false);
  const [merging, setMerging]         = useState<string | null>(null);

  // view & filter state
  const [viewMode, setViewMode]           = useState<"cards" | "list">("cards");
  const [sortBy, setSortBy]               = useState<"last_contact" | "created" | "name">("last_contact");
  const [filterCategory, setFilterCategory] = useState<ContactCategory | "all">("all");
  const [quickFilter, setQuickFilter]     = useState<"none" | "cold" | "no_channel">("none");
  const [sortCol, setSortCol]             = useState<"name" | "category" | "last" | "count">("last");
  const [sortAsc, setSortAsc]             = useState(false);

  const supabase = supabaseBrowser();

  // restore viewMode from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("contacts-view") as "cards" | "list" | null;
    if (saved) setViewMode(saved);
  }, []);

  function toggleView(mode: "cards" | "list") {
    setViewMode(mode);
    localStorage.setItem("contacts-view", mode);
  }

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("contacts_with_stats").select("*");
    setContacts((data as ContactWithStats[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function syncWhatsapp() {
    setSyncing(true); setToast(null);
    const res = await fetch("/api/contacts/sync-whatsapp", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setToast({ kind: "err", text: data.error || "Falha na sincronização" });
    else setToast({ kind: "ok", text: `Sincronizado: ${data.created} novos, ${data.updated} atualizados (${data.total_chats} conversas)` });
    setSyncing(false);
    await load();
  }

  async function classifyAll() {
    setCL(true); setToast(null);
    const targets = contacts.filter((c) => c.phone && !c.ai_summary).slice(0, 15);
    let ok = 0, err = 0;
    for (const c of targets) {
      try {
        const res = await fetch(`/api/contacts/${c.id}/classify`, { method: "POST" });
        if (res.ok) ok++; else err++;
      } catch { err++; }
    }
    setToast({ kind: "ok", text: `Classificados: ${ok} OK, ${err} erros` });
    setCL(false);
    await load();
  }

  async function loadSuggestions() {
    setLoadingSugg(true);
    const res = await fetch("/api/contacts/suggestions");
    if (res.ok) { const d = await res.json(); setSuggestions(d.suggestions ?? []); setShowMerge(true); }
    setLoadingSugg(false);
  }

  async function doMerge(sourceId: string, targetId: string) {
    const key = `${sourceId}:${targetId}`;
    setMerging(key);
    const res = await fetch(`/api/contacts/${sourceId}/merge`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetId }),
    });
    if (res.ok) {
      setSuggestions((prev) => prev.filter((s) => s.a.id !== sourceId && s.b.id !== sourceId));
      setToast({ kind: "ok", text: "Contatos mesclados" });
      await load();
    } else {
      const d = await res.json();
      setToast({ kind: "err", text: d.error || "Erro ao mesclar" });
    }
    setMerging(null);
  }

  // ── derived stats ──────────────────────────────────────────────────

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contacts) {
      const cat = c.category ?? "desconhecido";
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [contacts]);

  const noChannelCount = useMemo(
    () => contacts.filter((c) => !c.email && !c.phone).length,
    [contacts]
  );

  const coldCount = useMemo(() => contacts.filter(isCold).length, [contacts]);

  // ── filtered + sorted list ─────────────────────────────────────────

  const processed = useMemo(() => {
    const q = query.toLowerCase().trim();

    let result = contacts.filter((c) => {
      if (q && ![c.name, c.email, c.phone, c.company, c.role, c.ai_summary, ...(c.tags ?? [])]
        .some((v) => v?.toLowerCase().includes(q))) return false;
      if (filterCategory !== "all" && (c.category ?? "desconhecido") !== filterCategory) return false;
      if (quickFilter === "cold" && !isCold(c)) return false;
      if (quickFilter === "no_channel" && (c.email || c.phone)) return false;
      return true;
    });

    // sort
    const effectiveSort = viewMode === "list" ? sortCol : sortBy;
    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (effectiveSort === "name")
        cmp = a.name.localeCompare(b.name, "pt-BR");
      else if (effectiveSort === "category")
        cmp = (a.category ?? "z").localeCompare(b.category ?? "z");
      else if (effectiveSort === "count" || effectiveSort === "created")
        cmp = (a.interaction_count ?? 0) - (b.interaction_count ?? 0);
      else {
        // last_contact / last
        const ta = a.last_interaction_at ?? a.created_at;
        const tb = b.last_interaction_at ?? b.created_at;
        cmp = ta < tb ? -1 : ta > tb ? 1 : 0;
      }
      return viewMode === "list" ? (sortAsc ? cmp : -cmp) : -cmp;
    });

    return result;
  }, [contacts, query, filterCategory, quickFilter, sortBy, sortCol, sortAsc, viewMode]);

  // ── render ─────────────────────────────────────────────────────────

  const activeCategories = Object.entries(categoryCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Contatos</h1>
          <span className="pda-chip">{contacts.length}</span>
          {activeCategories.slice(0, 3).map(([cat, n]) => (
            <span key={cat} className="pda-chip" style={{ color: CATEGORY_COLOR[cat] ?? "inherit" }}>
              {n} {CATEGORY_LABEL[cat] ?? cat}
            </span>
          ))}
          {noChannelCount > 0 && (
            <span className="pda-chip" style={{ color: "var(--pandora-ink-400)" }}>
              {noChannelCount} sem canal
            </span>
          )}
        </div>
        <div className="pda-topbar-right" style={{ gap: 8 }}>
          <button className="pda-btn pda-btn-ghost" onClick={syncWhatsapp} disabled={syncing}>
            <RefreshCw size={14} style={syncing ? { animation: "spin 1s linear infinite" } : {}} />
            {syncing ? "Sincronizando…" : "Sync WhatsApp"}
          </button>
          <button className="pda-btn pda-btn-ghost" onClick={classifyAll} disabled={classifying}>
            <Sparkles size={14} />
            {classifying ? "Classificando…" : "Classificar"}
          </button>
          <button
            className="pda-btn pda-btn-ghost"
            onClick={showMerge ? () => setShowMerge(false) : loadSuggestions}
            disabled={loadingSugg}
          >
            <GitMerge size={14} />
            {loadingSugg ? "…" : suggestions.length > 0 ? `${suggestions.length} duplicatas` : "Mesclar"}
            {showMerge ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <Link href="/clientes/novo" className="pda-btn">
            <Plus size={14} /> Novo
          </Link>
        </div>
      </header>

      <div className="pda-content">

        {/* Merge panel */}
        {showMerge && suggestions.length === 0 && !loadingSugg && (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--color-success)" }}>
            ✓ Nenhum contato duplicado detectado.
          </div>
        )}
        {showMerge && suggestions.length > 0 && (
          <div style={{ marginBottom: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="pda-eyebrow" style={{ marginBottom: 4 }}>Possíveis duplicatas</div>
            {suggestions.map((s) => {
              const key = `${s.a.id}:${s.b.id}`;
              const isLoading = merging === key;
              return (
                <div key={key} style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 14px", background: "var(--pandora-ink-25)", border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
                  <ContactMini c={s.a} />
                  <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{s.reason} · {Math.round(s.score * 100)}%</span>
                  <ContactMini c={s.b} />
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    <button className="pda-btn pda-btn-ghost" style={{ fontSize: 12, padding: "4px 10px" }} disabled={isLoading} onClick={() => doMerge(s.a.id, s.b.id)}>
                      {isLoading ? "…" : `Manter ${s.b.name.split(" ")[0]}`}
                    </button>
                    <button className="pda-btn" style={{ fontSize: 12, padding: "4px 10px" }} disabled={isLoading} onClick={() => doMerge(s.b.id, s.a.id)}>
                      {isLoading ? "…" : `Manter ${s.a.name.split(" ")[0]}`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Toast */}
        {toast && (
          <div style={{
            background: toast.kind === "ok" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${toast.kind === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
            borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 13,
            color: toast.kind === "ok" ? "var(--color-success)" : "var(--color-danger)",
          }}>{toast.text}</div>
        )}

        {/* Controls bar */}
        <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center", flexWrap: "wrap" }}>
          {/* Search */}
          <div style={{ position: "relative", flex: "1 1 240px", minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 10, color: "var(--pandora-ink-400)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              style={{
                width: "100%", padding: "8px 10px 8px 30px",
                border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-md)",
                fontSize: 13, fontFamily: "var(--font-text)", outline: "none",
                background: "#fff", color: "var(--pandora-violet-900)",
              }}
            />
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            style={{ padding: "7px 10px", border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-md)", fontSize: 13, background: "#fff", color: "var(--pandora-violet-900)", cursor: "pointer" }}
          >
            <option value="last_contact">Último contato</option>
            <option value="created">Mais recentes</option>
            <option value="name">Nome A→Z</option>
          </select>

          {/* View toggle */}
          <div style={{ display: "flex", border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
            <button
              onClick={() => toggleView("cards")}
              style={{ padding: "7px 10px", background: viewMode === "cards" ? "var(--pandora-violet-50)" : "#fff", border: "none", cursor: "pointer", display: "flex", color: viewMode === "cards" ? "var(--pandora-violet-600)" : "var(--pandora-ink-400)" }}
              title="Cards"
            >
              <LayoutGrid size={15} />
            </button>
            <button
              onClick={() => toggleView("list")}
              style={{ padding: "7px 10px", background: viewMode === "list" ? "var(--pandora-violet-50)" : "#fff", border: "none", borderLeft: "1px solid var(--pandora-ink-100)", cursor: "pointer", display: "flex", color: viewMode === "list" ? "var(--pandora-violet-600)" : "var(--pandora-ink-400)" }}
              title="Lista"
            >
              <List size={15} />
            </button>
          </div>
        </div>

        {/* Category + quick filters */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap", alignItems: "center" }}>
          <FilterChip active={filterCategory === "all" && quickFilter === "none"} onClick={() => { setFilterCategory("all"); setQuickFilter("none"); }}>
            Todos {contacts.length}
          </FilterChip>
          {activeCategories.map(([cat, n]) => (
            <FilterChip
              key={cat}
              active={filterCategory === cat as ContactCategory && quickFilter === "none"}
              color={CATEGORY_COLOR[cat]}
              onClick={() => { setFilterCategory(cat as ContactCategory); setQuickFilter("none"); }}
            >
              {CATEGORY_LABEL[cat] ?? cat} {n}
            </FilterChip>
          ))}
          {coldCount > 0 && (
            <FilterChip active={quickFilter === "cold"} color="#ef4444" onClick={() => { setQuickFilter(quickFilter === "cold" ? "none" : "cold"); setFilterCategory("all"); }}>
              Frios {coldCount}
            </FilterChip>
          )}
          {noChannelCount > 0 && (
            <FilterChip active={quickFilter === "no_channel"} color="var(--pandora-ink-400)" onClick={() => { setQuickFilter(quickFilter === "no_channel" ? "none" : "no_channel"); setFilterCategory("all"); }}>
              Sem canal {noChannelCount}
            </FilterChip>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>
        ) : processed.length === 0 ? (
          <div className="pda-empty">
            <Users />
            <div className="pda-empty-title">Nenhum contato</div>
            <div className="pda-empty-desc">Ajuste o filtro ou sincronize o WhatsApp.</div>
          </div>
        ) : viewMode === "cards" ? (
          <CardGrid contacts={processed} />
        ) : (
          <ContactTable
            contacts={processed}
            sortCol={sortCol}
            sortAsc={sortAsc}
            onSort={(col) => {
              if (sortCol === col) setSortAsc((v) => !v);
              else { setSortCol(col); setSortAsc(false); }
            }}
          />
        )}
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ── sub-components ─────────────────────────────────────────────────────

function FilterChip({ active, color, onClick, children }: {
  active: boolean; color?: string; onClick: () => void; children: React.ReactNode;
}) {
  const c = color ?? "var(--pandora-violet-600)";
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px", borderRadius: 99, fontSize: 12, cursor: "pointer",
        fontFamily: "var(--font-display)", fontWeight: 600,
        border: `1.5px solid ${active ? c : "var(--pandora-ink-100)"}`,
        background: active ? c : "transparent",
        color: active ? "#fff" : "var(--pandora-ink-500)",
        transition: "all 0.12s",
      }}
    >
      {children}
    </button>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return (
    <div style={{
      width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
      background: "var(--pandora-violet-50)", color: "var(--pandora-violet-700)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
    }}>{initials}</div>
  );
}

function ChannelDots({ c }: { c: ContactWithStats }) {
  return (
    <div style={{ display: "flex", gap: 4 }}>
      <Mail size={12} color={c.email ? "#059669" : "var(--pandora-ink-200)"} />
      <Phone size={12} color={c.phone ? "#059669" : "var(--pandora-ink-200)"} />
    </div>
  );
}

function LastContact({ c }: { c: ContactWithStats }) {
  const ref = c.last_interaction_at;
  if (!ref) return <span style={{ fontSize: 11, color: "var(--pandora-ink-300)" }}>sem contato</span>;
  const cold = isCold(c);
  return (
    <span style={{ fontSize: 11, color: cold ? "#ef4444" : "var(--pandora-ink-400)", fontFamily: "var(--font-mono)" }}>
      {timeAgo(ref)}{cold ? " 🔴" : ""}{c.last_interaction_channel ? ` · ${CHANNEL_LABEL[c.last_interaction_channel] ?? c.last_interaction_channel}` : ""}
    </span>
  );
}

function CategoryBadge({ category }: { category?: string }) {
  const cat = category ?? "desconhecido";
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 99, fontSize: 10, fontFamily: "var(--font-display)", fontWeight: 600,
      background: (CATEGORY_COLOR[cat] ?? "#9ca3af") + "20",
      color: CATEGORY_COLOR[cat] ?? "#9ca3af",
      border: `1px solid ${(CATEGORY_COLOR[cat] ?? "#9ca3af")}40`,
    }}>
      {CATEGORY_LABEL[cat] ?? cat}
    </span>
  );
}

function CardGrid({ contacts }: { contacts: ContactWithStats[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
      {contacts.map((c) => (
        <Link
          key={c.id}
          href={`/clientes/${c.id}`}
          className="pda-card"
          style={{
            display: "flex", flexDirection: "column", gap: 10, textDecoration: "none", color: "inherit",
            borderLeft: isCold(c) && c.last_interaction_at ? "3px solid #ef444430" : undefined,
          }}
        >
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <Avatar name={c.name} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--pandora-violet-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {c.name}
              </div>
              {(c.role || c.company) && (
                <div style={{ fontSize: 11, color: "var(--pandora-ink-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.role}{c.role && c.company ? " · " : ""}{c.company}
                </div>
              )}
            </div>
            <CategoryBadge category={c.category} />
          </div>

          {/* Contact info */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ChannelDots c={c} />
            <span style={{ fontSize: 12, color: "var(--pandora-ink-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {c.email ?? c.phone ?? "—"}
            </span>
          </div>

          {/* Last interaction */}
          <div style={{ display: "flex", alignItems: "center", gap: 5, paddingTop: 6, borderTop: "1px solid var(--pandora-ink-50)" }}>
            <CalendarDays size={11} color="var(--pandora-ink-300)" />
            <LastContact c={c} />
            {c.interaction_count > 0 && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--pandora-ink-300)", fontFamily: "var(--font-mono)" }}>
                {c.interaction_count}×
              </span>
            )}
          </div>

          {c.ai_summary && (
            <p style={{ fontSize: 11, color: "var(--pandora-ink-500)", lineHeight: 1.4, margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
              {c.ai_summary}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}

type SortCol = "name" | "category" | "last" | "count";

function ContactTable({ contacts, sortCol, sortAsc, onSort }: {
  contacts: ContactWithStats[];
  sortCol: SortCol;
  sortAsc: boolean;
  onSort: (col: SortCol) => void;
}) {
  function Th({ col, children }: { col: SortCol; children: React.ReactNode }) {
    const active = sortCol === col;
    return (
      <th
        onClick={() => onSort(col)}
        style={{
          padding: "8px 12px", textAlign: "left", fontSize: 11, fontFamily: "var(--font-display)",
          textTransform: "uppercase", letterSpacing: "0.06em",
          color: active ? "var(--pandora-violet-600)" : "var(--pandora-ink-400)",
          cursor: "pointer", userSelect: "none", whiteSpace: "nowrap",
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
            <Th col="name">Nome</Th>
            <Th col="category">Categoria</Th>
            <th style={{ padding: "8px 12px", fontSize: 11, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pandora-ink-400)", borderBottom: "1px solid var(--pandora-ink-100)", whiteSpace: "nowrap" }}>Empresa</th>
            <th style={{ padding: "8px 12px", fontSize: 11, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--pandora-ink-400)", borderBottom: "1px solid var(--pandora-ink-100)" }}>Canais</th>
            <Th col="last">Último contato</Th>
            <Th col="count">#</Th>
          </tr>
        </thead>
        <tbody>
          {contacts.map((c) => (
            <tr
              key={c.id}
              onClick={() => window.location.href = `/clientes/${c.id}`}
              style={{
                cursor: "pointer",
                borderBottom: "1px solid var(--pandora-ink-50)",
                background: isCold(c) && c.last_interaction_at ? "rgba(239,68,68,0.02)" : "transparent",
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--pandora-violet-50)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = isCold(c) && c.last_interaction_at ? "rgba(239,68,68,0.02)" : "transparent")}
            >
              <td style={{ padding: "10px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar name={c.name} />
                  <div>
                    <div style={{ fontWeight: 600, color: "var(--pandora-violet-900)" }}>{c.name}</div>
                    {c.role && <div style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{c.role}</div>}
                  </div>
                </div>
              </td>
              <td style={{ padding: "10px 12px" }}>
                <CategoryBadge category={c.category} />
              </td>
              <td style={{ padding: "10px 12px", color: "var(--pandora-ink-500)", fontSize: 12 }}>
                {c.company ?? "—"}
              </td>
              <td style={{ padding: "10px 12px" }}>
                <ChannelDots c={c} />
              </td>
              <td style={{ padding: "10px 12px" }}>
                <LastContact c={c} />
              </td>
              <td style={{ padding: "10px 12px", color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)", fontSize: 12, textAlign: "right" }}>
                {c.interaction_count > 0 ? c.interaction_count : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ContactMini({ c }: { c: MergeSuggestion["a"] }) {
  return (
    <div style={{ flex: 1, minWidth: 160 }}>
      <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
      <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", marginLeft: 6 }}>via {c.source}</span>
      {c.email && <div style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{c.email}</div>}
      {c.phone && <div style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{c.phone}</div>}
    </div>
  );
}
