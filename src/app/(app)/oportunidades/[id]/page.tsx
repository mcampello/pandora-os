"use client";

import { use, useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Zap, FileText, ScrollText, Globe,
  User, Building2, Copy, Check, RefreshCw, Plus,
  ExternalLink, ClipboardList, ChevronRight, Edit2, Save, X,
  Upload, FolderOpen, Trash2, Link2,
} from "lucide-react";
import {
  CHANNEL_LABEL, CONFIDENCE_LABEL, CONFIDENCE_COLOR, STATUS_LABEL, STATUS_COLOR,
} from "@/lib/opportunities";
import type { OpportunityWithContact, Proposal, Contract } from "@/lib/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "visao-geral" | "propostas" | "contratos" | "documentos" | "portal";

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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OportunidadeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [opp, setOpp]             = useState<OppDetail | null>(null);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [portal, setPortal]       = useState<Portal | null>(null);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("visao-geral");

  // edit mode
  const [editing, setEditing]   = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", notes: "", value: "", contract_model: "", company: "" });
  const [saving, setSaving]     = useState(false);


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
      setEditForm({
        title: data.title,
        description: data.description ?? "",
        notes: data.notes ?? "",
        value: data.value != null ? String(data.value) : "",
        contract_model: data.contract_model ?? "",
        company: data.company ?? "",
      });

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

  // ── Edit ──────────────────────────────────────────────────────────────────

  async function saveEdit() {
    if (!opp) return;
    setSaving(true);
    const res = await fetch(`/api/opportunities/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editForm.title,
        description: editForm.description || null,
        notes: editForm.notes || null,
        value: editForm.value.trim() ? parseFloat(editForm.value) : null,
        contract_model: editForm.contract_model.trim() || null,
        company: editForm.company.trim() || null,
      }),
    });
    if (res.ok) { const d = await res.json(); setOpp(prev => ({ ...prev!, ...d })); setEditing(false); }
    setSaving(false);
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

  const tabs: { key: Tab; label: string; icon: React.ElementType; count?: number }[] = [
    { key: "visao-geral",  label: "Visão Geral",  icon: Zap },
    { key: "propostas",    label: "Propostas",    icon: FileText,   count: proposals.length },
    { key: "contratos",    label: "Contratos",    icon: ScrollText, count: contracts.length },
    { key: "documentos",   label: "Documentos",   icon: FolderOpen, count: documents.length },
    { key: "portal",       label: "Portal",       icon: Globe },
  ];

  return (
    <div className="pda-main">
      {/* ── Header ── */}
      <div className="pda-topbar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 12, padding: "12px 24px", height: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <Link href="/oportunidades" style={{ color: "var(--pandora-ink-400)", display: "flex", alignItems: "center", gap: 4, fontSize: 13, textDecoration: "none" }}>
            <ArrowLeft size={14} /> Oportunidades
          </Link>
          <span style={{ color: "var(--pandora-ink-700)" }}>/</span>
          <span style={{ fontSize: 13, color: "var(--pandora-ink-300)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
            {opp.title}
          </span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexShrink: 0 }}>
            {!editing && (
              <button className="pda-btn-ghost" onClick={() => setEditing(true)} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                <Edit2 size={13} /> Editar
              </button>
            )}
            {editing && (
              <>
                <button className="pda-btn" onClick={saveEdit} disabled={saving} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
                  <Save size={13} /> {saving ? "Salvando..." : "Salvar"}
                </button>
                <button className="pda-btn-ghost" onClick={() => setEditing(false)} style={{ fontSize: 12 }}>
                  <X size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, width: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                style={{ fontSize: 22, fontWeight: 700, width: "100%", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 6, padding: "4px 10px", color: "inherit", fontFamily: "var(--font-display)" }} />
            ) : (
              <h1 style={{ margin: 0, fontSize: 22, fontFamily: "var(--font-display)", lineHeight: 1.2 }}>{opp.title}</h1>
            )}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, background: `${statusColor}18`, color: statusColor, padding: "3px 10px", borderRadius: 99, fontWeight: 600 }}>
                {STATUS_LABEL[opp.status]}
              </span>
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

      {/* ── Tabs ── */}
      <div style={{ borderBottom: "1px solid var(--pandora-ink-800)", padding: "0 24px", display: "flex", gap: 2 }}>
        {tabs.map(tab => (
          <button key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "10px 16px",
              fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6,
              color: activeTab === tab.key ? "var(--pandora-violet-400)" : "var(--pandora-ink-400)",
              borderBottom: `2px solid ${activeTab === tab.key ? "var(--pandora-violet-600)" : "transparent"}`,
              marginBottom: -1,
            }}>
            <tab.icon size={14} />
            {tab.label}
            {tab.count != null && tab.count > 0 && (
              <span style={{ fontSize: 10, background: "var(--pandora-violet-900)", color: "var(--pandora-violet-400)", borderRadius: 10, padding: "1px 6px" }}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="pda-content" style={{ maxWidth: 860 }}>

        {/* Visão Geral */}
        {activeTab === "visao-geral" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Descrição */}
            <div className="pda-card">
              <div className="pda-eyebrow" style={{ marginBottom: 10 }}>Descrição</div>
              {editing ? (
                <textarea value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={4} placeholder="Descreva a oportunidade..."
                  style={{ width: "100%", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 6, padding: "8px 10px", color: "inherit", resize: "vertical", fontSize: 13, boxSizing: "border-box" }} />
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: opp.description ? "inherit" : "var(--pandora-ink-500)", lineHeight: 1.6 }}>
                  {opp.description || "Sem descrição"}
                </p>
              )}
            </div>

            {/* Notas */}
            <div className="pda-card">
              <div className="pda-eyebrow" style={{ marginBottom: 10 }}>Notas internas</div>
              {editing ? (
                <textarea value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))}
                  rows={3} placeholder="Notas privadas sobre esta oportunidade..."
                  style={{ width: "100%", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 6, padding: "8px 10px", color: "inherit", resize: "vertical", fontSize: 13, boxSizing: "border-box" }} />
              ) : (
                <p style={{ margin: 0, fontSize: 14, color: opp.notes ? "inherit" : "var(--pandora-ink-500)", lineHeight: 1.6 }}>
                  {opp.notes || "Sem notas"}
                </p>
              )}
            </div>

            {/* Info */}
            <div className="pda-card">
              <div className="pda-eyebrow" style={{ marginBottom: 12 }}>Detalhes</div>
              {editing ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--pandora-ink-500)", marginBottom: 4, fontFamily: "var(--font-display)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Valor (R$)</div>
                    <input type="number" value={editForm.value} onChange={e => setEditForm(f => ({ ...f, value: e.target.value }))}
                      placeholder="0,00" min="0" step="0.01"
                      style={{ width: "100%", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 6, padding: "7px 10px", color: "inherit", fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--pandora-ink-500)", marginBottom: 4, fontFamily: "var(--font-display)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Empresa</div>
                    <input value={editForm.company} onChange={e => setEditForm(f => ({ ...f, company: e.target.value }))}
                      placeholder="Nome da empresa…"
                      style={{ width: "100%", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 6, padding: "7px 10px", color: "inherit", fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: "var(--pandora-ink-500)", marginBottom: 4, fontFamily: "var(--font-display)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Modelo</div>
                    <input value={editForm.contract_model} onChange={e => setEditForm(f => ({ ...f, contract_model: e.target.value }))}
                      placeholder="Ex: mensal, projeto…"
                      style={{ width: "100%", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 6, padding: "7px 10px", color: "inherit", fontSize: 13, boxSizing: "border-box" }} />
                  </div>
                </div>
              ) : null}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
                <InfoItem label="Canal"      value={CHANNEL_LABEL[opp.channel]} />
                <InfoItem label="Confiança"  value={CONFIDENCE_LABEL[opp.confidence]} color={CONFIDENCE_COLOR[opp.confidence]} />
                <InfoItem label="Status"     value={STATUS_LABEL[opp.status]} color={statusColor} />
                <InfoItem label="Detectada"  value={fmtDate(opp.detected_at)} />
                {opp.qualified_at && <InfoItem label="Qualificada" value={fmtDate(opp.qualified_at)} />}
                {opp.value != null && <InfoItem label="Valor" value={fmtBRL(opp.value) ?? "—"} color="var(--pandora-green-400)" />}
                {opp.company && <InfoItem label="Empresa" value={opp.company} />}
                {opp.contract_model && <InfoItem label="Modelo" value={opp.contract_model} />}
              </div>
              {opp.contact && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--pandora-ink-800)" }}>
                  <div style={{ fontSize: 11, color: "var(--pandora-ink-500)", marginBottom: 6 }}>CONTATO</div>
                  <Link href={`/clientes/${opp.contact_id}`} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none", color: "inherit" }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--pandora-violet-900)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <User size={14} style={{ color: "var(--pandora-violet-400)" }} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{opp.contact.name}</div>
                      <div style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>{opp.contact.company} · {opp.contact.email}</div>
                    </div>
                    <ChevronRight size={14} style={{ marginLeft: "auto", color: "var(--pandora-ink-600)" }} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Propostas */}
        {activeTab === "propostas" && (
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
        )}

        {/* Contratos */}
        {activeTab === "contratos" && (
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
        )}

        {/* Documentos */}
        {activeTab === "documentos" && (
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
        )}

        {/* Portal */}
        {activeTab === "portal" && (
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
                  <div style={{ background: "var(--pandora-ink-900)", borderRadius: 8, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
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
                        style={{ flex: 1, padding: "8px 10px", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 6, color: "inherit", fontSize: 13 }} />
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
        )}
      </div>

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
              style={{ width: "100%", padding: "10px 12px", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 8, color: "inherit", fontSize: 13, boxSizing: "border-box", marginBottom: 8 }}
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
                      background: isSelected ? "var(--pandora-violet-600)" : "var(--pandora-ink-900)",
                      border: `1px solid ${isSelected ? "var(--pandora-violet-500)" : "var(--pandora-ink-800)"}`,
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

function InfoItem({ label, value, color }: { label: string; value?: string | null; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: "var(--pandora-ink-500)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 500, color: color ?? "inherit" }}>{value ?? "—"}</div>
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
        style={{ background: "none", border: "1px solid var(--pandora-ink-700)", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 11, display: "flex", alignItems: "center", gap: 4, flexShrink: 0, color: copiedField === fieldKey ? "var(--pandora-green-400)" : "var(--pandora-ink-400)" }}>
        {copiedField === fieldKey ? <><Check size={10} /> Copiado</> : <><Copy size={10} /> Copiar</>}
      </button>
    </div>
  );
}
