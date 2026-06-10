"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import TaskBell from "@/components/TaskBell";
import type { Contact, Interaction, AnalysisSnapshot, OpportunityChannel, OpportunityConfidence, ContactCategory, OpportunityWithContact } from "@/lib/types";
import { STATUS_LABEL, STATUS_COLOR, timeAgo } from "@/lib/opportunities";
import {
  ArrowLeft, Mail, Phone, Link2, Globe, Building2, Briefcase,
  Sparkles, TrendingUp, RefreshCw, ExternalLink, Pencil, Check, X,
  History, ChevronDown, ChevronUp, Zap, CheckCircle2, Clock, MessageSquarePlus, Download,
  CalendarDays, Video, FileText, MessageCircle, CheckSquare,
} from "lucide-react";
import type { Task } from "@/lib/tasks";
import { useChatPanel } from "@/lib/chat-panel-context";

interface IntelResult {
  snapshot: AnalysisSnapshot;
  no_new_data: boolean;
}

export default function ContatoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const supabase = supabaseBrowser();
  const { openPanel } = useChatPanel();

  const [contact, setContact]     = useState<Contact | null>(null);
  const [interactions, setInts]   = useState<Interaction[]>([]);
  const [snapshots, setSnapshots] = useState<AnalysisSnapshot[]>([]);
  const [noNewData, setNoNewData] = useState(false);
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [draft, setDraft]         = useState<Partial<Contact>>({});
  const [showSales, setShowSales] = useState(false);
  const [oppForm, setOppForm]     = useState(false);
  const [oppSaving, setOppSaving] = useState(false);
  const [opp, setOpp]             = useState({ title: "", description: "", channel: "whatsapp" as OpportunityChannel, confidence: "medium" as OpportunityConfidence });
  const [oppSuccess, setOppSuccess]   = useState(false);
  const [syncingGmail, setSyncGmail]    = useState(false);
  const [gmailResult, setGmailResult]   = useState<string | null>(null);
  const [calResult, setCalResult]       = useState<string | null>(null);
  const [refreshingContact, setRefreshingContact] = useState(false);
  const [waMatches, setWaMatches]       = useState<{ name: string; phone: string; jid: string; score: number }[] | null>(null);
  const [findingWa, setFindingWa]       = useState(false);
  const [syncingWa, setSyncingWa]       = useState(false);
  const [waResult, setWaResult]         = useState<string | null>(null);
  const [updateForm, setUpdateForm] = useState(false);
  const [updateSaving, setUpdateSaving] = useState(false);
  const [update, setUpdate] = useState({ subject: "", content: "", type: "note", occurred_at: new Date().toISOString().slice(0, 16) });
  const [contactOpps, setContactOpps] = useState<OpportunityWithContact[]>([]);
  const [contactTasks, setContactTasks] = useState<Task[]>([]);

  async function loadOpportunities() {
    const res = await fetch(`/api/opportunities?contact_id=${id}`);
    if (res.ok) setContactOpps((await res.json()) as OpportunityWithContact[]);
  }

  async function loadTasks() {
    const res = await fetch(`/api/tasks?entity_id=${id}&status=open`);
    if (res.ok) setContactTasks((await res.json()) as Task[]);
  }

  async function updateTaskStatus(taskId: string, status: "done" | "dismissed") {
    await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await loadTasks();
  }

  async function load() {
    const { data: c } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
    setContact(c as Contact | null);
    if (!c) return;

    const { data: ix } = await supabase
      .from("interactions").select("*").eq("contact_id", id)
      .order("occurred_at", { ascending: false }).limit(50);
    setInts((ix as Interaction[]) ?? []);

    const { data: snaps } = await supabase
      .from("contact_analysis_snapshots").select("*").eq("contact_id", id)
      .order("created_at", { ascending: false }).limit(20);
    setSnapshots((snaps as AnalysisSnapshot[]) ?? []);
    await loadOpportunities();
    await loadTasks();
  }

  function startEdit() {
    if (!contact) return;
    setDraft({
      name: contact.name,
      company: contact.company ?? "",
      role: contact.role ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      linkedin_url: contact.linkedin_url ?? "",
      website: contact.website ?? "",
      notes: contact.notes ?? "",
    });
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    const hadEmail = !!contact?.email;
    const hadPhone = !!contact?.phone;
    const newEmail = draft.email?.trim() || null;
    const newPhone = draft.phone?.trim() || null;

    const { error } = await supabase.from("contacts").update({
      name: draft.name,
      company: draft.company || null,
      role: draft.role || null,
      email: newEmail,
      phone: newPhone,
      linkedin_url: draft.linkedin_url || null,
      website: draft.website || null,
      notes: draft.notes || null,
    }).eq("id", id);

    if (!error) {
      setEditing(false);
      await load();

      // Auto-enrich when email or phone is newly added
      const emailAdded = !hadEmail && !!newEmail;
      const phoneAdded = !hadPhone && !!newPhone;

      if (emailAdded || phoneAdded) {
        const syncs: Promise<void>[] = [];

        if (emailAdded) {
          // Cal.com enrichment (via enrich endpoint)
          syncs.push(fetch(`/api/contacts/${id}/enrich`, { method: "POST" }).then(() => {}));
          // Gmail
          syncs.push(
            fetch(`/api/contacts/${id}/sync-gmail`, { method: "POST" })
              .then((r) => r.json())
              .then((d) => { if (d.created > 0) setGmailResult(`${d.created} emails importados automaticamente`); })
              .catch(() => {})
          );
          // Calendar
          syncs.push(
            fetch(`/api/contacts/${id}/sync-calendar`, { method: "POST" })
              .then((r) => r.json())
              .then((d) => { if (d.created > 0) setCalResult(`${d.created} reuniões importadas automaticamente`); })
              .catch(() => {})
          );
        }

        await Promise.all(syncs);
        await load();
      }
    }

    setSaving(false);
  }

  async function atualizarContato() {
    if (!contact || refreshingContact) return;
    setRefreshingContact(true);
    setNoNewData(false);
    setGmailResult(null);
    setCalResult(null);
    setWaResult(null);
    try {
      const syncs: Promise<void>[] = [];

      if (contact.email) {
        syncs.push(
          fetch(`/api/contacts/${id}/sync-calendar`, { method: "POST" })
            .then((r) => r.json())
            .then((d) => {
              if (d.error) setCalResult(`Erro: ${d.error}`);
              else setCalResult(`${d.created} novas reuniões, ${d.updated} atualizadas (${d.relevant} com este contato)`);
            })
            .catch(() => setCalResult("Erro ao sincronizar calendário"))
        );
        syncs.push(
          fetch(`/api/contacts/${id}/sync-gmail`, { method: "POST" })
            .then((r) => r.json())
            .then((d) => {
              if (d.error) setGmailResult(`Erro: ${d.error}`);
              else setGmailResult(`${d.created} emails novos importados (${d.synced} threads encontradas)`);
            })
            .catch(() => setGmailResult("Erro ao sincronizar Gmail"))
        );
      } else {
        setCalResult(null);
        setGmailResult(null);
      }

      if (contact.phone) {
        syncs.push(
          fetch(`/api/contacts/${id}/sync-whatsapp`, { method: "POST" })
            .then((r) => r.json())
            .then((d) => {
              if (d.error) setWaResult(`Erro: ${d.error}`);
              else setWaResult(
                typeof d.days_imported === "number"
                  ? `${d.days_imported} novos dias importados (${d.synced} mensagens)`
                  : (d.message ?? "")
              );
            })
            .catch(() => setWaResult("Erro ao sincronizar WhatsApp"))
        );
      }

      await Promise.all(syncs);
      await load();

      const intelRes = await fetch(`/api/contacts/${id}/intel`, { method: "POST" });
      if (intelRes.ok) {
        const result: IntelResult = await intelRes.json();
        setNoNewData(result.no_new_data);
        if (!result.no_new_data) await load();
      }
    } finally {
      setRefreshingContact(false);
    }
  }

  async function createOpportunity() {
    setOppSaving(true);
    const res = await fetch("/api/opportunities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...opp, contact_id: id }),
    });
    if (res.ok) {
      setOppSuccess(true);
      setOppForm(false);
      setOpp({ title: "", description: "", channel: "whatsapp", confidence: "medium" });
      setTimeout(() => setOppSuccess(false), 3000);
      await loadOpportunities();
    }
    setOppSaving(false);
  }

  async function syncGmail() {
    setSyncGmail(true);
    setGmailResult(null);
    const res = await fetch(`/api/contacts/${id}/sync-gmail`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setGmailResult(`${data.created} emails novos importados (${data.synced} threads encontradas)`);
      await load();
    } else {
      setGmailResult(`Erro: ${data.error}`);
    }
    setSyncGmail(false);
  }

  async function findWhatsApp() {
    setFindingWa(true);
    setWaMatches(null);
    setWaResult(null);
    const res = await fetch(`/api/contacts/${id}/find-whatsapp`);
    const data = await res.json();
    if (res.ok) setWaMatches(data.matches ?? []);
    else setWaResult(`Erro: ${data.error}`);
    setFindingWa(false);
  }

  async function linkWhatsApp(phone: string) {
    setSyncingWa(true);
    setWaResult(null);
    // Save phone to contact
    await supabase.from("contacts").update({ phone }).eq("id", id);
    // Sync WhatsApp history
    const res = await fetch(`/api/contacts/${id}/sync-whatsapp`, { method: "POST" });
    const data = await res.json();
    if (res.ok) {
      setWaResult(`WhatsApp vinculado: ${data.days_imported} dias de conversa importados (${data.synced} mensagens)`);
    } else {
      setWaResult(`Número salvo, mas ${data.error || "sem histórico encontrado"}`);
    }
    setWaMatches(null);
    setSyncingWa(false);
    await load();
  }

  async function syncWhatsApp() {
    setSyncingWa(true);
    setWaResult(null);
    const res = await fetch(`/api/contacts/${id}/sync-whatsapp`, { method: "POST" });
    const data = await res.json();
    if (res.ok) setWaResult(`${data.days_imported} novos dias importados (${data.synced} mensagens)`);
    else setWaResult(`Erro: ${data.error}`);
    setSyncingWa(false);
    await load();
  }

  async function saveCategory(cat: ContactCategory) {
    await supabase.from("contacts").update({ category: cat }).eq("id", id);
    await load();
  }

  async function addUpdate() {
    if (!update.subject.trim()) return;
    setUpdateSaving(true);
    await fetch("/api/interactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contact_id: id,
        subject: update.subject,
        content: update.content || null,
        type: update.type,
        occurred_at: new Date(update.occurred_at).toISOString(),
      }),
    });
    setUpdateForm(false);
    setUpdate({ subject: "", content: "", type: "note", occurred_at: new Date().toISOString().slice(0, 16) });
    setUpdateSaving(false);
    await load();
  }

  useEffect(() => { load(); }, [id]);

  if (!contact) {
    return (
      <>
        <header className="pda-topbar">
          <div className="pda-topbar-left">
            <Link href="/clientes" className="pda-icon-btn"><ArrowLeft size={16} /></Link>
            <h1 className="pda-topbar-title">Carregando…</h1>
          </div>
        </header>
        <div className="pda-content" />
      </>
    );
  }

  const initials = contact.name.split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  const latest = snapshots[0] ?? null;
  const category = (contact.category ?? "desconhecido") as ContactCategory;

  const CATEGORIES: { value: ContactCategory; label: string; color: string }[] = [
    { value: "prospect",      label: "Prospect",      color: "var(--pandora-violet-600)" },
    { value: "cliente",       label: "Cliente",       color: "#059669" },
    { value: "fornecedor",    label: "Fornecedor",    color: "#0284c7" },
    { value: "desenvolvedor", label: "Desenvolvedor", color: "#7c3aed" },
    { value: "parceiro",      label: "Parceiro",      color: "#d97706" },
    { value: "casual",        label: "Casual",        color: "#6b7280" },
    { value: "desconhecido",  label: "Desconhecido",  color: "#9ca3af" },
  ];

  const STRATEGY_LABELS: Record<ContactCategory, string | null> = {
    prospect:      "Como vender pra ele",
    cliente:       "Como reter e expandir",
    fornecedor:    "Stack e como trabalhar com ele",
    desenvolvedor: "Stack e especialidades",
    parceiro:      "Como nutrir a parceria",
    casual:        null, // não exibe
    desconhecido:  "O que fazer com esse contato",
  };

  const UPDATE_TYPES = [
    { value: "note",    label: "Nota" },
    { value: "meeting", label: "Reunião" },
    { value: "call",    label: "Ligação" },
    { value: "email",   label: "Email" },
  ];

  // Timeline unificada: snapshots + interações ordenados por data desc
  type TimelineEntry =
    | { kind: "snapshot"; date: Date; snap: AnalysisSnapshot }
    | { kind: "interaction"; date: Date; item: Interaction };

  const timeline: TimelineEntry[] = [
    ...snapshots.map((s) => ({ kind: "snapshot" as const, date: new Date(s.created_at), snap: s })),
    ...interactions.map((i) => ({ kind: "interaction" as const, date: new Date(i.occurred_at), item: i })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <Link href="/clientes" className="pda-icon-btn"><ArrowLeft size={16} /></Link>
          <h1 className="pda-topbar-title">{contact.name}</h1>
          {contact.source && <span className="pda-chip">{contact.source}</span>}
          {oppSuccess && <span className="pda-badge pda-badge-success" style={{ fontSize: 12 }}>Oportunidade criada!</span>}
        </div>
        <div className="pda-topbar-right">
          <button onClick={() => { setOppForm((v) => !v); setUpdateForm(false); }} className="pda-btn pda-btn-ghost">
            <Zap size={14} /> Criar oportunidade
          </button>
          <TaskBell />
        </div>
      </header>

      {/* Form criar oportunidade */}
      {oppForm && (
        <div style={{ background: "var(--pandora-violet-50)", borderBottom: "1px solid var(--pandora-ink-100)", padding: "16px 24px" }}>
          <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 12 }}>
            <span className="pda-eyebrow">Nova oportunidade — {contact.name}</span>
            <input
              value={opp.title}
              onChange={(e) => setOpp((o) => ({ ...o, title: e.target.value }))}
              placeholder="Título da oportunidade…"
              style={inputStyle}
            />
            <textarea
              value={opp.description}
              onChange={(e) => setOpp((o) => ({ ...o, description: e.target.value }))}
              placeholder="Descrição / contexto (opcional)…"
              style={{ ...inputStyle, height: 64, resize: "vertical" }}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <select value={opp.channel} onChange={(e) => setOpp((o) => ({ ...o, channel: e.target.value as OpportunityChannel }))} style={{ ...inputStyle, width: "auto" }}>
                <option value="whatsapp">WhatsApp</option>
                <option value="email">Email</option>
                <option value="calcom">Cal.com</option>
                <option value="manual">Manual</option>
                <option value="group">Grupo</option>
              </select>
              <select value={opp.confidence} onChange={(e) => setOpp((o) => ({ ...o, confidence: e.target.value as OpportunityConfidence }))} style={{ ...inputStyle, width: "auto" }}>
                <option value="very_high">Confiança muito alta</option>
                <option value="high">Alta</option>
                <option value="medium">Média</option>
                <option value="low">Baixa</option>
              </select>
              <button onClick={createOpportunity} disabled={oppSaving || !opp.title} className="pda-btn">
                {oppSaving ? "Salvando…" : "Salvar"}
              </button>
              <button onClick={() => setOppForm(false)} className="pda-btn pda-btn-ghost"><X size={14} /></button>
            </div>
          </div>
        </div>
      )}

      <div className="pda-content">
        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 20, alignItems: "start" }}>

          {/* ── COLUNA ESQUERDA ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Card de perfil */}
            <div className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: "50%",
                  background: "var(--pandora-violet-50)", color: "var(--pandora-violet-700)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 16, flexShrink: 0,
                }}>{initials}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing ? (
                    <input value={draft.name ?? ""} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} style={inputStyle} />
                  ) : (
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--pandora-violet-900)" }}>{contact.name}</div>
                  )}
                  {!editing && contact.role && <div style={{ fontSize: 12, color: "var(--pandora-ink-500)" }}>{contact.role}</div>}
                </div>
                {!editing ? (
                  <button onClick={startEdit} className="pda-btn pda-btn-ghost" style={{ padding: "4px 8px", flexShrink: 0 }}><Pencil size={13} /></button>
                ) : (
                  <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                    <button onClick={saveEdit} disabled={saving} className="pda-btn" style={{ padding: "4px 8px" }}><Check size={13} /></button>
                    <button onClick={() => setEditing(false)} disabled={saving} className="pda-btn pda-btn-ghost" style={{ padding: "4px 8px" }}><X size={13} /></button>
                  </div>
                )}
              </div>

              {editing ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {([
                    { icon: <Building2 size={13} />, label: "Empresa", key: "company", placeholder: "Empresa" },
                    { icon: <Briefcase size={13} />, label: "Cargo", key: "role", placeholder: "Cargo / função" },
                    { icon: <Mail size={13} />, label: "Email", key: "email", placeholder: "email@exemplo.com" },
                    { icon: <Phone size={13} />, label: "Telefone", key: "phone", placeholder: "+55 11 99999-9999" },
                    { icon: <Link2 size={13} />, label: "LinkedIn", key: "linkedin_url", placeholder: "https://linkedin.com/in/..." },
                    { icon: <Globe size={13} />, label: "Site", key: "website", placeholder: "https://..." },
                  ] as const).map(({ icon, label, key, placeholder }) => (
                    <div key={key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "var(--pandora-ink-400)", display: "flex", flexShrink: 0 }}>{icon}</span>
                      <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", width: 52, flexShrink: 0 }}>{label}</span>
                      <input
                        value={(draft[key] as string) ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                        placeholder={placeholder}
                        style={{ ...inputStyle, flex: 1 }}
                      />
                    </div>
                  ))}
                  <div style={{ paddingTop: 6, borderTop: "1px solid var(--pandora-ink-100)" }}>
                    <div className="pda-eyebrow" style={{ marginBottom: 5 }}>Notas</div>
                    <textarea value={draft.notes ?? ""} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} style={{ ...inputStyle, height: 72, resize: "vertical" }} placeholder="Observações…" />
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {contact.company      && <InfoRow icon={<Building2 size={13} />}>{contact.company}</InfoRow>}
                  {contact.role         && <InfoRow icon={<Briefcase size={13} />}>{contact.role}</InfoRow>}
                  {contact.email && (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <InfoRow icon={<Mail size={13} />}><a href={`mailto:${contact.email}`} style={linkStyle}>{contact.email}</a></InfoRow>
                      <button
                        onClick={syncGmail}
                        disabled={syncingGmail}
                        title="Buscar emails no Gmail"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", padding: 2, display: "flex", flexShrink: 0 }}
                      >
                        <Download size={12} style={syncingGmail ? { animation: "spin 1s linear infinite" } : {}} />
                      </button>
                    </div>
                  )}
                  {contact.phone ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <InfoRow icon={<Phone size={13} />}>{contact.phone}</InfoRow>
                      <button
                        onClick={syncWhatsApp}
                        disabled={syncingWa}
                        title="Sincronizar histórico WhatsApp"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", padding: 2, display: "flex", flexShrink: 0 }}
                      >
                        <RefreshCw size={12} style={syncingWa ? { animation: "spin 1s linear infinite" } : {}} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Phone size={13} style={{ color: "var(--pandora-ink-300)", flexShrink: 0 }} />
                      <button
                        onClick={findWhatsApp}
                        disabled={findingWa}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--pandora-violet-500)", padding: 0, fontFamily: "var(--font-text)" }}
                      >
                        {findingWa ? "Buscando na agenda…" : "Buscar no WhatsApp"}
                      </button>
                    </div>
                  )}
                  {contact.linkedin_url && <InfoRow icon={<Link2 size={13} />}><a href={contact.linkedin_url} target="_blank" style={linkStyle}>LinkedIn <ExternalLink size={10} /></a></InfoRow>}
                  {contact.website      && <InfoRow icon={<Globe size={13} />}><a href={contact.website} target="_blank" style={linkStyle}>Site <ExternalLink size={10} /></a></InfoRow>}
                  {!contact.company && !contact.email && !contact.linkedin_url && (
                    <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: 0 }}>Clique em editar para adicionar detalhes.</p>
                  )}
                </div>
              )}

              {gmailResult && (
                <p style={{ fontSize: 11, color: gmailResult.startsWith("Erro") ? "var(--color-danger)" : "var(--color-success)", margin: 0 }}>
                  {gmailResult}
                </p>
              )}
              {calResult && (
                <p style={{ fontSize: 11, color: calResult.startsWith("Erro") ? "var(--color-danger)" : "var(--color-success)", margin: 0 }}>
                  {calResult}
                </p>
              )}

              {/* WhatsApp match panel */}
              {waMatches !== null && (
                <div style={{ paddingTop: 8, borderTop: "1px solid var(--pandora-ink-100)" }}>
                  <div className="pda-eyebrow" style={{ marginBottom: 7 }}>Agenda do WhatsApp</div>
                  {waMatches.length === 0 ? (
                    <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: 0 }}>Nenhum contato similar encontrado na agenda.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {waMatches.map((m) => (
                        <button
                          key={m.jid}
                          onClick={() => linkWhatsApp(m.phone)}
                          disabled={syncingWa}
                          style={{
                            display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
                            background: "var(--pandora-ink-25)", border: "1px solid var(--pandora-ink-100)",
                            borderRadius: "var(--radius-sm)", cursor: "pointer", textAlign: "left",
                          }}
                        >
                          <Phone size={12} color="var(--color-success)" />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pandora-violet-900)" }}>{m.name}</div>
                            <div style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)" }}>+{m.phone}</div>
                          </div>
                          <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{Math.round(m.score * 100)}%</span>
                        </button>
                      ))}
                      <button onClick={() => setWaMatches(null)} style={{ fontSize: 11, color: "var(--pandora-ink-400)", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "2px 0" }}>
                        Cancelar
                      </button>
                    </div>
                  )}
                </div>
              )}
              {waResult && (
                <p style={{ fontSize: 11, color: waResult.startsWith("Erro") ? "var(--color-danger)" : "var(--color-success)", margin: 0 }}>
                  {waResult}
                </p>
              )}

              {/* Seletor de categoria */}
              <div style={{ paddingTop: 10, borderTop: "1px solid var(--pandora-ink-100)" }}>
                <div className="pda-eyebrow" style={{ marginBottom: 7 }}>Classificação</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat.value}
                      onClick={() => saveCategory(cat.value)}
                      style={{
                        padding: "3px 10px", borderRadius: 99, fontSize: 11, cursor: "pointer",
                        fontFamily: "var(--font-display)", fontWeight: 600,
                        border: `1.5px solid ${category === cat.value ? cat.color : "var(--pandora-ink-100)"}`,
                        background: category === cat.value ? cat.color : "transparent",
                        color: category === cat.value ? "#fff" : "var(--pandora-ink-500)",
                        transition: "all 0.15s",
                      }}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {!editing && contact.tags && contact.tags.length > 0 && (
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {contact.tags.map((t) => <span key={t} className="pda-badge pda-badge-green" style={{ textTransform: "lowercase" }}>{t}</span>)}
                </div>
              )}

              {!editing && contact.notes && (
                <div style={{ paddingTop: 10, borderTop: "1px solid var(--pandora-ink-100)" }}>
                  <div className="pda-eyebrow" style={{ marginBottom: 5 }}>Notas</div>
                  <p style={{ fontSize: 12, color: "var(--pandora-ink-600)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>{contact.notes}</p>
                </div>
              )}
            </div>

            {/* Estratégia — colapsável, oculta para casual */}
            {STRATEGY_LABELS[category] !== null && (
              <div className="pda-card" style={{ padding: 0, overflow: "hidden" }}>
                <button
                  onClick={() => setShowSales((v) => !v)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "12px 16px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <TrendingUp size={14} color="var(--pandora-violet-500)" />
                  <span className="pda-eyebrow" style={{ flex: 1 }}>{STRATEGY_LABELS[category]}</span>
                  {showSales ? <ChevronUp size={14} color="var(--pandora-ink-400)" /> : <ChevronDown size={14} color="var(--pandora-ink-400)" />}
                </button>
                {showSales && (
                  <div style={{ padding: "0 16px 14px" }}>
                    {latest?.sales_strategy ? (
                      <p style={{ fontSize: 13, color: "var(--pandora-violet-900)", lineHeight: 1.6, margin: 0 }}>{latest.sales_strategy}</p>
                    ) : (
                      <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: 0 }}>Use Atualizar contato para gerar uma análise e ver este campo.</p>
                    )}
                    {latest?.created_at && (
                      <p style={{ fontSize: 11, color: "var(--pandora-ink-400)", marginTop: 8, fontFamily: "var(--font-mono)" }}>
                        {new Date(latest.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={14} color="var(--pandora-violet-500)" />
                <span className="pda-eyebrow" style={{ flex: 1 }}>Oportunidades</span>
                {contactOpps.length > 0 && (
                  <Link
                    href={`/oportunidades?contact_id=${id}`}
                    style={{ fontSize: 11, color: "var(--pandora-violet-600)", textDecoration: "none" }}
                  >
                    Ver todas
                  </Link>
                )}
              </div>
              {contactOpps.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: 0 }}>
                  Nenhuma oportunidade vinculada.
                </p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {contactOpps.slice(0, 5).map((o) => (
                    <li key={o.id}>
                      <Link
                        href={`/oportunidades?contact_id=${id}`}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 4,
                          textDecoration: "none",
                          padding: "8px 10px",
                          borderRadius: "var(--radius-sm)",
                          border: "1px solid var(--pandora-ink-100)",
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--pandora-violet-900)" }}>{o.title}</span>
                        <span style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                          <span
                            className="pda-badge"
                            style={{
                              background: `${STATUS_COLOR[o.status]}18`,
                              color: STATUS_COLOR[o.status],
                              fontSize: 9,
                            }}
                          >
                            {STATUS_LABEL[o.status]}
                          </span>
                          <span style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)" }}>
                            {timeAgo(o.detected_at)}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Tarefas vinculadas */}
            <div className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CheckSquare size={14} color="var(--pandora-violet-500)" />
                <span className="pda-eyebrow" style={{ flex: 1 }}>Tarefas</span>
                {contactTasks.length > 0 && (
                  <span style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--pandora-ink-400)" }}>
                    {contactTasks.length}
                  </span>
                )}
              </div>
              {contactTasks.length === 0 ? (
                <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: 0 }}>Nenhuma tarefa aberta.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {contactTasks.map((task, i) => {
                    const dotColor = task.priority === "critical" ? "#dc2626" : task.priority === "high" ? "#d97706" : task.priority === "medium" ? "#7A1CB5" : "#9ca3af";
                    return (
                      <div key={task.id} style={{
                        display: "flex", alignItems: "flex-start", gap: 8,
                        padding: "7px 0",
                        borderBottom: i < contactTasks.length - 1 ? "1px solid var(--pandora-ink-100)" : "none",
                      }}>
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, marginTop: 5, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--pandora-ink-700)", lineHeight: 1.4, flex: 1 }}>{task.title}</span>
                        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                          <button onClick={() => updateTaskStatus(task.id, "done")} title="Concluir" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--color-success)", lineHeight: 1 }}>
                            <Check size={12} />
                          </button>
                          <button onClick={() => updateTaskStatus(task.id, "dismissed")} title="Dispensar" style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--pandora-ink-400)", lineHeight: 1 }}>
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── COLUNA DIREITA ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "stretch", gap: 10 }}>
                <button
                  type="button"
                  onClick={() => setUpdateForm(true)}
                  disabled={refreshingContact || updateForm}
                  className="pda-btn pda-btn-ghost"
                  style={{ flex: 1, justifyContent: "center", gap: 6 }}
                >
                  <MessageSquarePlus size={14} /> Nova atualização
                </button>
                <button
                  type="button"
                  onClick={() => atualizarContato()}
                  disabled={refreshingContact || !contact}
                  title="Importa reuniões do calendário, atualiza Gmail e WhatsApp e gera um novo resumo"
                  className="pda-btn pda-btn-ghost"
                  style={{ flex: 1, justifyContent: "center", gap: 6 }}
                >
                  <RefreshCw size={14} style={refreshingContact ? { animation: "spin 1s linear infinite" } : undefined} />
                  {refreshingContact ? "Atualizando…" : "Atualizar contato"}
                </button>
                {contact?.phone && (
                  <button
                    type="button"
                    onClick={() => openPanel({
                      contactId: id,
                      contactPhone: contact.phone!,
                      contactName: contact.name,
                    })}
                    title="Abrir conversa WhatsApp"
                    className="pda-btn pda-btn-ghost"
                    style={{ justifyContent: "center", gap: 6, color: "var(--pandora-green-400)", borderColor: "rgba(45,212,160,0.3)", flexShrink: 0 }}
                  >
                    <MessageCircle size={14} />
                  </button>
                )}
              </div>

              {updateForm && (
                <div className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <MessageSquarePlus size={13} color="var(--pandora-violet-500)" />
                    <span className="pda-eyebrow">Nova atualização</span>
                    <button type="button" onClick={() => setUpdateForm(false)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", display: "flex" }}>
                      <X size={14} />
                    </button>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={update.type} onChange={(e) => setUpdate((u) => ({ ...u, type: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
                      {UPDATE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>
                  <input
                    type="datetime-local"
                    value={update.occurred_at}
                    onChange={(e) => setUpdate((u) => ({ ...u, occurred_at: e.target.value }))}
                    style={inputStyle}
                  />
                  <input
                    value={update.subject}
                    onChange={(e) => setUpdate((u) => ({ ...u, subject: e.target.value }))}
                    placeholder="Título… ex: Ligação sobre proposta"
                    style={inputStyle}
                    autoFocus
                  />
                  <textarea
                    value={update.content}
                    onChange={(e) => setUpdate((u) => ({ ...u, content: e.target.value }))}
                    placeholder="Detalhes (opcional)…"
                    style={{ ...inputStyle, height: 68, resize: "vertical" }}
                  />
                  <button type="button" onClick={addUpdate} disabled={updateSaving || !update.subject.trim()} className="pda-btn" style={{ width: "100%", justifyContent: "center" }}>
                    {updateSaving ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              )}
            </div>

            {/* O que está rolando */}
            {latest?.status && (
              <div className="pda-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <Clock size={14} color="var(--pandora-violet-500)" />
                  <span className="pda-eyebrow">O que está rolando</span>
                </div>
                <p style={{ fontSize: 14, color: "var(--pandora-violet-900)", lineHeight: 1.6, margin: 0 }}>{latest.status}</p>
              </div>
            )}

            {/* Próximos passos */}
            {latest?.next_steps && latest.next_steps.length > 0 && (
              <div className="pda-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <CheckCircle2 size={14} color="var(--pandora-green-400, #2DD4A0)" />
                  <span className="pda-eyebrow">Próximos passos</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {latest.next_steps.map((step, i) => (
                    <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                      <span style={{
                        width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
                        background: "var(--pandora-violet-50)", color: "var(--pandora-violet-600)",
                        fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 600,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}>{i + 1}</span>
                      <span style={{ fontSize: 13, color: "var(--pandora-ink-700)", lineHeight: 1.5 }}>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quem é */}
            <div className="pda-card">
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Sparkles size={14} color="var(--pandora-violet-500)" />
                <span className="pda-eyebrow">Quem é</span>
              </div>
              {noNewData && (
                <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: "0 0 10px", padding: "6px 10px", background: "var(--pandora-ink-50)", borderRadius: 6 }}>
                  Nenhuma mensagem nova desde a última análise.
                </p>
              )}
              {latest?.who ? (
                <>
                  <p style={{ fontSize: 14, color: "var(--pandora-violet-900)", lineHeight: 1.6, margin: 0 }}>{latest.who}</p>
                  {latest.topics && latest.topics.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 10 }}>
                      {latest.topics.map((t) => <span key={t} className="pda-badge pda-badge-violet">{t}</span>)}
                    </div>
                  )}
                  <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)" }}>
                    Snapshot: {new Date(latest.created_at).toLocaleString("pt-BR")}
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", margin: 0 }}>Clique em <strong>Atualizar contato</strong> para gerar um resumo com base nas conversas.</p>
              )}
            </div>

            {/* Timeline de relacionamento */}
            {timeline.length > 0 && (
              <div className="pda-card">
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                  <History size={14} color="var(--pandora-violet-500)" />
                  <span className="pda-eyebrow">Timeline de relacionamento</span>
                  <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--pandora-ink-400)" }}>
                    {timeline.length} eventos
                  </span>
                </div>

                <div style={{ position: "relative" }}>
                  <div style={{ position: "absolute", left: 7, top: 8, bottom: 8, width: 2, background: "var(--pandora-ink-100)" }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {timeline.map((entry, i) =>
                      entry.kind === "snapshot"
                        ? <SnapshotEntry key={entry.snap.id} snap={entry.snap} isLatest={i === 0 && entry.kind === "snapshot"} />
                        : <InteractionEntry key={entry.item.id} item={entry.item} />
                    )}
                  </div>
                </div>
              </div>
            )}

            {timeline.length === 0 && !refreshingContact && (
              <div className="pda-empty">
                <History />
                <div className="pda-empty-title">Nenhum histórico ainda</div>
                <div className="pda-empty-desc">Clique em <strong>Atualizar contato</strong> para registrar o primeiro ponto na timeline.</div>
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

// ──────────── Componentes ────────────

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: "var(--pandora-ink-600)" }}>
      <span style={{ color: "var(--pandora-ink-400)", display: "flex" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </div>
  );
}

function SnapshotEntry({ snap, isLatest }: { snap: AnalysisSnapshot; isLatest: boolean }) {
  const [open, setOpen] = useState(false);
  const date = new Date(snap.created_at);

  return (
    <div style={{ display: "flex", gap: 16, paddingBottom: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", marginTop: 2, zIndex: 1, position: "relative",
          background: isLatest ? "var(--pandora-violet-600)" : "var(--pandora-ink-300)",
          border: `2px solid ${isLatest ? "var(--pandora-violet-200)" : "var(--pandora-ink-100)"}`,
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
          <Sparkles size={11} color="var(--pandora-violet-500)" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pandora-ink-400)" }}>
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })} · {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isLatest && <span className="pda-badge pda-badge-violet">atual</span>}
          {snap.message_count > 0 && (
            <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{snap.message_count} msgs analisadas</span>
          )}
          <button onClick={() => setOpen((v) => !v)} style={{ marginLeft: "auto", fontSize: 11, color: "var(--pandora-violet-600)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {open ? "fechar" : "expandir"}
          </button>
        </div>

        {snap.status && (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-600)", margin: 0, lineHeight: 1.5 }}>
            {open ? snap.status : (snap.status.slice(0, 140) + (snap.status.length > 140 ? "…" : ""))}
          </p>
        )}

        {open && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {snap.next_steps && snap.next_steps.length > 0 && (
              <div>
                <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Próximos passos (na época)</div>
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                  {snap.next_steps.map((s, i) => <li key={i} style={{ fontSize: 12, color: "var(--pandora-ink-700)" }}>{s}</li>)}
                </ul>
              </div>
            )}
            {snap.topics && snap.topics.length > 0 && (
              <div>
                <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Temas</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {snap.topics.map((t) => <span key={t} className="pda-badge pda-badge-violet">{t}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InteractionEntry({ item }: { item: Interaction }) {
  const channelColors: Record<string, string> = {
    whatsapp: "#25D366", email: "#EA4335", fathom: "#7C3AED", calcom: "#0070F3", manual: "#857891",
  };
  const date = new Date(item.occurred_at);
  const isMeeting = item.type === "meeting";
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const meetUrl     = meta.meet_url as string | null;
  const fathomUrl   = meta.fathom_url as string | null;
  const fathomSum   = meta.fathom_summary as string | null;
  const durationMin = meta.duration_min as number | null;
  const isPast      = date < new Date();

  return (
    <div style={{ display: "flex", gap: 16, paddingBottom: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{
          width: 16, height: 16, borderRadius: isMeeting ? 4 : "50%", marginTop: 2, zIndex: 1, position: "relative",
          background: channelColors[item.channel] ?? "#aaa",
          border: "2px solid var(--pandora-ink-100)",
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pandora-ink-400)" }}>
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
            {` · ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </span>
          {isMeeting
            ? <span style={{ fontSize: 11, color: "#0070F3", display: "flex", alignItems: "center", gap: 3 }}><CalendarDays size={11} /> reunião</span>
            : <span className="pda-badge pda-badge-violet" style={{ textTransform: "lowercase" }}>{item.channel} · {item.type}</span>
          }
          {durationMin && <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{durationMin}min</span>}
          {isMeeting && !isPast && <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>próxima</span>}
          {/* Links de ação */}
          {meetUrl && (
            <a href={meetUrl} target="_blank" style={{ marginLeft: "auto", fontSize: 11, color: "#0070F3", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
              <Video size={11} /> Meet
            </a>
          )}
          {fathomUrl && (
            <a href={fathomUrl} target="_blank" style={{ fontSize: 11, color: "#7C3AED", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
              <FileText size={11} /> Transcrição
            </a>
          )}
          {isMeeting && isPast && !fathomUrl && (
            <span style={{ fontSize: 10, color: "var(--pandora-ink-300)", display: "flex", alignItems: "center", gap: 3 }} title="Transcrição Fathom ainda não integrada">
              <FileText size={10} /> aguardando Fathom
            </span>
          )}
        </div>

        {item.subject && (
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pandora-violet-800)", marginBottom: 2 }}>
            {item.external_url
              ? <a href={item.external_url} target="_blank" style={{ color: "inherit", textDecoration: "none" }}>{item.subject}</a>
              : item.subject}
          </div>
        )}

        {fathomSum ? (
          <p style={{ fontSize: 10, color: "var(--pandora-ink-600)", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>
            {fathomSum}
          </p>
        ) : (item.summary || item.content) ? (
          <p style={{ fontSize: 10, color: "var(--pandora-ink-600)", margin: 0, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {item.summary || item.content}
          </p>
        ) : null}
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--pandora-violet-600)", textDecoration: "none",
  display: "inline-flex", alignItems: "center", gap: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "5px 8px",
  border: "1px solid var(--pandora-ink-200)",
  borderRadius: 6, fontSize: 13,
  fontFamily: "var(--font-text)",
  background: "var(--pandora-ink-0)", color: "var(--pandora-ink-800)",
  outline: "none", boxSizing: "border-box",
};
