"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Building2, FileText, Users, Receipt, TrendingDown,
  Plus, Trash2, ExternalLink, Check, X, Pencil, ChevronDown,
  Loader2, Video, Mail, Phone, Link, Copy,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Contract, Company, Contact, ContractContact, Invoice, InvoiceStatus, ContractCost, CostRecurrence } from "@/lib/types";
import { formatBRL } from "@/lib/docs";
import { supabaseBrowser } from "@/lib/supabase-browser";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMonth(d: string) {
  const [year, month] = d.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

const INVOICE_STATUS_META: Record<InvoiceStatus, { label: string; color: string; bg: string }> = {
  pendente:  { label: "Pendente",  color: "#f59e0b",                    bg: "rgba(245,158,11,0.12)" },
  emitida:   { label: "Emitida",   color: "var(--pandora-violet-600)",   bg: "rgba(122,28,181,0.1)" },
  paga:      { label: "Paga",      color: "var(--pandora-green-400)",    bg: "rgba(45,212,160,0.1)" },
  cancelada: { label: "Cancelada", color: "var(--pandora-ink-400)",      bg: "var(--pandora-ink-100)" },
};

const INVOICE_STATUSES: InvoiceStatus[] = ["pendente", "emitida", "paga", "cancelada"];

type Tab = "cliente" | "escopo" | "pessoas" | "faturamento" | "custos";

interface Meeting {
  id: string;
  subject?: string;
  content?: string;
  occurred_at: string;
  external_url?: string;
  channel?: string;
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FinanceiroDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("cliente");

  const [contract, setContract] = useState<Contract | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/contracts/${id}`);
    if (!res.ok) { setLoading(false); return; }
    const c: Contract & { company?: Company } = await res.json();
    setContract(c);

    if (c.company_id) {
      const supabase = supabaseBrowser();
      const { data } = await supabase.from("companies").select("*").eq("id", c.company_id).single();
      if (data) setCompany(data as Company);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div className="pda-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <Loader2 size={24} style={{ animation: "spin 1s linear infinite", color: "var(--pandora-violet-600)" }} />
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="pda-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
        <div className="pda-empty"><p>Contrato não encontrado.</p></div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "cliente",     label: "Cliente",     icon: <Building2 size={14} /> },
    { id: "escopo",      label: "Escopo",      icon: <FileText size={14} /> },
    { id: "pessoas",     label: "Pessoas",     icon: <Users size={14} /> },
    { id: "faturamento", label: "Faturamento", icon: <Receipt size={14} /> },
    { id: "custos",      label: "Custos",      icon: <TrendingDown size={14} /> },
  ];

  return (
    <div className="pda-main" style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div className="pda-topbar" style={{ flexDirection: "column", alignItems: "flex-start", gap: 10, paddingBottom: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: "100%" }}>
          <button onClick={() => router.push("/financeiro")} className="pda-btn-ghost" style={{ padding: "4px 8px" }}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-900)" }}>
              {company?.name ?? contract.title}
            </div>
            <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>
              {contract.title}
              {contract.billing_type && (
                <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", padding: "1px 8px", borderRadius: 20, background: "rgba(122,28,181,0.1)", color: "var(--pandora-violet-600)" }}>
                  {contract.billing_type === "mensal" ? "Mensal" : "Fechado"}
                </span>
              )}
              {contract.value != null && (
                <span style={{ marginLeft: 8, fontWeight: 700, color: "var(--pandora-green-400)" }}>{formatBRL(contract.value)}</span>
              )}
            </div>
          </div>
          <a href={`/contratos/${contract.id}`} className="pda-btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <ExternalLink size={13} /> Ver contrato
          </a>
        </div>

        {/* Tab bar */}
        <div style={{ display: "flex", gap: 2, borderBottom: "1px solid var(--pandora-ink-100)", width: "100%", paddingTop: 4 }}>
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "8px 14px",
                background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600,
                color: tab === t.id ? "var(--pandora-violet-600)" : "var(--pandora-ink-400)",
                borderBottom: tab === t.id ? "2px solid var(--pandora-violet-600)" : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "cliente" && <TabCliente company={company} setCompany={setCompany} contract={contract} />}
        {tab === "escopo" && <TabEscopo contract={contract} setContract={setContract} />}
        {tab === "pessoas" && <TabPessoas contractId={id} companyId={contract.company_id} />}
        {tab === "faturamento" && <TabFaturamento contractId={id} companyId={contract.company_id} clientId={contract.client_id} defaultAmount={contract.value} />}
        {tab === "custos" && <TabCustos contractId={id} contractValue={contract.value} />}
      </div>
    </div>
  );
}

// ── Tab: Cliente ──────────────────────────────────────────────────────────────

function TabCliente({ company, setCompany, contract }: {
  company: Company | null;
  setCompany: (c: Company) => void;
  contract: Contract;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Company>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cadastroLink, setCadastroLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (company) setDraft({ ...company });
  }, [company]);

  useEffect(() => {
    if (!contract.company_id) return;
    const supabase = supabaseBrowser();
    supabase.from("contacts").select("id,name,email,role").eq("company_id", contract.company_id).order("name")
      .then(({ data }) => { if (data) setContacts(data as Contact[]); });
  }, [contract.company_id]);

  async function generateLink() {
    if (!company?.id) return;
    setGeneratingLink(true);
    const res = await fetch(`/api/companies/${company.id}/cadastro-link`, { method: "POST" });
    if (res.ok) {
      const { url } = await res.json();
      setCadastroLink(url);
    }
    setGeneratingLink(false);
  }

  async function copyLink() {
    if (!cadastroLink) return;
    await navigator.clipboard.writeText(cadastroLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function save() {
    if (!company?.id) return;
    setSaving(true);
    const supabase = supabaseBrowser();
    const { data, error } = await supabase.from("companies").update(draft).eq("id", company.id).select("*").single();
    setSaving(false);
    if (!error && data) { setCompany(data as Company); setEditing(false); }
  }

  const fields: { label: string; key: keyof Company; placeholder?: string }[] = [
    { label: "Razão Social", key: "name" },
    { label: "CNPJ", key: "cnpj", placeholder: "00.000.000/0001-00" },
    { label: "Website", key: "website", placeholder: "https://..." },
    { label: "Setor", key: "industry" },
    { label: "CEP", key: "address_zip", placeholder: "00000-000" },
    { label: "Rua", key: "address_street" },
    { label: "Número", key: "address_number" },
    { label: "Complemento", key: "address_complement" },
    { label: "Cidade", key: "address_city" },
    { label: "Estado", key: "address_state", placeholder: "SP" },
  ];

  if (!company) {
    return (
      <div className="pda-content">
        <p className="pda-empty">Nenhuma empresa vinculada a este contrato.</p>
      </div>
    );
  }

  return (
    <div className="pda-content">
      <div className="pda-card" style={{ padding: 24, maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <span className="pda-eyebrow">Dados da Empresa</span>
          {editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setDraft({ ...company }); setEditing(false); }} className="pda-btn-ghost" style={{ fontSize: 12 }}>
                <X size={13} /> Cancelar
              </button>
              <button onClick={save} className="pda-btn" style={{ fontSize: 12 }} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />} Salvar
              </button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="pda-btn-ghost" style={{ fontSize: 12 }}>
              <Pencil size={13} /> Editar
            </button>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {fields.map(({ label, key, placeholder }) => (
            <div key={key} style={{ gridColumn: key === "name" || key === "address_street" || key === "website" ? "1 / -1" : undefined }}>
              <label style={{ display: "block", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                {label}
              </label>
              {editing ? (
                <input
                  value={(draft[key] as string) ?? ""}
                  placeholder={placeholder}
                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13, boxSizing: "border-box" }}
                />
              ) : (
                <div style={{ fontSize: 13, color: company[key] ? "var(--pandora-ink-800)" : "var(--pandora-ink-300)", fontFamily: key === "cnpj" ? "var(--font-mono)" : undefined }}>
                  {(company[key] as string) || "—"}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Responsável */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--pandora-ink-100)" }}>
          <label style={{ display: "block", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
            Responsável
          </label>
          {editing ? (
            <select
              value={draft.responsible_contact_id ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, responsible_contact_id: e.target.value || undefined }))}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }}
            >
              <option value="">— Selecionar contato —</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.role ? ` (${c.role})` : ""}</option>
              ))}
            </select>
          ) : (
            <div style={{ fontSize: 13, color: "var(--pandora-ink-800)" }}>
              {contacts.find((c) => c.id === company.responsible_contact_id)?.name ?? <span style={{ color: "var(--pandora-ink-300)" }}>—</span>}
            </div>
          )}
        </div>

        {/* Link de cadastro */}
        <div style={{ marginTop: 20, paddingTop: 20, borderTop: "1px solid var(--pandora-ink-100)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <label style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Link de cadastro
            </label>
            {!cadastroLink && (
              <button onClick={generateLink} disabled={generatingLink} className="pda-btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                {generatingLink ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Link size={13} />}
                Gerar link
              </button>
            )}
          </div>
          {cadastroLink ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--pandora-ink-50)", border: "1px solid var(--pandora-ink-200)", borderRadius: 8, padding: "8px 12px" }}>
              <span style={{ flex: 1, fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--pandora-ink-600)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {cadastroLink}
              </span>
              <button onClick={copyLink} className="pda-btn-ghost" style={{ padding: "4px 8px", fontSize: 12, display: "flex", alignItems: "center", gap: 4, flexShrink: 0, color: copied ? "var(--pandora-green-400)" : undefined }}>
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copiado!" : "Copiar"}
              </button>
              <a href={cadastroLink} target="_blank" rel="noopener noreferrer" className="pda-btn-ghost" style={{ padding: "4px 8px", flexShrink: 0 }}>
                <ExternalLink size={13} />
              </a>
            </div>
          ) : (
            <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: 0 }}>
              Gere um link único para enviar ao cliente preencher CNPJ e endereço.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Escopo ───────────────────────────────────────────────────────────────

function TabEscopo({ contract, setContract }: { contract: Contract; setContract: (c: Contract) => void }) {
  const [editingBilling, setEditingBilling] = useState(false);
  const [billingDraft, setBillingDraft] = useState({ billing_type: contract.billing_type ?? "", billing_day: contract.billing_day ?? "" });
  const [saving, setSaving] = useState(false);

  async function saveBilling() {
    setSaving(true);
    const res = await fetch(`/api/contracts/${contract.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        billing_type: billingDraft.billing_type || null,
        billing_day: billingDraft.billing_day ? Number(billingDraft.billing_day) : null,
      }),
    });
    if (res.ok) { const data = await res.json(); setContract(data); setEditingBilling(false); }
    setSaving(false);
  }

  return (
    <div className="pda-content">
      {/* Billing meta */}
      <div className="pda-card" style={{ padding: 20, marginBottom: 16, maxWidth: 640 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span className="pda-eyebrow">Condições de Faturamento</span>
          {editingBilling ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setEditingBilling(false)} className="pda-btn-ghost" style={{ fontSize: 12 }}><X size={13} /></button>
              <button onClick={saveBilling} className="pda-btn" style={{ fontSize: 12 }} disabled={saving}>
                {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Check size={13} />} Salvar
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingBilling(true)} className="pda-btn-ghost" style={{ fontSize: 12 }}><Pencil size={13} /> Editar</button>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
          <div>
            <div className="pda-eyebrow" style={{ marginBottom: 4 }}>Tipo</div>
            {editingBilling ? (
              <select value={billingDraft.billing_type} onChange={(e) => setBillingDraft((d) => ({ ...d, billing_type: e.target.value }))}
                style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }}>
                <option value="">—</option>
                <option value="mensal">Mensal</option>
                <option value="fechado">Fechado</option>
              </select>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pandora-ink-800)" }}>{contract.billing_type === "mensal" ? "Mensal" : contract.billing_type === "fechado" ? "Fechado" : "—"}</span>
            )}
          </div>
          <div>
            <div className="pda-eyebrow" style={{ marginBottom: 4 }}>Valor</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pandora-green-400)" }}>{formatBRL(contract.value)}</span>
          </div>
          <div>
            <div className="pda-eyebrow" style={{ marginBottom: 4 }}>Início</div>
            <span style={{ fontSize: 13, color: "var(--pandora-ink-700)" }}>{fmtDate(contract.starts_at)}</span>
          </div>
          <div>
            <div className="pda-eyebrow" style={{ marginBottom: 4 }}>Término</div>
            <span style={{ fontSize: 13, color: "var(--pandora-ink-700)" }}>{fmtDate(contract.ends_at)}</span>
          </div>
        </div>
        {contract.billing_type === "mensal" && (
          <div style={{ marginTop: 12 }}>
            <div className="pda-eyebrow" style={{ marginBottom: 4 }}>Dia de faturamento</div>
            {editingBilling ? (
              <input type="number" min={1} max={28} value={billingDraft.billing_day} placeholder="Ex: 5"
                onChange={(e) => setBillingDraft((d) => ({ ...d, billing_day: e.target.value }))}
                style={{ width: 80, padding: "6px 8px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }} />
            ) : (
              <span style={{ fontSize: 13, color: "var(--pandora-ink-700)" }}>{contract.billing_day ? `Dia ${contract.billing_day}` : "—"}</span>
            )}
          </div>
        )}
      </div>

      {/* Scope markdown */}
      {contract.content_md ? (
        <div className="pda-card" style={{ padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span className="pda-eyebrow">Escopo do Contrato</span>
            <a href={`/contratos/${contract.id}`} className="pda-btn-ghost" style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <ExternalLink size={12} /> Editar no contrato
            </a>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--pandora-ink-800)" }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{contract.content_md}</ReactMarkdown>
          </div>
        </div>
      ) : (
        <div className="pda-empty">
          <p>Contrato sem conteúdo de escopo.</p>
          <a href={`/contratos/${contract.id}`} className="pda-btn" style={{ marginTop: 8 }}>Editar contrato</a>
        </div>
      )}
    </div>
  );
}

// ── Tab: Pessoas ──────────────────────────────────────────────────────────────

function TabPessoas({ contractId, companyId }: { contractId: string; companyId?: string }) {
  const [members, setMembers] = useState<ContractContact[]>([]);
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [meetings, setMeetings] = useState<Record<string, Meeting[]>>({});
  const [expandedContact, setExpandedContact] = useState<string | null>(null);
  const [expandedMeeting, setExpandedMeeting] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState("");
  const [role, setRole] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = supabaseBrowser();
    const [membersRes, contactsRes] = await Promise.all([
      fetch(`/api/contract-contacts?contract_id=${contractId}`),
      companyId
        ? supabase.from("contacts").select("id,name,email,phone,role").eq("company_id", companyId).order("name")
        : Promise.resolve({ data: [] }),
    ]);
    if (membersRes.ok) setMembers(await membersRes.json());
    if ("data" in contactsRes && contactsRes.data) setAllContacts(contactsRes.data as Contact[]);
    setLoading(false);
  }, [contractId, companyId]);

  useEffect(() => { load(); }, [load]);

  async function loadMeetings(contactId: string) {
    if (meetings[contactId]) return;
    const supabase = supabaseBrowser();
    const { data } = await supabase
      .from("interactions")
      .select("id,subject,content,occurred_at,external_url,channel,type")
      .eq("contact_id", contactId)
      .eq("channel", "fathom")
      .order("occurred_at", { ascending: false })
      .limit(5);
    setMeetings((m) => ({ ...m, [contactId]: (data ?? []) as Meeting[] }));
  }

  function toggleContact(contactId: string) {
    const next = expandedContact === contactId ? null : contactId;
    setExpandedContact(next);
    if (next) loadMeetings(next);
  }

  async function addMember() {
    if (!selectedContactId) return;
    const res = await fetch("/api/contract-contacts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contract_id: contractId, contact_id: selectedContactId, role: role || null }),
    });
    if (res.ok) { setAdding(false); setSelectedContactId(""); setRole(""); load(); }
  }

  async function removeMember(memberId: string) {
    await fetch(`/api/contract-contacts/${memberId}`, { method: "DELETE" });
    setMembers((m) => m.filter((x) => x.id !== memberId));
  }

  const memberContactIds = new Set(members.map((m) => m.contact_id));
  const availableContacts = allContacts.filter((c) => !memberContactIds.has(c.id));

  if (loading) return <div className="pda-content"><p className="pda-empty">Carregando...</p></div>;

  return (
    <div className="pda-content">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span className="pda-eyebrow">{members.length} pessoa{members.length !== 1 ? "s" : ""} neste contrato</span>
        <button onClick={() => setAdding(true)} className="pda-btn" style={{ fontSize: 12 }}>
          <Plus size={13} /> Adicionar pessoa
        </button>
      </div>

      {/* Add form */}
      {adding && (
        <div className="pda-card" style={{ padding: 16, marginBottom: 16, display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 200 }}>
            <label className="pda-eyebrow" style={{ display: "block", marginBottom: 4 }}>Contato</label>
            <select value={selectedContactId} onChange={(e) => setSelectedContactId(e.target.value)}
              style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13 }}>
              <option value="">— Selecionar —</option>
              {availableContacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ""}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="pda-eyebrow" style={{ display: "block", marginBottom: 4 }}>Papel</label>
            <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex: decisor, técnico"
              style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13, boxSizing: "border-box" }} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setAdding(false); setSelectedContactId(""); setRole(""); }} className="pda-btn-ghost" style={{ fontSize: 12 }}><X size={13} /></button>
            <button onClick={addMember} className="pda-btn" style={{ fontSize: 12 }} disabled={!selectedContactId}><Check size={13} /> Adicionar</button>
          </div>
        </div>
      )}

      {members.length === 0 ? (
        <div className="pda-empty"><p>Nenhuma pessoa vinculada ainda.</p></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {members.map((m) => {
            const c = m.contact;
            const isExpanded = expandedContact === m.contact_id;
            const contactMeetings = meetings[m.contact_id] ?? [];
            return (
              <div key={m.id} className="pda-card" style={{ overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
                  onClick={() => toggleContact(m.contact_id)}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--pandora-violet-600)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 14, fontFamily: "var(--font-chakra)", flexShrink: 0 }}>
                    {c?.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "var(--pandora-ink-900)" }}>{c?.name ?? "Contato removido"}</div>
                    <div style={{ display: "flex", gap: 12, fontSize: 12, color: "var(--pandora-ink-500)", marginTop: 2, flexWrap: "wrap" }}>
                      {c?.email && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Mail size={11} />{c.email}</span>}
                      {c?.phone && <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Phone size={11} />{c.phone}</span>}
                      {m.role && <span style={{ color: "var(--pandora-violet-600)", fontWeight: 600 }}>{m.role}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <a href={`/clientes/${m.contact_id}`} onClick={(e) => e.stopPropagation()} className="pda-btn-ghost" style={{ padding: "3px 8px", fontSize: 11 }}>
                      <ExternalLink size={11} />
                    </a>
                    <button onClick={(e) => { e.stopPropagation(); removeMember(m.id); }} className="pda-btn-ghost" style={{ padding: "3px 8px", color: "#ef4444" }}>
                      <Trash2 size={11} />
                    </button>
                    <ChevronDown size={14} style={{ color: "var(--pandora-ink-300)", transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ borderTop: "1px solid var(--pandora-ink-100)", padding: "12px 16px" }}>
                    <div className="pda-eyebrow" style={{ marginBottom: 10 }}>Reuniões recentes (Fathom)</div>
                    {contactMeetings.length === 0 ? (
                      <p style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>Nenhuma reunião encontrada.</p>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {contactMeetings.map((meet) => (
                          <div key={meet.id} style={{ background: "var(--pandora-ink-50)", borderRadius: 8, padding: "10px 12px", border: "1px solid var(--pandora-ink-100)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <Video size={12} style={{ color: "var(--pandora-violet-600)", flexShrink: 0 }} />
                              <span style={{ flex: 1, fontWeight: 600, fontSize: 13, color: "var(--pandora-ink-800)" }}>{meet.subject ?? "Reunião"}</span>
                              <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{fmtDate(meet.occurred_at)}</span>
                              {meet.external_url && (
                                <a href={meet.external_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="pda-btn-ghost" style={{ padding: "2px 6px", fontSize: 11 }}>
                                  <ExternalLink size={11} />
                                </a>
                              )}
                              <button onClick={() => setExpandedMeeting(expandedMeeting === meet.id ? null : meet.id)} className="pda-btn-ghost" style={{ padding: "2px 6px" }}>
                                <ChevronDown size={12} style={{ transform: expandedMeeting === meet.id ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
                              </button>
                            </div>
                            {expandedMeeting === meet.id && meet.content && (
                              <div style={{ fontSize: 12, color: "var(--pandora-ink-600)", marginTop: 8, lineHeight: 1.6, whiteSpace: "pre-wrap", maxHeight: 300, overflow: "auto" }}>
                                {meet.content}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Tab: Custos ───────────────────────────────────────────────────────────────

const COST_CATEGORY_OPTIONS = ["infra", "licença", "domínio", "api", "serviço", "outro"];
const RECURRENCE_LABELS: Record<CostRecurrence, string> = { mensal: "Mensal", anual: "Anual", pontual: "Pontual" };

function toMonthly(amount: number, recurrence: CostRecurrence) {
  if (recurrence === "anual") return amount / 12;
  if (recurrence === "pontual") return 0;
  return amount;
}

function TabCustos({ contractId, contractValue }: { contractId: string; contractValue?: number | null }) {
  const [costs, setCosts] = useState<ContractCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "", amount: "", recurrence: "mensal" as CostRecurrence, notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/contract-costs?contract_id=${contractId}`);
    if (res.ok) setCosts(await res.json());
    setLoading(false);
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  function openNew() {
    setEditingId(null);
    setForm({ name: "", category: "", amount: "", recurrence: "mensal", notes: "" });
    setShowForm(true);
  }

  function openEdit(c: ContractCost) {
    setEditingId(c.id);
    setForm({ name: c.name, category: c.category ?? "", amount: String(c.amount), recurrence: c.recurrence, notes: c.notes ?? "" });
    setShowForm(true);
  }

  async function saveCost() {
    if (!form.name || !form.amount) return;
    setSaving(true);
    const payload = { contract_id: contractId, name: form.name, category: form.category || null, amount: parseFloat(form.amount), recurrence: form.recurrence, notes: form.notes || null };
    if (editingId) {
      await fetch(`/api/contract-costs/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/contract-costs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function deleteCost(id: string) {
    if (!confirm("Remover este custo?")) return;
    await fetch(`/api/contract-costs/${id}`, { method: "DELETE" });
    setCosts((c) => c.filter((x) => x.id !== id));
  }

  const totalMonthly = costs.filter((c) => c.active).reduce((s, c) => s + toMonthly(c.amount, c.recurrence), 0);
  const margin = contractValue != null ? contractValue - totalMonthly : null;

  return (
    <div className="pda-content">
      {/* Summary */}
      {(contractValue != null || totalMonthly > 0) && (
        <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
          {contractValue != null && (
            <div className="pda-card" style={{ padding: "12px 18px", flex: 1, minWidth: 140 }}>
              <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Receita mensal</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-chakra)", color: "var(--pandora-green-400)" }}>{formatBRL(contractValue)}</div>
            </div>
          )}
          <div className="pda-card" style={{ padding: "12px 18px", flex: 1, minWidth: 140 }}>
            <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Custos / mês</div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-chakra)", color: "#f59e0b" }}>{formatBRL(totalMonthly)}</div>
          </div>
          {margin != null && (
            <div className="pda-card" style={{ padding: "12px 18px", flex: 1, minWidth: 140 }}>
              <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Margem</div>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-chakra)", color: margin >= 0 ? "var(--pandora-green-400)" : "#ef4444" }}>{formatBRL(margin)}</div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <span className="pda-eyebrow">{costs.length} custo{costs.length !== 1 ? "s" : ""} neste contrato</span>
        <button type="button" className="pda-btn" onClick={openNew} style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
          <Plus size={13} /> Novo custo
        </button>
      </div>

      {showForm && (
        <div className="pda-card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Nome *</label>
              <input className="pda-input" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ex: Servidor Hetzner, Domínio" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Categoria</label>
              <select className="pda-input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                <option value="">—</option>
                {COST_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Valor (R$) *</label>
              <input className="pda-input" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0,00" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Recorrência</label>
              <select className="pda-input" value={form.recurrence} onChange={(e) => setForm(f => ({ ...f, recurrence: e.target.value as CostRecurrence }))}>
                <option value="mensal">Mensal</option>
                <option value="anual">Anual</option>
                <option value="pontual">Pontual</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Notas</label>
            <input className="pda-input" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observações" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="pda-btn" onClick={saveCost} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Check size={14} /> {saving ? "Salvando..." : "Salvar"}
            </button>
            <button type="button" className="pda-btn-ghost" onClick={() => setShowForm(false)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="pda-empty">Carregando...</p>
      ) : costs.length === 0 && !showForm ? (
        <div className="pda-empty"><p>Nenhum custo cadastrado para este contrato.</p></div>
      ) : costs.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--pandora-ink-100)" }}>
                {["Nome", "Categoria", "Valor", "Recorrência", "Mensal equiv.", "Notas", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontFamily: "var(--font-chakra)", fontSize: 11, fontWeight: 700, color: "var(--pandora-ink-400)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {costs.map((c) => (
                <tr key={c.id} style={{ borderBottom: "1px solid var(--pandora-ink-100)" }}>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--pandora-ink-900)" }}>{c.name}</td>
                  <td style={{ padding: "10px 12px" }}>
                    {c.category ? <span className="pda-chip" style={{ fontSize: 11 }}>{c.category}</span> : <span style={{ color: "var(--pandora-ink-300)" }}>—</span>}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--pandora-ink-900)" }}>{formatBRL(c.amount)}</td>
                  <td style={{ padding: "10px 12px", color: "var(--pandora-ink-500)", fontSize: 12 }}>{RECURRENCE_LABELS[c.recurrence]}</td>
                  <td style={{ padding: "10px 12px", color: "#f59e0b", fontWeight: 600, fontSize: 12 }}>
                    {c.recurrence === "pontual" ? <span style={{ color: "var(--pandora-ink-300)" }}>—</span> : formatBRL(toMonthly(c.amount, c.recurrence))}
                  </td>
                  <td style={{ padding: "10px 12px", color: "var(--pandora-ink-400)", fontSize: 12, maxWidth: 180 }}>
                    <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.notes ?? "—"}</span>
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button type="button" className="pda-btn-ghost" onClick={() => openEdit(c)} style={{ padding: "4px 8px" }}><Pencil size={13} /></button>
                      <button type="button" className="pda-btn-ghost" onClick={() => deleteCost(c.id)} style={{ padding: "4px 8px", color: "#ef4444" }}><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            {costs.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: "1.5px solid var(--pandora-ink-100)" }}>
                  <td colSpan={4} style={{ padding: "10px 12px", fontFamily: "var(--font-chakra)", fontSize: 11, fontWeight: 700, color: "var(--pandora-ink-400)", textTransform: "uppercase" }}>Total mensal</td>
                  <td style={{ padding: "10px 12px", fontWeight: 800, color: "#f59e0b", fontFamily: "var(--font-chakra)" }}>{formatBRL(totalMonthly)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ── Tab: Faturamento ──────────────────────────────────────────────────────────

function TabFaturamento({ contractId, companyId, clientId, defaultAmount }: {
  contractId: string;
  companyId?: string;
  clientId?: string;
  defaultAmount?: number | null;
}) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusMenu, setStatusMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [form, setForm] = useState({
    month: monthKey(new Date()),
    amount: String(defaultAmount ?? ""),
    due_date: "",
    number: "",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/invoices?contract_id=${contractId}`);
    if (res.ok) setInvoices(await res.json());
    setLoading(false);
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!statusMenu) return;
    function close(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setStatusMenu(null);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [statusMenu]);

  async function createInvoice() {
    const res = await fetch("/api/invoices", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contract_id: contractId,
        company_id: companyId ?? null,
        client_id: clientId ?? null,
        month: form.month,
        amount: Number(form.amount),
        due_date: form.due_date || null,
        number: form.number || null,
        notes: form.notes || null,
      }),
    });
    if (res.ok) {
      setShowForm(false);
      setForm({ month: monthKey(new Date()), amount: String(defaultAmount ?? ""), due_date: "", number: "", notes: "" });
      load();
    }
  }

  async function updateStatus(invoiceId: string, status: InvoiceStatus) {
    await fetch(`/api/invoices/${invoiceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setInvoices((prev) => prev.map((inv) => inv.id === invoiceId
      ? { ...inv, status, paid_at: status === "paga" ? new Date().toISOString() : inv.paid_at }
      : inv
    ));
    setStatusMenu(null);
  }

  async function deleteInvoice(invoiceId: string) {
    await fetch(`/api/invoices/${invoiceId}`, { method: "DELETE" });
    setInvoices((prev) => prev.filter((inv) => inv.id !== invoiceId));
  }

  const totalPago = invoices.filter((i) => i.status === "paga").reduce((s, i) => s + Number(i.amount), 0);
  const totalPendente = invoices.filter((i) => i.status === "pendente" || i.status === "emitida").reduce((s, i) => s + Number(i.amount), 0);

  return (
    <div className="pda-content">
      {/* Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div className="pda-card" style={{ padding: "12px 18px", flex: 1, minWidth: 160 }}>
          <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Total pago</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-chakra)", color: "var(--pandora-green-400)" }}>{formatBRL(totalPago)}</div>
        </div>
        <div className="pda-card" style={{ padding: "12px 18px", flex: 1, minWidth: 160 }}>
          <div className="pda-eyebrow" style={{ marginBottom: 6 }}>A receber</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-chakra)", color: totalPendente > 0 ? "#f59e0b" : "var(--pandora-ink-300)" }}>{formatBRL(totalPendente)}</div>
        </div>
        <div className="pda-card" style={{ padding: "12px 18px", flex: 1, minWidth: 160 }}>
          <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Total faturado</div>
          <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-800)" }}>{formatBRL(totalPago + totalPendente)}</div>
        </div>
      </div>

      {/* New invoice button */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span className="pda-eyebrow">{invoices.length} nota{invoices.length !== 1 ? "s" : ""} fiscal{invoices.length !== 1 ? "is" : ""}</span>
        <button onClick={() => setShowForm(true)} className="pda-btn" style={{ fontSize: 12 }}><Plus size={13} /> Nova NF</button>
      </div>

      {/* New invoice form */}
      {showForm && (
        <div className="pda-card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="pda-eyebrow" style={{ marginBottom: 14 }}>Nova Nota Fiscal</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <label className="pda-eyebrow" style={{ display: "block", marginBottom: 4 }}>Mês referência</label>
              <input type="month" value={form.month.slice(0, 7)}
                onChange={(e) => setForm((f) => ({ ...f, month: e.target.value + "-01" }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label className="pda-eyebrow" style={{ display: "block", marginBottom: 4 }}>Valor (R$)</label>
              <input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label className="pda-eyebrow" style={{ display: "block", marginBottom: 4 }}>Vencimento</label>
              <input type="date" value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div>
              <label className="pda-eyebrow" style={{ display: "block", marginBottom: 4 }}>Nº da NF</label>
              <input value={form.number} onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))} placeholder="Opcional"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
            <div style={{ gridColumn: "2 / -1" }}>
              <label className="pda-eyebrow" style={{ display: "block", marginBottom: 4 }}>Observações</label>
              <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Opcional"
                style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: "1px solid var(--pandora-ink-200)", background: "var(--pandora-ink-50)", fontSize: 13, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowForm(false)} className="pda-btn-ghost" style={{ fontSize: 12 }}><X size={13} /> Cancelar</button>
            <button onClick={createInvoice} className="pda-btn" style={{ fontSize: 12 }} disabled={!form.amount || !form.month}>
              <Check size={13} /> Criar NF
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="pda-empty">Carregando...</p>
      ) : invoices.length === 0 && !showForm ? (
        <div className="pda-empty"><p>Nenhuma nota fiscal registrada.</p></div>
      ) : invoices.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1.5px solid var(--pandora-ink-100)" }}>
                {["Mês", "NF", "Valor", "Vencimento", "Pago em", "Status", ""].map((h) => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const meta = INVOICE_STATUS_META[inv.status];
                return (
                  <tr key={inv.id} style={{ borderBottom: "1px solid var(--pandora-ink-100)" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--pandora-ink-800)", textTransform: "capitalize" }}>{fmtMonth(inv.month)}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--pandora-ink-600)" }}>{inv.number ?? "—"}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--pandora-ink-900)" }}>{formatBRL(inv.amount)}</td>
                    <td style={{ padding: "10px 12px", color: "var(--pandora-ink-600)", fontSize: 12 }}>{fmtDate(inv.due_date)}</td>
                    <td style={{ padding: "10px 12px", color: inv.paid_at ? "var(--pandora-green-400)" : "var(--pandora-ink-300)", fontSize: 12 }}>{fmtDate(inv.paid_at)}</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ position: "relative", display: "inline-block" }} ref={statusMenu === inv.id ? menuRef : null}>
                        <button onClick={() => setStatusMenu(statusMenu === inv.id ? null : inv.id)}
                          style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", padding: "3px 10px", borderRadius: 20, border: "none", cursor: "pointer", background: meta.bg, color: meta.color }}>
                          {meta.label}
                        </button>
                        {statusMenu === inv.id && (
                          <div style={{ position: "absolute", top: "110%", left: 0, zIndex: 50, background: "var(--pandora-ink-0)", border: "1px solid var(--pandora-ink-200)", borderRadius: 8, overflow: "hidden", minWidth: 130, boxShadow: "0 4px 16px rgba(0,0,0,0.15)" }}>
                            {INVOICE_STATUSES.map((s) => {
                              const sm = INVOICE_STATUS_META[s];
                              return (
                                <button key={s} onClick={() => updateStatus(inv.id, s)}
                                  style={{ display: "block", width: "100%", textAlign: "left", padding: "7px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: sm.color, fontWeight: inv.status === s ? 700 : 400 }}>
                                  {sm.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <button onClick={() => deleteInvoice(inv.id)} className="pda-btn-ghost" style={{ padding: "3px 8px", color: "#ef4444" }}>
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
