"use client";

import { useEffect, useState, useCallback } from "react";
import { use } from "react";
import Image from "next/image";
import { FileText, ScrollText, Download, MessageSquare, LogOut, ExternalLink, FolderOpen } from "lucide-react";

interface Proposal  { id: string; title: string; value?: number; status: string; viewer_url?: string; sent_at?: string; version: number; }
interface Contract  { id: string; title: string; value?: number; status: string; viewer_url?: string; signed_at?: string; starts_at?: string; version: number; }
interface Document  { id: string; name: string; file_url: string; size_bytes?: number; mime_type?: string; uploaded_at: string; }
interface Message   { id: string; content: string; created_at: string; }

interface PortalData {
  portal: { id: string; label: string };
  opportunity?: { title: string; status: string; contacts?: { name?: string; company?: string } };
  proposals:  Proposal[];
  contracts:  Contract[];
  documents:  Document[];
  messages:   Message[];
}

const STATUS_PT: Record<string, string> = {
  draft: "Rascunho", sent: "Enviada", viewed: "Visualizada",
  accepted: "Aceita", rejected: "Rejeitada", expired: "Expirada",
  in_review: "Em revisão", signed: "Assinado", active: "Ativo",
  ended: "Encerrado", cancelled: "Cancelado",
};

function fmtBytes(b?: number) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtBRL(v?: number) {
  if (!v) return null;
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function PortalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [state, setState] = useState<"loading" | "login" | "portal">("loading");
  const [data,  setData]  = useState<PortalData | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState<string | null>(null);
  const [loggingIn, setLoggingIn] = useState(false);
  const [activeTab, setActiveTab] = useState<"propostas" | "contratos" | "documentos" | "mensagens">("propostas");

  const loadPortal = useCallback(async () => {
    const res = await fetch(`/api/portal/${slug}`);
    if (res.ok) {
      setData(await res.json());
      setState("portal");
    } else {
      setState("login");
    }
  }, [slug]);

  useEffect(() => { loadPortal(); }, [loadPortal]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoggingIn(true);
    setLoginErr(null);
    const res = await fetch(`/api/portal/${slug}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      await loadPortal();
    } else {
      const body = await res.json().catch(() => ({}));
      setLoginErr(body.error ?? "Credenciais inválidas");
    }
    setLoggingIn(false);
  }

  async function handleLogout() {
    await fetch(`/api/portal/${slug}/logout`, { method: "POST" });
    setData(null);
    setState("login");
  }

  if (state === "loading") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0D0219" }}>
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14 }}>Carregando...</div>
      </div>
    );
  }

  if (state === "login") {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(135deg, #0D0219 0%, #1a0535 100%)",
        fontFamily: "'Sora', sans-serif",
      }}>
        <div style={{
          width: 400, maxWidth: "90vw", padding: 40,
          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 16, backdropFilter: "blur(12px)",
        }}>
          <div style={{ textAlign: "center", marginBottom: 32 }}>
            <Image src="/pandora_ico.svg" alt="Pandora" width={40} height={40} style={{ marginBottom: 16 }} />
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "'Chakra Petch', sans-serif", marginBottom: 8 }}>
              Portal do Cliente
            </div>
            <h1 style={{ margin: 0, fontSize: 22, color: "#fff", fontFamily: "'Chakra Petch', sans-serif" }}>
              Acesse seus documentos
            </h1>
          </div>

          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Email</span>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)} required
                placeholder="seu@email.com" autoComplete="username"
                style={{
                  padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, color: "#fff", fontSize: 14, outline: "none",
                }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Senha</span>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)} required
                placeholder="••••••••" autoComplete="current-password"
                style={{
                  padding: "12px 14px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8, color: "#fff", fontSize: 14, outline: "none",
                }}
              />
            </label>
            {loginErr && (
              <div style={{ fontSize: 13, color: "#f87171", background: "rgba(248,113,113,0.1)", padding: "10px 14px", borderRadius: 8 }}>
                {loginErr}
              </div>
            )}
            <button
              type="submit" disabled={loggingIn}
              style={{
                padding: "13px", background: "#7A1CB5", border: "none", borderRadius: 8,
                color: "#fff", fontSize: 14, fontWeight: 600, cursor: loggingIn ? "not-allowed" : "pointer",
                opacity: loggingIn ? 0.6 : 1, marginTop: 4,
              }}
            >
              {loggingIn ? "Entrando..." : "Entrar"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const tabs = [
    { key: "propostas",  label: "Propostas",  count: data.proposals.length,  icon: FileText },
    { key: "contratos",  label: "Contratos",  count: data.contracts.length,  icon: ScrollText },
    { key: "documentos", label: "Documentos", count: data.documents.length,  icon: FolderOpen },
    { key: "mensagens",  label: "Mensagens",  count: data.messages.length,   icon: MessageSquare },
  ] as const;

  return (
    <div style={{ minHeight: "100vh", background: "#0D0219", fontFamily: "'Sora', sans-serif", color: "#e2e0e8" }}>
      {/* Header */}
      <div style={{
        background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 56,
      }}>
        <Image src="/pandora_ico.svg" alt="Pandora" width={28} height={28} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, fontFamily: "'Chakra Petch', sans-serif", color: "#fff" }}>
            {data.portal.label}
          </div>
          {data.opportunity && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{data.opportunity.title}</div>
          )}
        </div>
        <button
          onClick={handleLogout}
          style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "rgba(255,255,255,0.5)", cursor: "pointer", padding: "6px 12px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}
        >
          <LogOut size={13} /> Sair
        </button>
      </div>

      <div style={{ maxWidth: 860, margin: "0 auto", padding: "32px 24px" }}>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24, borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: 0 }}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                background: "none", border: "none", cursor: "pointer",
                padding: "10px 16px", fontSize: 13, fontWeight: 500,
                color: activeTab === tab.key ? "#a855f7" : "rgba(255,255,255,0.4)",
                borderBottom: `2px solid ${activeTab === tab.key ? "#7A1CB5" : "transparent"}`,
                marginBottom: -1, display: "flex", alignItems: "center", gap: 6,
              }}
            >
              <tab.icon size={14} />
              {tab.label}
              {tab.count > 0 && (
                <span style={{ fontSize: 10, background: "rgba(168,85,247,0.2)", color: "#a855f7", borderRadius: 10, padding: "1px 6px" }}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Propostas */}
        {activeTab === "propostas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.proposals.length === 0 ? (
              <Empty icon={FileText} text="Nenhuma proposta disponível" />
            ) : data.proposals.map(p => (
              <DocCard key={p.id}
                title={p.title}
                meta={[`v${p.version}`, STATUS_PT[p.status] ?? p.status, fmtBRL(p.value), fmtDate(p.sent_at)].filter(Boolean).join("  ·  ")}
                url={p.viewer_url}
                linkLabel="Ver proposta"
              />
            ))}
          </div>
        )}

        {/* Contratos */}
        {activeTab === "contratos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.contracts.length === 0 ? (
              <Empty icon={ScrollText} text="Nenhum contrato disponível" />
            ) : data.contracts.map(c => (
              <DocCard key={c.id}
                title={c.title}
                meta={[`v${c.version}`, STATUS_PT[c.status] ?? c.status, fmtBRL(c.value), c.starts_at ? `Início ${fmtDate(c.starts_at)}` : null].filter(Boolean).join("  ·  ")}
                url={c.viewer_url}
                linkLabel="Ver contrato"
              />
            ))}
          </div>
        )}

        {/* Documentos */}
        {activeTab === "documentos" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {data.documents.length === 0 ? (
              <Empty icon={FolderOpen} text="Nenhum documento enviado" />
            ) : data.documents.map(d => (
              <div key={d.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "14px 16px",
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8, background: "rgba(168,85,247,0.15)",
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <FolderOpen size={16} style={{ color: "#a855f7" }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>
                    {[fmtBytes(d.size_bytes), fmtDate(d.uploaded_at)].filter(Boolean).join("  ·  ")}
                  </div>
                </div>
                <a href={d.file_url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a855f7", background: "rgba(168,85,247,0.1)", padding: "7px 12px", borderRadius: 6, textDecoration: "none", flexShrink: 0 }}>
                  <Download size={13} /> Baixar
                </a>
              </div>
            ))}
          </div>
        )}

        {/* Mensagens */}
        {activeTab === "mensagens" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {data.messages.length === 0 ? (
              <Empty icon={MessageSquare} text="Nenhuma mensagem" />
            ) : data.messages.map(m => (
              <div key={m.id} style={{
                background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
                borderRadius: 10, padding: "16px 18px",
              }}>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.content}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginTop: 10 }}>
                  {fmtDate(m.created_at)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DocCard({ title, meta, url, linkLabel }: { title: string; meta: string; url?: string; linkLabel: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 14,
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8, background: "rgba(168,85,247,0.15)",
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <FileText size={16} style={{ color: "#a855f7" }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>{title}</div>
        <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginTop: 2 }}>{meta}</div>
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#a855f7", background: "rgba(168,85,247,0.1)", padding: "7px 12px", borderRadius: 6, textDecoration: "none", flexShrink: 0 }}>
          <ExternalLink size={13} /> {linkLabel}
        </a>
      )}
    </div>
  );
}

function Empty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0", color: "rgba(255,255,255,0.25)" }}>
      <Icon size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
      <div style={{ fontSize: 13 }}>{text}</div>
    </div>
  );
}
