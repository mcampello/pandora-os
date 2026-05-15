"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Contact, Interaction } from "@/lib/types";
import {
  ArrowLeft, Mail, Phone, Linkedin, Globe, Building2, Briefcase,
  Sparkles, MessageSquare, TrendingUp, RefreshCw, ExternalLink
} from "lucide-react";

interface Intel {
  who: string;
  status: string;
  topics: string[];
  sales_strategy: string;
  updated_at: string;
}

export default function ContatoPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const supabase = supabaseBrowser();
  const [contact, setContact]   = useState<Contact | null>(null);
  const [interactions, setInts] = useState<Interaction[]>([]);
  const [waMessages, setWa]     = useState<Array<{ content: string; metadata: Record<string, unknown> }>>([]);
  const [intel, setIntel]       = useState<Intel | null>(null);
  const [loadingIntel, setLI]   = useState(false);

  async function load() {
    const { data: c } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
    setContact(c as Contact | null);
    if (!c) return;

    const { data: ix } = await supabase.from("interactions").select("*").eq("contact_id", id).order("occurred_at", { ascending: false }).limit(50);
    setInts((ix as Interaction[]) ?? []);

    // Busca mensagens do WhatsApp na base vetorial documents (N8N)
    if (c.phone) {
      const phoneDigits = c.phone.replace(/\D/g, "");
      const { data: docs } = await supabase
        .from("documents")
        .select("content, metadata")
        .filter("metadata->>chatid", "ilike", `%${phoneDigits}%`)
        .order("id", { ascending: false })
        .limit(30);
      setWa((docs as { content: string; metadata: Record<string, unknown> }[]) ?? []);
    }
  }

  async function generateIntel() {
    setLI(true);
    const res = await fetch(`/api/contacts/${id}/intel`, { method: "POST" });
    if (res.ok) setIntel(await res.json());
    setLI(false);
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

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <Link href="/clientes" className="pda-icon-btn"><ArrowLeft size={16} /></Link>
          <h1 className="pda-topbar-title">{contact.name}</h1>
          {contact.source && <span className="pda-chip">{contact.source}</span>}
        </div>
      </header>

      <div className="pda-content">
        {/* 1. QUEM É */}
        <section style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 20, marginBottom: 24 }}>
          {/* Card de info estruturada */}
          <div className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--pandora-violet-50)", color: "var(--pandora-violet-700)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 18,
              }}>{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 600, color: "var(--pandora-violet-900)" }}>
                  {contact.name}
                </div>
                {contact.role && (
                  <div style={{ fontSize: 12, color: "var(--pandora-ink-500)" }}>{contact.role}</div>
                )}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {contact.company && <InfoRow icon={<Building2 size={13} />}>{contact.company}</InfoRow>}
              {contact.role     && <InfoRow icon={<Briefcase size={13} />}>{contact.role}</InfoRow>}
              {contact.email    && <InfoRow icon={<Mail size={13} />}><a href={`mailto:${contact.email}`} style={linkStyle}>{contact.email}</a></InfoRow>}
              {contact.phone    && <InfoRow icon={<Phone size={13} />}>{contact.phone}</InfoRow>}
              {contact.linkedin_url && <InfoRow icon={<Linkedin size={13} />}><a href={contact.linkedin_url} target="_blank" style={linkStyle}>LinkedIn <ExternalLink size={10} /></a></InfoRow>}
              {contact.website  && <InfoRow icon={<Globe size={13} />}><a href={contact.website} target="_blank" style={linkStyle}>Site <ExternalLink size={10} /></a></InfoRow>}
            </div>

            {contact.tags && contact.tags.length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {contact.tags.map((t) => (
                  <span key={t} className="pda-badge pda-badge-green" style={{ textTransform: "lowercase" }}>{t}</span>
                ))}
              </div>
            )}

            {contact.notes && (
              <div style={{ paddingTop: 12, borderTop: "1px solid var(--pandora-ink-100)" }}>
                <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Notas</div>
                <p style={{ fontSize: 13, color: "var(--pandora-ink-600)", lineHeight: 1.5, margin: 0, whiteSpace: "pre-wrap" }}>
                  {contact.notes}
                </p>
              </div>
            )}
          </div>

          {/* AI: Quem é */}
          <IntelCard
            title="Quem é"
            icon={<Sparkles size={14} />}
            content={intel?.who}
            loading={loadingIntel}
            onGenerate={generateIntel}
            empty="Clique em Atualizar análise para gerar um resumo do contato baseado nas conversas."
          />
        </section>

        {/* 2. O QUE ESTÁ ROLANDO */}
        <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
          <IntelCard
            title="O que está rolando"
            icon={<MessageSquare size={14} />}
            content={intel?.status}
            loading={loadingIntel}
            topics={intel?.topics}
            empty="Resumo do momento atual do relacionamento aparece aqui após análise."
          />

          {/* Timeline */}
          <div className="pda-card">
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <MessageSquare size={14} color="var(--pandora-violet-500)" />
              <span className="pda-eyebrow">Últimas interações</span>
              <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--pandora-ink-400)" }}>
                {interactions.length + waMessages.length} eventos
              </span>
            </div>

            {interactions.length + waMessages.length === 0 ? (
              <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", margin: 0 }}>
                Nenhuma interação registrada ainda.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0, maxHeight: 380, overflowY: "auto" }}>
                {interactions.slice(0, 10).map((i) => (
                  <Event key={i.id} channel={i.channel} subject={i.subject || ""} text={i.content || i.summary || ""} when={i.occurred_at} />
                ))}
                {waMessages.slice(0, 10).map((m, idx) => (
                  <Event key={`wa-${idx}`} channel="whatsapp" subject="" text={m.content} when={(m.metadata?.timestamp as string) || ""} />
                ))}
              </div>
            )}
          </div>
        </section>

        {/* 3. COMO VENDER */}
        <section>
          <IntelCard
            title="Como vender pra ele"
            icon={<TrendingUp size={14} />}
            content={intel?.sales_strategy}
            loading={loadingIntel}
            empty="Estratégia de venda personalizada aparece aqui após análise."
          />
        </section>

        {intel?.updated_at && (
          <p style={{ marginTop: 16, fontSize: 11, color: "var(--pandora-ink-400)", textAlign: "right" }}>
            Análise atualizada em {new Date(intel.updated_at).toLocaleString("pt-BR")}
          </p>
        )}
      </div>
    </>
  );
}

