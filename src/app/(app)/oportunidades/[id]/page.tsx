"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, FileText, ScrollText, Globe,
  User, Building2, Copy, Check, RefreshCw, Plus,
  ExternalLink, ClipboardList, ChevronRight, X,
  Upload, FolderOpen, Trash2, Link2,
  Activity, Sparkles, AlertTriangle, CheckCircle2, Circle, CircleDot, Clock,
  UserPlus, Users, Send, Search,
} from "lucide-react";
import {
  CHANNEL_LABEL, CONFIDENCE_LABEL, CONFIDENCE_COLOR, STATUS_LABEL, STATUS_COLOR, STATUS_COLUMNS,
} from "@/lib/opportunities";
import type { OpportunityStatus, OpportunityChannel, OpportunityConfidence, Interaction, AnalysisSnapshot, OpportunityQualification, QualificationKey, QualificationState, OpportunityContact } from "@/lib/types";
import type { OpportunityWithContact, Proposal, Contract } from "@/lib/types";
import { OppTimeline } from "@/components/OppTimeline";

// ─── Types ────────────────────────────────────────────────────────────────────


interface OppDetail extends OpportunityWithContact {
  client?: { id: string; company_name: string; status: string; monthly_fee?: number; health_score?: number } | null;
}

interface Portal { id: string; slug: string; label: string; login_email: string; active: boolean }

