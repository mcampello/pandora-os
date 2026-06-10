"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, Send, Sparkles, Save, Loader2, User, MessageSquare,
  Check, ChevronDown, Building2, Bot, UserCircle, FileText,
} from "lucide-react";
import type { Client } from "@/lib/types";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ClientOption {
  id: string;
  company_name: string;
  notes?: string;
}

/* ─── Seleção de Cliente ─── */
function ClientSelector({
  clients,
  selected,
  onSelect,
}: {
  clients: ClientOption[];
  selected: ClientOption | null;
  onSelect: (c: ClientOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const filtered = useMemo(() => {
    if (!query) return clients;
    const q = query.toLowerCase();
    return clients.filter(c => c.company_name.toLowerCase().includes(q));
  }, [clients, query]);

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", maxWidth: 420 }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 16px",
          borderRadius: 10,
          border: "1px solid var(--pandora-ink-200)",
          background: "var(--pandora-ink-0)",
          cursor: "pointer",
          fontSize: 14,
          color: selected ? "var(--pandora-ink-800)" : "var(--pandora-ink-400)",
          textAlign: "left",
        }}
      >
        <Building2 size={16} style={{ color: "var(--pandora-violet-500)", flexShrink: 0 }} />
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected ? selected.company_name : "Selecione o cliente…"}
        </span>
        <ChevronDown size={14} style={{ color: "var(--pandora-ink-400)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 200ms" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          left: 0,
          right: 0,
          background: "var(--pandora-ink-0)",
          border: "1px solid var(--pandora-ink-200)",
          borderRadius: 10,
          boxShadow: "var(--shadow-lg)",
          zIndex: 50,
          maxHeight: 320,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--pandora-ink-100)" }}>
            <input
              autoFocus
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar cliente…"
              style={{
                width: "100%",
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--pandora-ink-100)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: 16, fontSize: 13, color: "var(--pandora-ink-400)", textAlign: "center" }}>
                Nenhum cliente encontrado
              </div>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  onClick={() => { onSelect(c); setOpen(false); setQuery(""); }}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 14px",
                    border: "none",
                    borderBottom: "1px solid var(--pandora-ink-50)",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 13,
                    color: "var(--pandora-ink-700)",
                    textAlign: "left",
                    transition: "background 120ms",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = "var(--pandora-violet-50)"; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
                >
                  <UserCircle size={15} style={{ color: "var(--pandora-violet-400)", flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{c.company_name}</span>
                  {selected?.id === c.id && <Check size={14} style={{ color: "var(--pandora-green-500)" }} />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Chat Message Bubble ─── */
function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div style={{
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
      flexDirection: isUser ? "row-reverse" : "row",
    }}>
      <div style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        background: isUser ? "var(--pandora-violet-100)" : "var(--pandora-violet-600)",
        color: isUser ? "var(--pandora-violet-700)" : "var(--pandora-ink-0)",
      }}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div style={{
        maxWidth: "calc(100% - 50px)",
        padding: "10px 14px",
        borderRadius: 12,
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
        background: isUser ? "var(--pandora-violet-600)" : "var(--pandora-ink-100)",
        color: isUser ? "var(--pandora-ink-0)" : "var(--pandora-ink-700)",
        fontSize: 13,
        lineHeight: 1.6,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
      }}>
        {msg.content}
      </div>
    </div>
  );
}