// ──────────── Componentes ────────────

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--pandora-ink-600)" }}>
      <span style={{ color: "var(--pandora-ink-400)", display: "flex" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </div>
  );
}

function IntelCard({ title, icon, content, loading, onGenerate, empty, topics }: {
  title: string; icon: React.ReactNode; content?: string; loading?: boolean;
  onGenerate?: () => void; empty: string; topics?: string[];
}) {
  return (
    <div className="pda-card">
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <span style={{ color: "var(--pandora-violet-500)", display: "flex" }}>{icon}</span>
        <span className="pda-eyebrow">{title}</span>
        {onGenerate && (
          <button onClick={onGenerate} disabled={loading} className="pda-btn pda-btn-ghost" style={{ marginLeft: "auto", padding: "4px 10px", fontSize: 11 }}>
            <RefreshCw size={11} style={loading ? { animation: "spin 1s linear infinite" } : {}} />
            {loading ? "Analisando…" : "Atualizar análise"}
          </button>
        )}
      </div>
      {content ? (
        <>
          <p style={{ fontSize: 14, color: "var(--pandora-violet-900)", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{content}</p>
          {topics && topics.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 12 }}>
              {topics.map((t) => <span key={t} className="pda-badge pda-badge-violet">{t}</span>)}
            </div>
          )}
        </>
      ) : (
        <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", margin: 0, lineHeight: 1.5 }}>{empty}</p>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Event({ channel, subject, text, when }: { channel: string; subject: string; text: string; when: string }) {
  const channelColors: Record<string, string> = {
    whatsapp: "#25D366", email: "#EA4335", fathom: "#7C3AED", calcom: "#0070F3", manual: "#857891",
  };
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: "1px solid var(--pandora-ink-100)" }}>
      <div style={{ width: 6, height: 6, borderRadius: "50%", background: channelColors[channel] ?? "#aaa", marginTop: 6, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {subject && <div style={{ fontSize: 12, fontWeight: 600, color: "var(--pandora-violet-800)", marginBottom: 2 }}>{subject}</div>}
        <div style={{ fontSize: 13, color: "var(--pandora-ink-600)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
          {text}
        </div>
        {when && (
          <div style={{ fontSize: 10, color: "var(--pandora-ink-400)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
            {channel} · {new Date(when).toLocaleString("pt-BR")}
          </div>
        )}
      </div>
    </div>
  );
}

const linkStyle: React.CSSProperties = {
  color: "var(--pandora-violet-600)", textDecoration: "none",
  display: "inline-flex", alignItems: "center", gap: 4,
};