interface ClientDoc {
  id: string; name: string; file_url: string;
  size_bytes?: number; mime_type?: string; uploaded_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slugify(s: string) {
  return s.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .substring(0, 30);
}

function genPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function fmtBRL(v?: number | null) {
  if (!v) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_PROPOSAL_PT: Record<string, string> = {
  draft: "Rascunho", sent: "Enviada", viewed: "Visualizada",
  accepted: "Aceita", rejected: "Rejeitada", expired: "Expirada",
};
const STATUS_CONTRACT_PT: Record<string, string> = {
  draft: "Rascunho", in_review: "Em revisão", signed: "Assinado",
  active: "Ativo", ended: "Encerrado", cancelled: "Cancelado",
};

// Critérios de qualificação (BANT)
const BANT: { key: QualificationKey; label: string; hint: string }[] = [
  { key: "budget",    label: "Orçamento",     hint: "Tem verba / disposição a pagar?" },
  { key: "authority", label: "Decisor",       hint: "O contato decide a contratação?" },
  { key: "need",      label: "Necessidade",   hint: "Dor concreta identificada?" },
  { key: "timeline",  label: "Prazo",         hint: "Urgência / janela para começar?" },
];

const QUAL_STATE_META: Record<QualificationState, { label: string; color: string; Icon: React.ElementType }> = {
  confirmed: { label: "Confirmado", color: "var(--pandora-green-400)", Icon: CheckCircle2 },
  partial:   { label: "Parcial",    color: "#d97706",                  Icon: CircleDot },
  unknown:   { label: "Sem info",   color: "var(--pandora-ink-400)",   Icon: Circle },
};

const QUAL_CYCLE: Record<QualificationState, QualificationState> = {
  unknown: "partial", partial: "confirmed", confirmed: "unknown",
};

function daysInStage(d?: string | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// Limiar de "parado" por estágio (dias) — inspirado no rotting do Pipedrive
const STALE_DAYS: Partial<Record<OpportunityStatus, number>> = {
  nova: 5, em_contato: 7, proposta: 7, contrato: 10,
};

const CHANNEL_OPTIONS = (Object.keys(CHANNEL_LABEL) as OpportunityChannel[]).map(k => ({ value: k, label: CHANNEL_LABEL[k] }));
const CONFIDENCE_OPTIONS = (Object.keys(CONFIDENCE_LABEL) as OpportunityConfidence[]).map(k => ({ value: k, label: CONFIDENCE_LABEL[k] }));

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OportunidadeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [opp, setOpp]             = useState<OppDetail | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [portal, setPortal]       = useState<Portal | null>(null);
  const [loading, setLoading]     = useState(true);

  // status picker
  const [statusPickerOpen, setStatusPickerOpen] = useState(false);
  const [changingStatus, setChangingStatus]     = useState(false);



  // enrichment (atividade + qualificação IA)
  const [interactions, setInteractions]   = useState<Interaction[]>([]);
  const [snapshot, setSnapshot]           = useState<AnalysisSnapshot | null>(null);
  const [people, setPeople]               = useState<OpportunityContact[]>([]);
  const [enrichLoading, setEnrichLoading] = useState(false);
  const [qualifying, setQualifying]       = useState(false);
  const [savingQual, setSavingQual]       = useState(false);

  // pessoas (modal de adicionar)
  const [personModal, setPersonModal]     = useState(false);
  const [personSearch, setPersonSearch]   = useState("");
  const [personResults, setPersonResults] = useState<{ id: string; name: string; email?: string; company?: string; role?: string }[]>([]);
  const [personRole, setPersonRole]       = useState("");
  const [addingPerson, setAddingPerson]   = useState<string | null>(null);

  // comentário de acompanhamento
  const [commentText, setCommentText]     = useState("");
  const [postingComment, setPostingComment] = useState(false);

  // documents
  const [documents, setDocuments]         = useState<ClientDoc[]>([]);
  const [uploading, setUploading]         = useState(false);
  const [deletingDoc, setDeletingDoc]     = useState<string | null>(null);

  // pdf import
  const [importingPdf, setImportingPdf]   = useState(false);

  // link modal (proposals / contracts)
  const [linkModal, setLinkModal]         = useState<"proposals" | "contracts" | null>(null);
  const [linkSearch, setLinkSearch]       = useState("");
  const [linkAllItems, setLinkAllItems]   = useState<(Proposal | Contract)[]>([]);
  const [linkSelected, setLinkSelected]   = useState<string | null>(null);
  const [linkLoading, setLinkLoading]     = useState(false);
  const [linking, setLinking]             = useState<string | null>(null);

  // portal
  const [portalCreating, setPortalCreating]       = useState(false);
  const [portalCredentials, setPortalCredentials] = useState<{ url: string; email: string; password: string } | null>(null);
  const [copiedField, setCopiedField]             = useState<string | null>(null);
  const [newPwd, setNewPwd]                       = useState("");
  const [resetMode, setResetMode]                 = useState(false);
  const [portalSaving, setPortalSaving]           = useState(false);
  const [portalErr, setPortalErr]                 = useState<string | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    const [oppRes, portalRes] = await Promise.all([
      fetch(`/api/opportunities/${id}`),
      fetch(`/api/portals?opportunity_id=${id}`),
    ]);

    if (oppRes.ok) {
      const data: OppDetail = await oppRes.json();
      setOpp(data);

      // propostas e contratos por opportunity_id (independente de conversão)
      const [pRes, cRes] = await Promise.all([
        fetch(`/api/proposals?opportunity_id=${id}`),
        fetch(`/api/contracts?opportunity_id=${id}`),
      ]);
      if (pRes.ok) setProposals(await pRes.json());
      if (cRes.ok) setContracts(await cRes.json());

      // documentos ainda requerem client_id
      const clientId = data.converted_to_client_id ?? data.client?.id;
      if (clientId) {
        const dRes = await fetch(`/api/client-documents?client_id=${clientId}`);
        if (dRes.ok) setDocuments(await dRes.json());
      }

      // enriquecimento: atividade unificada + snapshot IA
      setEnrichLoading(true);
      fetch(`/api/opportunities/${id}/enrichment`)
        .then(r => r.ok ? r.json() : null)
        .then(e => {
          if (e) { setInteractions(e.interactions ?? []); setSnapshot(e.snapshot ?? null); setPeople(e.people ?? []); }
        })
        .finally(() => setEnrichLoading(false));
    } else {
      router.push("/oportunidades");
    }

    if (portalRes.ok) {
      const list = await portalRes.json();
      setPortal(list[0] ?? null);
    }

    setLoading(false);
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  // ── Edição inline ───────────────────────────────────────────────────────────

  async function patchOpp(patch: Record<string, unknown>) {
    if (!opp) return;
    setOpp(prev => prev ? { ...prev, ...patch } : prev); // otimista
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) { const d = await res.json(); setOpp(prev => ({ ...prev!, ...d })); }
  }

  // ── Qualificação (BANT + IA) ────────────────────────────────────────────────

  async function runQualify() {
    if (!opp) return;
    setQualifying(true);
    const res = await fetch(`/api/opportunities/${id}/qualify`, { method: "POST" });
    if (res.ok) { const d = await res.json(); setOpp(prev => ({ ...prev!, ...d })); }
    setQualifying(false);
  }

  async function saveQualification(next: OpportunityQualification) {
    if (!opp) return;
    setOpp(prev => prev ? { ...prev, qualification: next } : prev); // otimista
    setSavingQual(true);
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ qualification: next }),
    });
    if (res.ok) { const d = await res.json(); setOpp(prev => ({ ...prev!, ...d })); }
    setSavingQual(false);
  }

  function cycleQualItem(key: QualificationKey) {
    const q = (opp?.qualification ?? {}) as OpportunityQualification;
    const current = q[key]?.status ?? "unknown";
    const next: OpportunityQualification = {
      ...q,
      [key]: { ...q[key], status: QUAL_CYCLE[current] },
      updated_at: new Date().toISOString(),
      ai_generated: false,
    };
    saveQualification(next);
  }

  // ── Pessoas envolvidas ──────────────────────────────────────────────────────

  const primaryContactId = opp?.contact_id ?? null;

  async function addPerson(contactId: string) {
    setAddingPerson(contactId);
    const res = await fetch(`/api/opportunities/${id}/people`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contact_id: contactId, role: personRole.trim() || null }),
    });
    if (res.ok) {
      const row: OpportunityContact = await res.json();
      setPeople(prev => [...prev.filter(p => p.contact_id !== contactId), row]);
      setPersonModal(false);
      setPersonSearch(""); setPersonResults([]); setPersonRole("");
      // recarrega atividade — agora inclui as conversas dessa pessoa
      fetch(`/api/opportunities/${id}/enrichment`).then(r => r.ok ? r.json() : null).then(e => {
        if (e) { setInteractions(e.interactions ?? []); setPeople(e.people ?? []); }
      });
    }
    setAddingPerson(null);
  }

  async function removePerson(contactId: string) {
    setPeople(prev => prev.filter(p => p.contact_id !== contactId)); // otimista
    await fetch(`/api/opportunities/${id}/people?contact_id=${contactId}`, { method: "DELETE" });
    fetch(`/api/opportunities/${id}/enrichment`).then(r => r.ok ? r.json() : null).then(e => {
      if (e) setInteractions(e.interactions ?? []);
    });
  }

  // ── Comentário de acompanhamento ────────────────────────────────────────────

  async function postComment() {
    const text = commentText.trim();
    if (!text) return;
    setPostingComment(true);
    const res = await fetch(`/api/opportunities/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: text }),
    });
    if (res.ok) {
      const ix: Interaction = await res.json();
      setInteractions(prev => [ix, ...prev]);
      setCommentText("");
    }
    setPostingComment(false);
  }

  // Busca de contatos para o modal de adicionar pessoa (com debounce)
  useEffect(() => {
    if (!personModal) return;
    const t = setTimeout(() => {
      fetch(`/api/contacts?q=${encodeURIComponent(personSearch)}`)
        .then(r => r.ok ? r.json() : [])
        .then(setPersonResults)
        .catch(() => setPersonResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [personModal, personSearch]);

  // ── Status ────────────────────────────────────────────────────────────────

  async function changeStatus(newStatus: OpportunityStatus) {
    if (!opp || newStatus === opp.status) { setStatusPickerOpen(false); return; }
    setChangingStatus(true);
    setStatusPickerOpen(false);
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    if (res.ok) { const d = await res.json(); setOpp(prev => ({ ...prev!, ...d })); }
    setChangingStatus(false);
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  async function uploadDoc(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !opp) return;
    const clientId = opp.converted_to_client_id ?? opp.client?.id;
    if (!clientId) return;
    setUploading(true);
    for (const file of Array.from(e.target.files)) {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("client_id", clientId);
      fd.append("opportunity_id", id);
      const res = await fetch("/api/client-documents", { method: "POST", body: fd });
      if (res.ok) { const doc = await res.json(); setDocuments(prev => [doc, ...prev]); }
    }
    setUploading(false);
    e.target.value = "";
  }

  async function deleteDoc(docId: string) {
    setDeletingDoc(docId);
    await fetch(`/api/client-documents/${docId}`, { method: "DELETE" });
    setDocuments(prev => prev.filter(d => d.id !== docId));
    setDeletingDoc(null);
  }

  // ── PDF import ───────────────────────────────────────────────────────────

  async function importPdf(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files?.length || !opp) return;
    const clientId = opp.converted_to_client_id ?? opp.client?.id;
    setImportingPdf(true);
    const file = e.target.files[0];
    const fd = new FormData();
    fd.append("file", file);
    fd.append("opportunity_id", id);
    if (clientId) fd.append("client_id", clientId);
    const res = await fetch("/api/proposals/import-pdf", { method: "POST", body: fd });
    if (res.ok) {
      const proposal = await res.json();
      setProposals(prev => [proposal, ...prev]);
    }
    setImportingPdf(false);
    e.target.value = "";
  }

  // ── Link modal ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!linkModal) return;
    setLinkSearch("");
    setLinkSelected(null);
    setLinkAllItems([]);
    setLinkLoading(true);
    const endpoint = linkModal === "proposals" ? "/api/proposals" : "/api/contracts";
    fetch(endpoint)
      .then(r => r.ok ? r.json() : [])
      .then((data: (Proposal | Contract)[]) => setLinkAllItems(data))
      .finally(() => setLinkLoading(false));
  }, [linkModal]);

  const linkFilteredItems = linkAllItems.filter(item =>
    !linkSearch || item.title.toLowerCase().includes(linkSearch.toLowerCase())
  );

  async function linkItem(itemId: string, type: "proposals" | "contracts") {
    setLinking(itemId);
    const endpoint = type === "proposals" ? `/api/proposals/${itemId}` : `/api/contracts/${itemId}`;
    const res = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity_id: id }),
    });
    if (res.ok) {
      await load();
      setLinkModal(null);
      setLinkSearch("");
      setLinkSelected(null);
      setLinkAllItems([]);
    }
    setLinking(null);
  }

  // ── Portal ────────────────────────────────────────────────────────────────

  async function createPortal() {
    if (!opp) return;
    setPortalCreating(true);
    setPortalErr(null);
    const slug = slugify(opp.title) + "-" + Math.random().toString(36).substring(2, 6);
    const password = genPassword();
    const login_email = opp.contact?.email ?? `acesso@${slugify(opp.contact?.company ?? opp.title)}.portal`;
    const res = await fetch("/api/portals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opportunity_id: id, slug, label: opp.title, login_email, password }),
    });
    const body = await res.json();
    if (res.ok) {
      setPortal(body);
      setPortalCredentials({ url: `${window.location.origin}/portal/${slug}`, email: login_email, password });
    } else setPortalErr(body.error ?? "Erro ao criar portal");
    setPortalCreating(false);
  }

  async function resetPassword() {
    if (!portal || !newPwd) return;
    setPortalSaving(true);
    const res = await fetch(`/api/portals/${portal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPwd }),
    });
    if (res.ok) {
      setPortalCredentials({ url: `${window.location.origin}/portal/${portal.slug}`, email: portal.login_email, password: newPwd });
      setResetMode(false);
      setNewPwd("");
    } else { const b = await res.json(); setPortalErr(b.error ?? "Erro"); }
    setPortalSaving(false);
  }

  function copyField(value: string, key: string) {
    navigator.clipboard.writeText(value);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 2000);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="pda-main">
        <div className="pda-content" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
          <span style={{ color: "var(--pandora-ink-400)", fontSize: 13 }}>Carregando...</span>
        </div>
      </div>
    );
  }

  if (!opp) return null;

  const isConverted = opp.status === "converted";
  const clientId = opp.converted_to_client_id ?? opp.client?.id;
  const statusColor = STATUS_COLOR[opp.status] ?? "var(--pandora-ink-400)";

  return (
    <div className="pda-main">
      {/* ── Header (flat, integrado ao conteúdo) ── */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12, padding: "22px 48px 0", background: "var(--pandora-ink-25)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <Link href="/oportunidades" style={{ color: "var(--pandora-ink-400)", display: "flex", alignItems: "center", gap: 4, fontSize: 13, textDecoration: "none" }}>
            <ArrowLeft size={14} /> Oportunidades
          </Link>
          <span style={{ color: "var(--pandora-ink-700)" }}>/</span>
          <span style={{ fontSize: 13, color: "var(--pandora-ink-300)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {opp.title}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, width: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontFamily: "var(--font-display)", lineHeight: 1.2 }}>
              <InlineText value={opp.title} onSave={v => { if (v.trim()) patchOpp({ title: v.trim() }); }}
                placeholder="Sem título" block valueStyle={{ fontSize: 22, fontWeight: 700, fontFamily: "var(--font-display)" }} />
            </h1>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              {/* Status picker */}
              <div style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setStatusPickerOpen(o => !o)}
                  disabled={changingStatus}
                  style={{
                    fontSize: 12, background: `${statusColor}18`, color: statusColor,
                    padding: "3px 10px", borderRadius: 99, fontWeight: 600,
                    border: `1px solid ${statusColor}40`, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 4, opacity: changingStatus ? 0.6 : 1,
                  }}
                >
                  {changingStatus ? "..." : STATUS_LABEL[opp.status]}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
                    <path d="M5 7L1 3h8L5 7z"/>
                  </svg>
                </button>
                {statusPickerOpen && (
                  <>
                    <div onClick={() => setStatusPickerOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
                    <div style={{
                      position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 50,
                      background: "var(--pandora-ink-50, #1a1025)", border: "1px solid var(--pandora-ink-700)",
                      borderRadius: 10, padding: 6, minWidth: 160,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                    }}>
                      {STATUS_COLUMNS.map(s => {
                        const c = STATUS_COLOR[s];
                        const active = s === opp.status;
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => changeStatus(s)}
                            style={{
                              display: "flex", alignItems: "center", gap: 8, width: "100%",
                              padding: "8px 10px", borderRadius: 7, border: "none", cursor: "pointer",
                              background: active ? `${c}22` : "transparent",
                              color: "inherit", fontSize: 13, fontWeight: active ? 600 : 400,
                            }}
                          >
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                            <span style={{ color: active ? c : "inherit" }}>{STATUS_LABEL[s]}</span>
                            {active && (
                              <svg style={{ marginLeft: "auto" }} width="12" height="12" viewBox="0 0 12 12" fill={c}>
                                <path d="M10 3L5 9 2 6l1-1 2 2 4-5 1 1z"/>
                              </svg>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              {/* Tempo no estágio + alerta de parado (rotting) */}
              {(() => {
                if (opp.status === "operacional" || opp.status === "perdida") return null;
                const d = daysInStage(opp.status_changed_at);
                if (d == null) return null;
                const stale = STALE_DAYS[opp.status];
                const isStale = stale != null && d >= stale;
                return (
                  <span style={{
                    fontSize: 12, display: "flex", alignItems: "center", gap: 4, fontWeight: isStale ? 600 : 400,
                    color: isStale ? "#ef4444" : "var(--pandora-ink-400)",
                  }} title={isStale ? `Parado há ${d} dias neste estágio` : `${d} dias neste estágio`}>
                    {isStale ? <AlertTriangle size={11} /> : <Clock size={11} />}
                    {d === 0 ? "hoje" : `${d}d`} no estágio
                  </span>
                );
              })()}
              <span style={{ fontSize: 12, color: CONFIDENCE_COLOR[opp.confidence], fontWeight: 600 }}>
                {CONFIDENCE_LABEL[opp.confidence]}
              </span>
              <span style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>
                {CHANNEL_LABEL[opp.channel]}
              </span>
              <span style={{ fontSize: 12, color: "var(--pandora-ink-500)" }}>
                {fmtDate(opp.detected_at)}
              </span>
              {opp.contact && (
                <Link href={`/clientes/${opp.contact_id}`}
                  style={{ fontSize: 12, color: "var(--pandora-violet-400)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                  <User size={11} /> {opp.contact.name}
                  {opp.contact.company ? ` · ${opp.contact.company}` : ""}
                </Link>
              )}
            </div>
          </div>

          {/* CTA principal */}
          {isConverted && clientId && (
            <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
              <Link href={`/operacao?client_id=${clientId}`} className="pda-btn" style={{ fontSize: 12, textDecoration: "none" }}>
                <ClipboardList size={13} /> Ver em Operação
              </Link>
            </div>
          )}
        </div>

        {/* Cliente vinculado (se convertida) */}
        {isConverted && opp.client && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(45,212,160,0.08)", border: "1px solid rgba(45,212,160,0.2)", borderRadius: 8, fontSize: 13 }}>
            <Building2 size={14} style={{ color: "var(--pandora-green-400)" }} />
            <span style={{ color: "var(--pandora-green-400)", fontWeight: 600 }}>Cliente criado:</span>
            <span>{opp.client.company_name}</span>
            {opp.client.monthly_fee && <span style={{ color: "var(--pandora-green-400)" }}>{fmtBRL(opp.client.monthly_fee)}/mês</span>}
            <Link href={`/operacao?client_id=${clientId}`} style={{ marginLeft: "auto", color: "var(--pandora-green-400)", textDecoration: "none", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              Operação <ChevronRight size={12} />
            </Link>
          </div>
        )}
      </div>

      {/* ── Pipeline Strip ── */}
      {(() => {
        const latestProposal = proposals[0] as (Proposal & { opportunity_id?: string; client_id?: string }) | undefined;
        const latestContract = contracts[0] as Contract | undefined;
        const pColor = !latestProposal ? "var(--pandora-ink-600)"
          : latestProposal.status === "accepted" ? "var(--pandora-green-400)"
          : latestProposal.status === "rejected" || latestProposal.status === "expired" ? "#ef4444"
          : latestProposal.status === "sent" || latestProposal.status === "viewed" ? "var(--pandora-violet-400)"
          : "var(--pandora-ink-500)";
        const cColor = !latestContract ? "var(--pandora-ink-600)"
          : latestContract.status === "signed" || latestContract.status === "active" ? "var(--pandora-green-400)"
          : latestContract.status === "in_review" ? "var(--pandora-violet-400)"
          : "var(--pandora-ink-500)";
        const oColor = clientId ? "var(--pandora-green-400)" : "var(--pandora-ink-600)";
        const stepStyle = (color: string, clickable: boolean): React.CSSProperties => ({
          display: "flex", alignItems: "center", gap: 6, padding: "5px 12px",
          borderRadius: 20, fontSize: 12, border: `1px solid ${color}40`,
          background: `${color}10`, color,
          textDecoration: "none", cursor: clickable ? "pointer" : "default",
          whiteSpace: "nowrap",
        });
        return (
          <div style={{ padding: "14px 48px 4px", background: "var(--pandora-ink-25)", flexShrink: 0, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {latestProposal ? (
              <a href={`/propostas/${latestProposal.id}`} style={stepStyle(pColor, true)}>
                <FileText size={11} />
                Proposta · {STATUS_PROPOSAL_PT[latestProposal.status] ?? latestProposal.status}
              </a>
            ) : (
              <a href={`/propostas?opportunity_id=${id}`} style={stepStyle(pColor, true)}>
                <FileText size={11} />
                Sem proposta
              </a>
            )}
            <span style={{ color: "var(--pandora-ink-700)", fontSize: 16 }}>›</span>
            {latestContract ? (
              <a href={`/contratos/${latestContract.id}`} style={stepStyle(cColor, true)}>
                <ScrollText size={11} />
                Contrato · {STATUS_CONTRACT_PT[latestContract.status] ?? latestContract.status}
              </a>
            ) : (
              <a href={`/contratos/novo?opportunity_id=${id}${latestProposal ? `&proposal_id=${latestProposal.id}` : ""}`} style={stepStyle(cColor, true)}>
                <ScrollText size={11} />
                Sem contrato
              </a>
            )}
            <span style={{ color: "var(--pandora-ink-700)", fontSize: 16 }}>›</span>
            {clientId ? (
              <a href={`/operacao/${clientId}`} style={stepStyle(oColor, true)}>
                <Zap size={11} />
                Operação · Ativa
              </a>
            ) : (
              <span style={stepStyle(oColor, false)}>
                <Zap size={11} />
                Operação · Pendente
              </span>
            )}
          </div>
        );
      })()}

      {/* ── Content (página única em blocos) ── */}
      <div className="pda-content" style={{ maxWidth: "none", paddingTop: 24 }}>

        {/* Visão Geral do deal */}
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 380px", alignItems: "start" }}>
            {/* ── COLUNA ESQUERDA: descrição, notas, detalhes, qualificação ── */}
            <div style={{ paddingRight: 40 }}>
              <Section label="Descrição">
                <InlineText value={opp.description} onSave={v => patchOpp({ description: v || null })}
                  multiline block placeholder="Adicionar descrição…"
                  valueStyle={{ fontSize: 14, lineHeight: 1.6 }} />
              </Section>

              <Section label="Notas internas">
                <InlineText value={opp.notes} onSave={v => patchOpp({ notes: v || null })}
                  multiline block placeholder="Adicionar nota interna…"
                  valueStyle={{ fontSize: 14, lineHeight: 1.6 }} />
              </Section>

              <Section label="Detalhes">
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "18px 24px" }}>
                  <InfoField label="Canal">
                    <InlineSelect value={opp.channel} options={CHANNEL_OPTIONS} onSave={v => patchOpp({ channel: v })} />
                  </InfoField>
                  <InfoField label="Confiança">
                    <InlineSelect value={opp.confidence} options={CONFIDENCE_OPTIONS} onSave={v => patchOpp({ confidence: v })} />
                  </InfoField>
                  <InfoItem label="Status" value={STATUS_LABEL[opp.status]} />
                  <InfoItem label="Detectada" value={fmtDate(opp.detected_at)} />
                  {opp.qualified_at && <InfoItem label="Qualificada" value={fmtDate(opp.qualified_at)} />}
                  <InfoField label="Valor">
                    <InlineText value={opp.value} kind="number" onSave={v => patchOpp({ value: v.trim() ? parseFloat(v) : null })}
                      placeholder="—" format={v => fmtBRL(Number(v)) ?? "—"} valueStyle={{ fontSize: 13, fontWeight: 500 }} />
                  </InfoField>
                  <InfoField label="Empresa">
                    <InlineText value={opp.company} onSave={v => patchOpp({ company: v || null })}
                      placeholder="—" valueStyle={{ fontSize: 13, fontWeight: 500 }} />
                  </InfoField>
                  <InfoField label="Modelo">
                    <InlineText value={opp.contract_model} onSave={v => patchOpp({ contract_model: v || null })}
                      placeholder="—" valueStyle={{ fontSize: 13, fontWeight: 500 }} />
                  </InfoField>
                </div>
              </Section>

              <Qualification
                qualification={opp.qualification ?? null}
                onCycle={cycleQualItem}
                onQualify={runQualify}
                qualifying={qualifying}
                saving={savingQual}
              />
            </div>

            {/* ── COLUNA DIREITA: resumo IA, contato, atividade recente ── */}
            <aside style={{ borderLeft: "1px solid var(--pandora-ink-100)", paddingLeft: 40, alignSelf: "stretch" }}>
              <AiSummary
                qualification={opp.qualification ?? null}
                onQualify={runQualify}
                qualifying={qualifying}
              />

              <Section
                label="Pessoas envolvidas"
                action={
                  <button onClick={() => setPersonModal(true)} title="Adicionar pessoa"
                    style={{ fontSize: 11, color: "var(--pandora-violet-600)", background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <UserPlus size={13} /> Adicionar
                  </button>
                }
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {opp.contact && (
                    <PersonRow id={opp.contact.id} name={opp.contact.name} subtitle={opp.contact.company || opp.contact.email}
                      roleLabel="principal" />
                  )}
                  {people
                    .filter(p => p.contact_id !== primaryContactId)
                    .map(p => (
                      <PersonRow key={p.id} id={p.contact_id} name={p.contact?.name ?? "Contato"}
                        subtitle={p.contact?.company || p.contact?.email}
                        roleLabel={p.role || undefined}
                        onRemove={() => removePerson(p.contact_id)} />
                    ))}
                  {!opp.contact && people.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", lineHeight: 1.5 }}>
                      Ninguém vinculado. Adicione as pessoas do deal para a IA acompanhar as conversas de todas.
                    </div>
                  )}
                </div>
              </Section>

              <Section
                label="Atividade recente"
                last
                action={interactions.length > 0 && (
                  <button onClick={() => document.getElementById("atividade")?.scrollIntoView({ behavior: "smooth", block: "start" })} style={{ fontSize: 11, color: "var(--pandora-ink-400)", background: "none", border: "none", cursor: "pointer" }}>ver tudo</button>
                )}
              >
                {enrichLoading ? (
                  <div style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>Carregando…</div>
                ) : interactions.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", lineHeight: 1.5 }}>
                    Sem reuniões, mensagens ou emails ligados a este contato ainda.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {interactions.slice(0, 4).map(it => <RecentRow key={it.id} item={it} />)}
                  </div>
                )}
              </Section>
            </aside>
          </div>

        {/* Atividade */}
        <div id="atividade" style={blockStyle}>
          <h2 style={blockHead}><Activity size={16} style={{ color: "var(--pandora-ink-400)" }} /> Atividade
            <span style={{ fontSize: 12, fontWeight: 400, color: "var(--pandora-ink-400)", fontFamily: "var(--font-text)" }}>· {interactions.length}</span>
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>
                Reuniões, conversas e emails ligados a {opp.contact?.name ?? "este contato"}
              </span>
              {opp.contact_id && (
                <Link href={`/clientes/${opp.contact_id}`} style={{ fontSize: 12, color: "var(--pandora-violet-600)", display: "inline-flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                  <RefreshCw size={13} /> Sincronizar no contato
                </Link>
              )}
            </div>
            {/* Comentário de acompanhamento */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <textarea
                value={commentText}
                onChange={e => setCommentText(e.target.value)}
                onKeyDown={e => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") postComment(); }}
                rows={2}
                placeholder="Adicionar acompanhamento… (ex: advogada pediu cláusula de confidencialidade)"
                style={{ ...fieldStyle, flex: 1 }}
              />
              <button type="button" onClick={postComment} disabled={postingComment || !commentText.trim()}
                className="pda-btn" style={{ fontSize: 12, flexShrink: 0, alignSelf: "stretch" }}>
                <Send size={13} /> {postingComment ? "..." : "Registrar"}
              </button>
            </div>

            {enrichLoading ? (
              <div style={{ fontSize: 13, color: "var(--pandora-ink-400)", padding: "24px 0", textAlign: "center" }}>Carregando atividade…</div>
            ) : (
              <OppTimeline interactions={interactions} snapshot={snapshot} />
            )}
          </div>
        </div>

        {/* Propostas */}
        <div id="propostas" style={blockStyle}>
          <h2 style={blockHead}><FileText size={16} style={{ color: "var(--pandora-ink-400)" }} /> Propostas
            {proposals.length > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--pandora-ink-400)", fontFamily: "var(--font-text)" }}>· {proposals.length}</span>}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>
                {proposals.length === 0 ? "Nenhuma proposta" : `${proposals.length} proposta${proposals.length > 1 ? "s" : ""}`}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="pda-btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => setLinkModal("proposals")}>
                  <Link2 size={13} /> Vincular existente
                </button>
                <label className="pda-btn-ghost" style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                  <Upload size={13} /> {importingPdf ? "Importando..." : "Importar PDF"}
                  <input type="file" accept=".pdf,application/pdf" style={{ display: "none" }} onChange={importPdf} disabled={importingPdf} />
                </label>
                <Link href={`/propostas?opportunity_id=${id}`} className="pda-btn-ghost" style={{ fontSize: 12, textDecoration: "none" }}>
                  <Plus size={13} /> Nova proposta
                </Link>
              </div>
            </div>
            {proposals.length === 0 ? (
              <div className="pda-empty" style={{ padding: "48px 0" }}>
                <FileText size={32} />
                <p>Nenhuma proposta ainda</p>
              </div>
            ) : proposals.map(p => (
              <div key={p.id} className="pda-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--pandora-violet-900)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FileText size={16} style={{ color: "var(--pandora-violet-400)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                    {p.title}
                    {!p.content_md && p.viewer_url && (
                      <span className="pda-badge-violet" style={{ fontSize: 10, padding: "1px 6px" }}>PDF</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>
                    {p.version ? `v${p.version} · ` : ""}{STATUS_PROPOSAL_PT[p.status] ?? p.status}
                    {p.value ? ` · ${fmtBRL(p.value)}` : ""}
                    {p.sent_at ? ` · enviada ${fmtDate(p.sent_at)}` : ""}
                  </div>
                </div>
                {p.viewer_url && (
                  <a href={p.viewer_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "var(--pandora-violet-400)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none", flexShrink: 0 }}>
                    <ExternalLink size={13} /> {p.content_md ? "Ver" : "Abrir PDF"}
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contratos */}
        <div id="contratos" style={blockStyle}>
          <h2 style={blockHead}><ScrollText size={16} style={{ color: "var(--pandora-ink-400)" }} /> Contratos
            {contracts.length > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--pandora-ink-400)", fontFamily: "var(--font-text)" }}>· {contracts.length}</span>}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>
                {contracts.length === 0 ? "Nenhum contrato" : `${contracts.length} contrato${contracts.length > 1 ? "s" : ""}`}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="pda-btn-ghost" style={{ fontSize: 12 }}
                  onClick={() => setLinkModal("contracts")}>
                  <Link2 size={13} /> Vincular existente
                </button>
                <Link href={`/contratos?opportunity_id=${id}`} className="pda-btn-ghost" style={{ fontSize: 12, textDecoration: "none" }}>
                  <Plus size={13} /> Novo contrato
                </Link>
              </div>
            </div>
            {contracts.length === 0 ? (
              <div className="pda-empty" style={{ padding: "48px 0" }}>
                <ScrollText size={32} />
                <p>Nenhum contrato ainda</p>
              </div>
            ) : contracts.map(c => (
              <div key={c.id} className="pda-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--pandora-violet-900)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <ScrollText size={16} style={{ color: "var(--pandora-violet-400)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.title}</div>
                  <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>
                    v{c.version} · {STATUS_CONTRACT_PT[c.status] ?? c.status}
                    {c.value ? ` · ${fmtBRL(c.value)}` : ""}
                    {c.starts_at ? ` · início ${fmtDate(c.starts_at)}` : ""}
                  </div>
                </div>
                {c.viewer_url && (
                  <a href={c.viewer_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "var(--pandora-violet-400)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none", flexShrink: 0 }}>
                    <ExternalLink size={13} /> Ver
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Documentos */}
        <div id="documentos" style={blockStyle}>
          <h2 style={blockHead}><FolderOpen size={16} style={{ color: "var(--pandora-ink-400)" }} /> Documentos
            {documents.length > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--pandora-ink-400)", fontFamily: "var(--font-text)" }}>· {documents.length}</span>}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>
                {documents.length === 0 ? "Nenhum documento" : `${documents.length} documento${documents.length > 1 ? "s" : ""}`}
              </span>
              {clientId && (
                <label className="pda-btn-ghost" style={{ fontSize: 12, cursor: "pointer" }}>
                  <Upload size={13} /> {uploading ? "Enviando..." : "Fazer upload"}
                  <input type="file" multiple style={{ display: "none" }} onChange={uploadDoc} accept="*/*" disabled={uploading} />
                </label>
              )}
            </div>

            {!clientId && (
              <div className="pda-empty" style={{ padding: "32px 0" }}>
                <FolderOpen size={28} />
                <p>Documentos ficam disponíveis após o contrato ser assinado</p>
              </div>
            )}

            {clientId && documents.length === 0 && !uploading && (
              <div className="pda-empty" style={{ padding: "40px 0" }}>
                <FolderOpen size={32} />
                <p>Nenhum documento. Faça upload de PDFs, apresentações ou qualquer arquivo.</p>
                <label className="pda-btn" style={{ cursor: "pointer", marginTop: 8 }}>
                  <Upload size={14} /> Fazer upload
                  <input type="file" multiple style={{ display: "none" }} onChange={uploadDoc} accept="*/*" />
                </label>
              </div>
            )}

            {documents.map(doc => (
              <div key={doc.id} className="pda-card" style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--pandora-violet-900)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <FolderOpen size={16} style={{ color: "var(--pandora-violet-400)" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 500, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{doc.name}</div>
                  <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>
                    {doc.size_bytes ? `${(doc.size_bytes / 1024).toFixed(0)} KB · ` : ""}
                    {new Date(doc.uploaded_at).toLocaleDateString("pt-BR")}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <a href={doc.file_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "var(--pandora-violet-400)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none" }}>
                    <ExternalLink size={13} /> Abrir
                  </a>
                  <button onClick={() => deleteDoc(doc.id)} disabled={deletingDoc === doc.id}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-500)", display: "flex", alignItems: "center", padding: 4 }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Portal */}
        <div id="portal" style={blockStyle}>
          <h2 style={blockHead}><Globe size={16} style={{ color: "var(--pandora-ink-400)" }} /> Portal do cliente</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!portal ? (
              <div className="pda-card" style={{ textAlign: "center", padding: "40px 24px" }}>
                <Globe size={36} style={{ color: "var(--pandora-ink-600)", marginBottom: 12 }} />
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Nenhum portal criado</div>
                <div style={{ fontSize: 13, color: "var(--pandora-ink-400)", marginBottom: 20 }}>
                  Crie um portal para compartilhar propostas, contratos e documentos com o cliente.
                </div>
                {portalErr && <div style={{ fontSize: 13, color: "var(--color-danger)", marginBottom: 12 }}>{portalErr}</div>}
                <button className="pda-btn" onClick={createPortal} disabled={portalCreating}>
                  <Globe size={14} /> {portalCreating ? "Criando..." : "Criar portal"}
                </button>
              </div>
            ) : (
              <>
                {/* Info do portal */}
                <div className="pda-card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <div className="pda-eyebrow" style={{ marginBottom: 4 }}>Portal ativo</div>
                      <div style={{ fontWeight: 600 }}>{portal.label}</div>
                    </div>
                    <a href={`/portal/${portal.slug}`} target="_blank" rel="noopener noreferrer"
                      className="pda-btn-ghost" style={{ fontSize: 12, textDecoration: "none" }}>
                      <ExternalLink size={13} /> Abrir portal
                    </a>
                  </div>

                  {/* Credenciais */}
                  <div style={{ background: "var(--pandora-ink-50)", border: "1px solid var(--pandora-ink-100)", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <CredRow label="URL"   value={`${typeof window !== "undefined" ? window.location.origin : ""}/portal/${portal.slug}`} fieldKey="url" copiedField={copiedField} onCopy={copyField} mono />
                    <CredRow label="Email" value={portal.login_email} fieldKey="email" copiedField={copiedField} onCopy={copyField} />
                    {portalCredentials ? (
                      <>
                        <CredRow label="Senha" value={portalCredentials.password} fieldKey="password" copiedField={copiedField} onCopy={copyField} mono />
                        <button type="button" className="pda-btn" style={{ fontSize: 12, marginTop: 4 }}
                          onClick={() => copyField(`URL: ${window.location.origin}/portal/${portal.slug}\nEmail: ${portal.login_email}\nSenha: ${portalCredentials.password}`, "all")}>
                          {copiedField === "all" ? <><Check size={12} /> Copiado!</> : <><Copy size={12} /> Copiar tudo</>}
                        </button>
                      </>
                    ) : (
                      <div style={{ fontSize: 12, color: "var(--pandora-ink-500)" }}>Senha: ••••••••••••</div>
                    )}
                  </div>
                </div>

                {/* Reset senha */}
                <div className="pda-card">
                  <div className="pda-eyebrow" style={{ marginBottom: 10 }}>Gerar nova senha</div>
                  {resetMode ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Nova senha"
                        style={{ flex: 1, padding: "8px 10px", background: "var(--pandora-ink-0)", border: "1px solid var(--pandora-ink-200)", borderRadius: 6, color: "inherit", fontSize: 13 }} />
                      <button className="pda-btn" disabled={portalSaving || !newPwd} onClick={resetPassword} style={{ fontSize: 12 }}>
                        {portalSaving ? "..." : "Salvar"}
                      </button>
                      <button className="pda-btn-ghost" onClick={() => { setResetMode(false); setNewPwd(""); }} style={{ fontSize: 12 }}>
                        <X size={13} />
                      </button>
                    </div>
                  ) : (
                    <button className="pda-btn-ghost" style={{ fontSize: 12 }}
                      onClick={() => { setNewPwd(genPassword()); setResetMode(true); }}>
                      <RefreshCw size={13} /> Gerar nova senha
                    </button>
                  )}
                  {portalErr && <div style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 8 }}>{portalErr}</div>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal adicionar pessoa */}
      {personModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="pda-card" style={{ width: 480, maxWidth: "90vw", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Users size={16} /> Adicionar pessoa à oportunidade
              </h3>
              <button type="button" className="pda-btn-ghost" onClick={() => setPersonModal(false)}><X size={14} /></button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--pandora-ink-400)" }} />
                <input type="text" placeholder="Buscar contato por nome, email ou empresa…"
                  value={personSearch} onChange={e => setPersonSearch(e.target.value)} autoFocus
                  style={{ ...fieldStyle, paddingLeft: 32 }} />
              </div>
              <input type="text" placeholder="Papel (ex: jurídico)" value={personRole} onChange={e => setPersonRole(e.target.value)}
                style={{ ...fieldStyle, width: 140 }} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 300, overflowY: "auto" }}>
              {personResults.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--pandora-ink-400)", padding: "16px 0", textAlign: "center" }}>
                  {personSearch ? "Nenhum contato encontrado" : "Digite para buscar contatos"}
                </div>
              )}
              {personResults.map(c => {
                const already = c.id === primaryContactId || people.some(p => p.contact_id === c.id);
                return (
                  <button key={c.id} type="button" disabled={already || addingPerson === c.id}
                    onClick={() => addPerson(c.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                      border: "1px solid var(--pandora-ink-100)", background: "#fff", textAlign: "left",
                      cursor: already ? "default" : "pointer", opacity: already ? 0.5 : 1,
                    }}>
                    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--pandora-violet-50)", color: "var(--pandora-violet-700)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 12 }}>
                      {(c.name || "?").slice(0, 1).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pandora-ink-800)" }}>{c.name}</div>
                      <div style={{ fontSize: 11, color: "var(--pandora-ink-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {[c.role, c.company, c.email].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                    {already ? <Check size={14} style={{ color: "var(--pandora-green-400)" }} /> : addingPerson === c.id ? <span style={{ fontSize: 11 }}>...</span> : <Plus size={14} style={{ color: "var(--pandora-violet-600)" }} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Modal vincular proposta/contrato */}
      {linkModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div className="pda-card" style={{ width: 520, maxWidth: "90vw", padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: 16 }}>
                Vincular {linkModal === "proposals" ? "proposta" : "contrato"} existente
              </h3>
              <button type="button" className="pda-btn-ghost" onClick={() => setLinkModal(null)}><X size={14} /></button>
            </div>

            {/* Filtro */}
            <input
              type="text"
              placeholder={`Filtrar ${linkModal === "proposals" ? "propostas" : "contratos"}...`}
              value={linkSearch}
              onChange={e => setLinkSearch(e.target.value)}
              autoFocus
              style={{ width: "100%", padding: "10px 12px", background: "var(--pandora-ink-0)", border: "1px solid var(--pandora-ink-200)", borderRadius: 8, color: "inherit", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }}
            />

            {/* Dropdown list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 280, overflowY: "auto", marginBottom: 16 }}>
              {linkLoading && (
                <div style={{ fontSize: 13, color: "var(--pandora-ink-400)", padding: "12px 0", textAlign: "center" }}>Carregando...</div>
              )}
              {!linkLoading && linkFilteredItems.length === 0 && (
                <div style={{ fontSize: 13, color: "var(--pandora-ink-500)", padding: "12px 0", textAlign: "center" }}>
                  {linkSearch ? "Nenhum resultado" : `Nenhuma ${linkModal === "proposals" ? "proposta" : "contrato"} disponível`}
                </div>
              )}
              {!linkLoading && linkFilteredItems.map(item => {
                const isSelected = linkSelected === item.id;
                const value = (item as Proposal).value ?? (item as Contract).value;
                const statusPt = linkModal === "proposals"
                  ? (STATUS_PROPOSAL_PT[item.status] ?? item.status)
                  : (STATUS_CONTRACT_PT[item.status] ?? item.status);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setLinkSelected(isSelected ? null : item.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "10px 12px", borderRadius: 8, cursor: "pointer", textAlign: "left",
                      background: isSelected ? "var(--pandora-violet-600)" : "var(--pandora-ink-50)",
                      border: `1px solid ${isSelected ? "var(--pandora-violet-500)" : "var(--pandora-ink-150, var(--pandora-ink-200))"}`,
                      color: "inherit", transition: "background 0.15s, border-color 0.15s",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                      <div style={{ fontSize: 11, color: isSelected ? "rgba(255,255,255,0.7)" : "var(--pandora-ink-400)", marginTop: 2 }}>
                        {statusPt}{value ? ` · R$ ${value.toLocaleString("pt-BR")}` : ""}
                      </div>
                    </div>
                    {isSelected && <Check size={14} style={{ flexShrink: 0 }} />}
                  </button>
                );
              })}
            </div>

            {/* Ação */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="pda-btn-ghost" onClick={() => setLinkModal(null)}>Cancelar</button>
              <button
                className="pda-btn"
                disabled={!linkSelected || !!linking}
                onClick={() => linkSelected && linkItem(linkSelected, linkModal)}
              >
                {linking ? "Vinculando..." : <><Link2 size={12} /> Vincular</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

// Estilos compartilhados (flat / clean)
const fieldStyle: React.CSSProperties = {
  width: "100%", background: "#fff", border: "1px solid var(--pandora-ink-200)",
  borderRadius: 6, padding: "8px 10px", color: "var(--pandora-ink-800)",
  resize: "vertical", fontSize: 13, boxSizing: "border-box",
};
const sectionLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 600, letterSpacing: "0.16em", textTransform: "uppercase",
  color: "var(--pandora-ink-400)", fontFamily: "var(--font-display)",
};
// Bloco full-width separado por divisor — sem caixa
const blockStyle: React.CSSProperties = {
  borderTop: "1px solid var(--pandora-ink-100)", paddingTop: 28, marginTop: 28,
};
const blockHead: React.CSSProperties = {
  fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600,
  color: "var(--pandora-ink-800)", margin: "0 0 16px",
  display: "flex", alignItems: "center", gap: 8,
};

// Seção flat separada por divisor — sem caixa
function Section({ label, children, action, last }: {
  label: string; children: React.ReactNode; action?: React.ReactNode; last?: boolean;
}) {
  return (
    <div style={{ padding: "18px 0", borderBottom: last ? "none" : "1px solid var(--pandora-ink-100)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", minHeight: 16, marginBottom: 12 }}>
        <span style={sectionLabel}>{label}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--pandora-ink-400)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--pandora-ink-800)" }}>{value ?? "—"}</div>
    </div>
  );
}

// Campo com label + conteúdo editável inline
function InfoField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--pandora-ink-400)", marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500 }}>{children}</div>
    </div>
  );
}

// ─── Edição inline ──────────────────────────────────────────────────────────

function InlineText({ value, onSave, placeholder = "—", multiline, kind = "text", format, valueStyle, block }: {
  value?: string | number | null;
  onSave: (v: string) => void | Promise<void>;
  placeholder?: string;
  multiline?: boolean;
  kind?: "text" | "number";
  format?: (v: string) => React.ReactNode;
  valueStyle?: React.CSSProperties;
  block?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft]     = useState("");
  const [saving, setSaving]   = useState(false);

  const cur = value == null ? "" : String(value);

  function start() { setDraft(cur); setEditing(true); }
  async function commit() {
    if (saving) return;
    const v = draft.trim();
    if (v !== cur) { setSaving(true); await onSave(v); setSaving(false); }
    setEditing(false);
  }

  if (editing) {
    const onChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value);
    if (multiline) {
      return (
        <textarea autoFocus value={draft} disabled={saving} onChange={onChange} onBlur={commit} rows={3}
          onKeyDown={e => { if (e.key === "Escape") setEditing(false); else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit(); }}
          style={{ ...fieldStyle, lineHeight: 1.6 }} />
      );
    }
    return (
      <input autoFocus value={draft} disabled={saving} onChange={onChange} onBlur={commit}
        type={kind} step={kind === "number" ? "0.01" : undefined}
        onKeyDown={e => { if (e.key === "Escape") setEditing(false); else if (e.key === "Enter") commit(); }}
        style={{ ...fieldStyle, ...valueStyle, fontWeight: 400 }} />
    );
  }

  const has = cur !== "";
  return (
    <span className={`pda-inline${block ? " pda-inline-block" : ""}`} onClick={start} title="Clique para editar"
      style={{ ...valueStyle, color: has ? (valueStyle?.color ?? "var(--pandora-ink-800)") : "var(--pandora-ink-300)" }}>
      {has ? (format ? format(cur) : cur) : placeholder}
    </span>
  );
}

function InlineSelect<T extends string>({ value, options, onSave }: {
  value: T; options: { value: T; label: string }[]; onSave: (v: T) => void | Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const current = options.find(o => o.value === value)?.label ?? value;

  if (editing) {
    return (
      <select autoFocus value={value}
        onChange={async e => { const v = e.target.value as T; setEditing(false); if (v !== value) await onSave(v); }}
        onBlur={() => setEditing(false)}
        style={{ ...fieldStyle, padding: "5px 6px", fontSize: 13, width: "auto", cursor: "pointer" }}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    );
  }
  return (
    <span className="pda-inline" onClick={() => setEditing(true)} title="Clique para editar"
      style={{ color: "var(--pandora-ink-800)" }}>{current}</span>
  );
}

// ─── Qualificação (BANT) — flat ─────────────────────────────────────────────

function Qualification({
  qualification, onCycle, onQualify, qualifying, saving,
}: {
  qualification: OpportunityQualification | null;
  onCycle: (k: QualificationKey) => void;
  onQualify: () => void;
  qualifying: boolean;
  saving: boolean;
}) {
  const confirmedCount = BANT.filter(b => qualification?.[b.key]?.status === "confirmed").length;

  return (
    <Section
      label="Qualificação · BANT"
      last
      action={
        <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>
          {confirmedCount}/{BANT.length} confirmados{saving ? " · salvando…" : ""}
        </span>
      }
    >
      <div style={{ display: "flex", flexDirection: "column" }}>
        {BANT.map((b, i) => {
          const item = qualification?.[b.key];
          const meta = QUAL_STATE_META[item?.status ?? "unknown"];
          return (
            <div key={b.key} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--pandora-ink-100)" }}>
              <button
                type="button"
                onClick={() => onCycle(b.key)}
                title={`${b.label}: ${meta.label} (clique para alternar)`}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 1, color: meta.color, flexShrink: 0, display: "flex" }}
              >
                <meta.Icon size={17} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "var(--pandora-ink-800)" }}>{b.label}</span>
                  <span style={{ fontSize: 10, color: "var(--pandora-ink-400)" }}>{meta.label}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--pandora-ink-500)", lineHeight: 1.45, marginTop: 2 }}>
                  {item?.notes || b.hint}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onQualify}
        disabled={qualifying}
        style={{ fontSize: 12, marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--pandora-violet-600)", padding: 0 }}
      >
        <Sparkles size={13} /> {qualifying ? "Analisando conversas…" : qualification?.ai_generated ? "Requalificar com IA" : "Qualificar com IA"}
      </button>
    </Section>
  );
}

// ─── Resumo do deal (IA) — flat / claro ─────────────────────────────────────

function AiSummary({
  qualification, onQualify, qualifying,
}: {
  qualification: OpportunityQualification | null;
  onQualify: () => void;
  qualifying: boolean;
}) {
  const hasSummary = !!(qualification?.summary || qualification?.next_steps?.length || qualification?.risk);

  return (
    <Section
      label="Resumo do deal"
      action={hasSummary && (
        <button type="button" onClick={onQualify} disabled={qualifying} title="Atualizar"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", display: "flex", padding: 2 }}>
          <RefreshCw size={13} style={qualifying ? { animation: "spin 1s linear infinite" } : undefined} />
        </button>
      )}
    >
      {!hasSummary ? (
        <div>
          <div style={{ fontSize: 13, color: "var(--pandora-ink-500)", lineHeight: 1.55, marginBottom: 12 }}>
            Deixe a IA ler as reuniões, WhatsApp e emails e resumir onde o deal está, com riscos e próximos passos.
          </div>
          <button type="button" onClick={onQualify} disabled={qualifying}
            style={{ fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "var(--pandora-violet-600)", padding: 0 }}>
            <Sparkles size={13} /> {qualifying ? "Analisando…" : "Gerar resumo"}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {qualification?.summary && (
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: "var(--pandora-ink-700)" }}>{qualification.summary}</p>
          )}
          {qualification?.risk && (
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start", borderLeft: "2px solid #DC2626", paddingLeft: 10 }}>
              <span style={{ fontSize: 12, color: "var(--pandora-ink-600)", lineHeight: 1.5 }}>
                <strong style={{ color: "#B91C1C", fontWeight: 600 }}>Risco · </strong>{qualification.risk}
              </span>
            </div>
          )}
          {qualification?.next_steps && qualification.next_steps.length > 0 && (
            <div>
              <div style={{ ...sectionLabel, marginBottom: 8 }}>Próximos passos</div>
              <ul style={{ margin: 0, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {qualification.next_steps.map((s, i) => (
                  <li key={i} style={{ fontSize: 13, color: "var(--pandora-ink-700)", lineHeight: 1.45, display: "flex", gap: 8 }}>
                    <span style={{ color: "var(--pandora-ink-300)", flexShrink: 0 }}>{i + 1}.</span>{s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {qualification?.updated_at && (
            <div style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)" }}>
              IA · {fmtDate(qualification.updated_at)}
            </div>
          )}
        </div>
      )}
    </Section>
  );
}

// ─── Pessoa envolvida ───────────────────────────────────────────────────────

function PersonRow({ id, name, subtitle, roleLabel, onRemove }: {
  id: string; name: string; subtitle?: string | null; roleLabel?: string; onRemove?: () => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Link href={`/clientes/${id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", background: "var(--pandora-violet-50)", color: "var(--pandora-violet-700)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
          {(name || "?").slice(0, 1).toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--pandora-ink-800)", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
            {roleLabel && (
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--pandora-ink-400)", border: "1px solid var(--pandora-ink-200)", borderRadius: 99, padding: "1px 6px", flexShrink: 0 }}>
                {roleLabel}
              </span>
            )}
          </div>
          {subtitle && (
            <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>
          )}
        </div>
      </Link>
      {onRemove ? (
        <button type="button" onClick={onRemove} title="Remover da oportunidade"
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", display: "flex", padding: 4, flexShrink: 0 }}>
          <X size={14} />
        </button>
      ) : (
        <ChevronRight size={14} style={{ color: "var(--pandora-ink-300)", flexShrink: 0 }} />
      )}
    </div>
  );
}

// ─── Linha de atividade recente (preview) ───────────────────────────────────

function RecentRow({ item }: { item: Interaction }) {
  const channelColors: Record<string, string> = {
    whatsapp: "#25D366", email: "#EA4335", fathom: "#7C3AED", calcom: "#0070F3", manual: "#857891",
  };
  const date = new Date(item.occurred_at);
  const body = (item.metadata as Record<string, unknown> | undefined)?.fathom_summary as string | undefined
    ?? item.summary ?? item.content ?? "";
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ width: 8, height: 8, borderRadius: item.type === "meeting" ? 2 : "50%", background: channelColors[item.channel] ?? "#aaa", flexShrink: 0, marginTop: 5 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pandora-ink-800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.subject || (item.channel === "whatsapp" ? "Conversa WhatsApp" : item.channel)}
        </div>
        <div style={{ fontSize: 10, color: "var(--pandora-ink-500)", fontFamily: "var(--font-mono)" }}>
          {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
        </div>
        {body && (
          <div style={{ fontSize: 11, color: "var(--pandora-ink-500)", lineHeight: 1.4, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {body}
          </div>
        )}
      </div>
    </div>
  );
}

function CredRow({ label, value, fieldKey, copiedField, onCopy, mono }: {
  label: string; value: string; fieldKey: string;
  copiedField: string | null; onCopy: (v: string, k: string) => void; mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
      <span style={{ color: "var(--pandora-ink-500)", width: 40, flexShrink: 0 }}>{label}</span>
      <span style={{ flex: 1, fontFamily: mono ? "var(--font-mono)" : undefined, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {value}
      </span>
      <button type="button" onClick={() => onCopy(value, fieldKey)}
        style={{ background: "none", border: "1px solid var(--pandora-ink-200)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4, flexShrink: 0, color: copiedField === fieldKey ? "var(--pandora-green-400)" : "var(--pandora-ink-500)" }}>
        {copiedField === fieldKey ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
      </button>
    </div>
  );
}