/* ─── Página Principal ─── */
export default function NovaPropostaPage() {
  const router = useRouter();

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientOption | null>(null);
  const [step, setStep] = useState<"select" | "chat">("select");

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [proposalContent, setProposalContent] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [selectedCompany, setSelectedCompany] = useState("");

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Carregar clientes e empresas
  useEffect(() => {
    fetch("/api/clients").then(r => r.ok ? r.json() : []).then((data: Client[]) => {
      setClients(data.map(c => ({ id: c.id, company_name: c.company_name, notes: c.notes ?? undefined })));
    });
    fetch("/api/companies").then(r => r.ok ? r.json() : []).then(setCompanies);
  }, []);

  // Scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [input]);

  function startChat(client: ClientOption) {
    setSelectedClient(client);
    setStep("chat");
    setMessages([{
      role: "assistant",
      content: `Opa! Sou o Pedro, consultor de negócios da Pandora. Trabalho com o Mario há anos e ajudo a montar as propostas que fecham contrato por aqui.\n\nEntão a gente vai preparar algo para ${client.company_name}, é isso? Me conta: qual é o desafio deles? Estão buscando uma consultoria, desenvolvimento de algum sistema, ou treinamento em IA?`,
    }]);
  }

  async function sendMessage() {
    if (!input.trim() || loading) return;
    const text = input.trim();
    setInput("");
    const newMessages: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch("/api/proposals/ai-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          clientInfo: selectedClient ? { name: selectedClient.company_name, notes: selectedClient.notes } : undefined,
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: "assistant", content: b.error ?? "Erro ao processar mensagem." }]);
        return;
      }

      const { content } = await res.json();
      setMessages(prev => [...prev, { role: "assistant", content }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Erro de conexão. Tente novamente." }]);
    } finally {
      setLoading(false);
    }
  }

  async function generateProposal() {
    if (generating) return;
    setGenerating(true);

    try {
      const res = await fetch("/api/proposals/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages,
          clientInfo: selectedClient ? { name: selectedClient.company_name, notes: selectedClient.notes } : undefined,
        }),
      });

      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: "assistant", content: b.error ?? "Erro ao gerar proposta." }]);
        return;
      }

      const { content_md } = await res.json();
      setProposalContent(content_md);

      // Tentar extrair título da proposta (primeiro h1)
      const titleMatch = content_md.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        setProposalTitle(titleMatch[1].trim());
      } else if (selectedClient) {
        setProposalTitle(`Proposta — ${selectedClient.company_name}`);
      }

      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Pronto! Montei a proposta com base no que a gente conversou. Dá uma olhada no painel ao lado e me fala se precisa ajustar alguma coisa — valores, prazos, entregáveis... A gente vai refinando até ficar redonda.",
      }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Erro de conexão ao gerar proposta." }]);
    } finally {
      setGenerating(false);
    }
  }

  async function saveProposal() {
    if (!proposalTitle.trim() || !selectedCompany) return;
    setSaving(true);

    try {
      const payload = {
        title: proposalTitle.trim(),
        content_md: proposalContent,
        client_id: selectedClient?.id ?? null,
        company_id: selectedCompany,
        status: "draft",
      };

      const res = await fetch("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        router.push(`/propostas/${data.id}`);
      } else {
        const b = await res.json().catch(() => ({}));
        setMessages(prev => [...prev, { role: "assistant", content: b.error ?? "Erro ao salvar proposta." }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Erro de conexão ao salvar." }]);
    } finally {
      setSaving(false);
    }
  }

  // ─── Tela de Seleção ───
  if (step === "select") {
    return (
      <div style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "var(--pandora-violet-950)",
        color: "var(--pandora-ink-0)",
      }}>
        <a href="/propostas" style={{
          position: "absolute",
          top: 20,
          left: 20,
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 13,
          color: "rgba(255,255,255,0.6)",
          textDecoration: "none",
          transition: "color 120ms",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLAnchorElement).style.color = "var(--pandora-ink-0)"; }}
        onMouseLeave={e => { (e.currentTarget as HTMLAnchorElement).style.color = "rgba(255,255,255,0.6)"; }}
        >
          <ArrowLeft size={14} /> Voltar
        </a>

        <div style={{
          width: "100%",
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 32,
        }}>
          <div style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "color-mix(in srgb, var(--pandora-violet-400) 15%, transparent)",
            border: "1px solid color-mix(in srgb, var(--pandora-violet-400) 30%, transparent)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Sparkles size={28} style={{ color: "var(--pandora-violet-400)" }} />
          </div>

          <div style={{ textAlign: "center" }}>
            <h1 style={{
              fontFamily: "var(--font-display)",
              fontSize: 24,
              fontWeight: 700,
              margin: "0 0 8px",
              color: "var(--pandora-ink-0)",
            }}>
              Nova Proposta com IA
            </h1>
            <p style={{
              fontSize: 14,
              color: "rgba(255,255,255,0.55)",
              margin: 0,
              lineHeight: 1.5,
            }}>
              Converse com nosso especialista em propostas comerciais.<br />
              Ele vai te ajudar a construir uma proposta de alta conversão.
            </p>
          </div>

          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 16 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Cliente
            </label>
            <ClientSelector
              clients={clients}
              selected={selectedClient}
              onSelect={setSelectedClient}
            />
          </div>

          <button
            onClick={() => selectedClient && startChat(selectedClient)}
            disabled={!selectedClient}
            style={{
              padding: "12px 28px",
              borderRadius: 10,
              border: "none",
              background: selectedClient ? "var(--pandora-violet-600)" : "rgba(255,255,255,0.1)",
              color: "var(--pandora-ink-0)",
              fontSize: 14,
              fontWeight: 600,
              cursor: selectedClient ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              gap: 8,
              transition: "background 120ms, transform 120ms",
            }}
          >
            <MessageSquare size={16} />
            Iniciar Conversa
          </button>
        </div>
      </div>
    );
  }

  // ─── Tela de Chat ───
  const canGenerate = messages.length >= 4 && !generating;
  const canSave = proposalContent.trim() && proposalTitle.trim() && selectedCompany && !saving;

  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column",
      background: "var(--pandora-violet-950)",
      color: "var(--pandora-ink-0)",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 20px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/propostas" style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: "rgba(255,255,255,0.6)",
            textDecoration: "none",
          }}>
            <ArrowLeft size={14} />
          </a>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            background: "var(--pandora-violet-600)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <Bot size={16} />
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "var(--pandora-ink-0)" }}>Pedro — Consultor de Negócios</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{selectedClient?.company_name}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {proposalContent && (
            <>
              <input
                value={proposalTitle}
                onChange={e => setProposalTitle(e.target.value)}
                placeholder="Título da proposta"
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--pandora-ink-0)",
                  fontSize: 13,
                  minWidth: 240,
                  outline: "none",
                }}
              />
              <select
                value={selectedCompany}
                onChange={e => setSelectedCompany(e.target.value)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid rgba(255,255,255,0.15)",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--pandora-ink-0)",
                  fontSize: 13,
                  outline: "none",
                }}
              >
                <option value="" style={{ background: "var(--pandora-ink-800)", color: "var(--pandora-ink-0)" }}>Empresa…</option>
                {companies.map(c => (
                  <option key={c.id} value={c.id} style={{ background: "var(--pandora-ink-800)", color: "var(--pandora-ink-0)" }}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={saveProposal}
                disabled={!canSave}
                style={{
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  background: canSave ? "var(--pandora-green-500)" : "rgba(255,255,255,0.1)",
                  color: canSave ? "var(--pandora-ink-900)" : "rgba(255,255,255,0.4)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: canSave ? "pointer" : "not-allowed",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                {saving ? <Loader2 size={14} className="de-spin" /> : <Save size={14} />}
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{
        flex: 1,
        display: "flex",
        overflow: "hidden",
        minHeight: 0,
      }}>
        {/* Chat Panel */}
        <div style={{
          width: "40%",
          minWidth: 360,
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          borderRight: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(255,255,255,0.02)",
        }}>
          {/* Messages */}
          <div style={{
            flex: 1,
            overflow: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}>
            {messages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}
            {loading && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 40px" }}>
                <Loader2 size={14} className="de-spin" style={{ color: "var(--pandora-violet-400)" }} />
                <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Só um segundo, organizando as ideias…</span>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* Input Area */}
          <div style={{
            padding: "16px 20px",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}>
            {canGenerate && (
              <button
                onClick={generateProposal}
                disabled={generating}
                style={{
                  width: "100%",
                  padding: "10px",
                  borderRadius: 8,
                  border: "1px solid color-mix(in srgb, var(--pandora-violet-400) 40%, transparent)",
                  background: "color-mix(in srgb, var(--pandora-violet-400) 12%, transparent)",
                  color: "var(--pandora-violet-300)",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: generating ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {generating ? <Loader2 size={14} className="de-spin" /> : <Sparkles size={14} />}
                {generating ? "Montando a proposta…" : "Bora montar a proposta?"}
              </button>
            )}

            <div style={{
              display: "flex",
              gap: 8,
              alignItems: "flex-end",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 12,
              padding: "8px 12px",
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Digite sua mensagem…"
                rows={1}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--pandora-ink-0)",
                  fontSize: 13,
                  lineHeight: 1.5,
                  outline: "none",
                  resize: "none",
                  maxHeight: 120,
                  fontFamily: "var(--font-text)",
                }}
              />
              <button
                onClick={sendMessage}
                disabled={!input.trim() || loading}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  border: "none",
                  background: input.trim() && !loading ? "var(--pandora-violet-600)" : "rgba(255,255,255,0.08)",
                  color: "var(--pandora-ink-0)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                  flexShrink: 0,
                }}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Preview Panel */}
        <div style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "var(--pandora-ink-25)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "10px 20px",
            borderBottom: "1px solid var(--pandora-ink-100)",
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexShrink: 0,
          }}>
            <FileText size={14} style={{ color: "var(--pandora-ink-400)" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--pandora-ink-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Preview da Proposta
            </span>
          </div>

          <div style={{
            flex: 1,
            overflow: "auto",
            padding: "32px 48px",
          }}>
            {proposalContent ? (
              <div className="de-preview" style={{ maxWidth: 800, margin: "0 auto" }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{proposalContent}</ReactMarkdown>
              </div>
            ) : (
              <div style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                color: "var(--pandora-ink-400)",
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: "50%",
                  background: "var(--pandora-ink-50)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  <FileText size={24} style={{ color: "var(--pandora-ink-300)" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: "var(--pandora-ink-500)", margin: "0 0 4px" }}>
                    A proposta aparecerá aqui
                  </p>
                  <p style={{ fontSize: 12, color: "var(--pandora-ink-400)", margin: 0 }}>
                    Converse com o especialista e clique em "Gerar Proposta Completa"
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
