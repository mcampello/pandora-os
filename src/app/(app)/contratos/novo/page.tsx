"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, Send, Loader2, ScrollText, Search, X,
  Save, ChevronDown, FileText, Sparkles,
} from "lucide-react";
import type { Proposal } from "@/lib/types";
import { inputStyle } from "@/lib/docs";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FormState {
  title: string;
  value: string;
  starts_at: string;
  ends_at: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NovoContratoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const proposalIdParam = searchParams.get("proposal_id") ?? "";
  const opportunityIdParam = searchParams.get("opportunity_id") ?? "";
  const clientIdParam = searchParams.get("client_id") ?? "";

  // Proposal selector
  const [proposalSearch, setProposalSearch] = useState("");
  const [proposalResults, setProposalResults] = useState<Proposal[]>([]);
  const [proposalOpen, setProposalOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [loadingProposal, setLoadingProposal] = useState(false);
  const proposalRef = useRef<HTMLDivElement>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: "Olá! Sou o Dr. Cláudio, seu advogado especialista em contratos comerciais de tecnologia e educação.\n\nPosso **redigir um contrato do zero**, a partir de uma proposta existente, ou debater cláusulas específicas.\n\nComo quer começar?",
    },
  ]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Contract
  const [contractMd, setContractMd] = useState("");
  const [form, setForm] = useState<FormState>({ title: "", value: "", starts_at: "", ends_at: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Auto-load proposal from query param ─────────────────────────────────

  useEffect(() => {
    if (!proposalIdParam) return;
    setLoadingProposal(true);
    fetch(`/api/proposals/${proposalIdParam}`)
      .then(r => r.ok ? r.json() : null)
      .then(p => { if (p) selectProposal(p); })
      .finally(() => setLoadingProposal(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalIdParam]);

  // ── Close dropdown on outside click ─────────────────────────────────────

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (proposalRef.current && !proposalRef.current.contains(e.target as Node)) {
        setProposalOpen(false);
      }
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Auto-scroll chat ─────────────────────────────────────────────────────

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Search proposals ─────────────────────────────────────────────────────

  async function searchProposals(q: string) {
    setProposalSearch(q);
    if (q.length < 1) { setProposalResults([]); return; }
    const res = await fetch(`/api/proposals?q=${encodeURIComponent(q)}`);
    if (res.ok) setProposalResults(await res.json());
  }

  function selectProposal(p: Proposal) {
    setSelectedProposal(p);
    setProposalOpen(false);
    setProposalSearch("");
    if (!form.title) {
      setForm(f => ({ ...f, title: `Contrato — ${p.title}`, value: p.value ? String(p.value) : "" }));
    }
  }

  // ── Send message to AI agent ─────────────────────────────────────────────

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text || thinking) return;
    setInput("");

    const userMsg: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setThinking(true);

    // Only send non-welcome messages to the API
    const apiMessages = history.filter(m => !(m.role === "assistant" && m.content.startsWith("Olá!")));

    const res = await fetch("/api/contracts/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: apiMessages,
        proposal_content: selectedProposal?.content_md ?? null,
        proposal_title: selectedProposal?.title ?? null,
      }),
    });

    setThinking(false);
    if (!res.ok) {
      setMessages(m => [...m, { role: "assistant", content: "Erro ao contatar o agente. Tente novamente." }]);
      return;
    }

    const data = await res.json() as { reply: string; contract_md: string | null };
    setMessages(m => [...m, { role: "assistant", content: data.reply }]);
    if (data.contract_md) {
      setContractMd(data.contract_md);
      // Auto-fill title from first heading if not set
      if (!form.title) {
        const match = data.contract_md.match(/^#\s+(.+)/m);
        if (match) setForm(f => ({ ...f, title: match[1] }));
      }
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function quickAction(action: string) {
    send(action);
  }

  // ── Save contract ────────────────────────────────────────────────────────

  async function saveContract() {
    if (!contractMd || !form.title) return;
    setSaving(true);
    setSaveError(null);

    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: form.title,
        content_md: contractMd,
        value: form.value ? parseFloat(form.value) : null,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        client_id: selectedProposal?.client_id ?? clientIdParam || null,
        opportunity_id: selectedProposal?.opportunity_id ?? opportunityIdParam || null,
        status: "draft",
      }),
    });

    setSaving(false);
    if (!res.ok) {
      const err = await res.json();
      setSaveError(err.error ?? "Erro ao salvar");
      return;
    }
    const contract = await res.json();
    router.push(`/contratos?highlight=${contract.id}`);
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* Top bar */}
      <div className="pda-topbar" style={{ flexShrink: 0, gap: 12 }}>
        <Link href="/contratos" style={{ color: "inherit", display: "flex", alignItems: "center", gap: 6, textDecoration: "none", opacity: 0.7 }}>
          <ArrowLeft size={16} /> Contratos
        </Link>
        <span style={{ opacity: 0.3 }}>/</span>
        <Sparkles size={15} style={{ color: "var(--pandora-violet-400)" }} />
        <span style={{ fontWeight: 600, fontFamily: "var(--font-display)" }}>Novo contrato com IA</span>
      </div>

      {/* Proposal selector bar */}
      <div style={{ padding: "10px 24px", borderBottom: "1px solid var(--pandora-ink-800)", background: "var(--pandora-ink-950)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 12, color: "var(--pandora-ink-400)", flexShrink: 0, fontFamily: "var(--font-display)", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            Proposta base
          </span>
          <div ref={proposalRef} style={{ position: "relative", flex: 1, maxWidth: 420 }}>
            {selectedProposal ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--pandora-violet-900)", borderRadius: 8, border: "1px solid var(--pandora-violet-700)" }}>
                <FileText size={13} style={{ color: "var(--pandora-violet-400)", flexShrink: 0 }} />
                <span style={{ fontSize: 13, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selectedProposal.title}</span>
                {selectedProposal.value && (
                  <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", flexShrink: 0 }}>
                    {Number(selectedProposal.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                  </span>
                )}
                <button onClick={() => setSelectedProposal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", padding: 0, display: "flex" }}>
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div style={{ position: "relative" }}>
                <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--pandora-ink-500)", pointerEvents: "none" }} />
                <input
                  style={{ ...inputStyle, paddingLeft: 32, width: "100%", fontSize: 13 }}
                  placeholder="Buscar proposta para usar como base..."
                  value={proposalSearch}
                  onChange={e => { searchProposals(e.target.value); setProposalOpen(true); }}
                  onFocus={() => setProposalOpen(true)}
                />
                {loadingProposal && <Loader2 size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", animation: "spin 1s linear infinite" }} />}
              </div>
            )}

            {proposalOpen && proposalResults.length > 0 && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", borderRadius: 8, zIndex: 50, overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                {proposalResults.slice(0, 6).map(p => (
                  <button key={p.id} onClick={() => selectProposal(p)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 14px", background: "none", border: "none", cursor: "pointer", textAlign: "left", color: "inherit" }}>
                    <FileText size={13} style={{ color: "var(--pandora-violet-400)", flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</div>
                      {p.value && <div style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{Number(p.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</div>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main split */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── LEFT: Chat ─────────────────────────────────────────────────── */}
        <div style={{ width: "38%", minWidth: 320, display: "flex", flexDirection: "column", borderRight: "1px solid var(--pandora-ink-800)" }}>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" && (
                  <div style={{ fontSize: 10, color: "var(--pandora-ink-500)", marginLeft: 2, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Dr. Cláudio
                  </div>
                )}
                <div style={{
                  maxWidth: "88%",
                  padding: "10px 14px",
                  borderRadius: m.role === "user" ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
                  background: m.role === "user" ? "var(--pandora-violet-700)" : "var(--pandora-ink-850, var(--pandora-ink-900))",
                  border: m.role === "assistant" ? "1px solid var(--pandora-ink-700)" : "none",
                  fontSize: 13,
                  lineHeight: 1.55,
                }}>
                  <div className="prose-contract">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            ))}

            {thinking && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)", width: "fit-content" }}>
                <Loader2 size={13} style={{ animation: "spin 1s linear infinite", color: "var(--pandora-violet-400)" }} />
                <span style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>Dr. Cláudio está redigindo...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Quick actions (shown before first user message) */}
          {messages.filter(m => m.role === "user").length === 0 && (
            <div style={{ padding: "0 16px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
              {selectedProposal ? (
                <>
                  <p style={{ fontSize: 11, color: "var(--pandora-ink-500)", margin: 0 }}>Ações rápidas</p>
                  <button className="pda-btn-ghost" style={{ fontSize: 12, justifyContent: "flex-start" }}
                    onClick={() => quickAction(`Leia a proposta "${selectedProposal.title}" e gere o primeiro rascunho completo do contrato de prestação de serviços, incluindo todas as cláusulas padrão.`)}>
                    <Sparkles size={12} /> Gerar rascunho completo do contrato
                  </button>
                  <button className="pda-btn-ghost" style={{ fontSize: 12, justifyContent: "flex-start" }}
                    onClick={() => quickAction(`Com base na proposta, gere um contrato de licenciamento de software/SaaS com as cláusulas específicas para esse tipo de serviço.`)}>
                    <ScrollText size={12} /> Gerar como contrato de licenciamento/SaaS
                  </button>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 11, color: "var(--pandora-ink-500)", margin: 0 }}>Ações rápidas</p>
                  <button className="pda-btn-ghost" style={{ fontSize: 12, justifyContent: "flex-start" }}
                    onClick={() => quickAction("Gere um contrato completo de prestação de serviços de consultoria em tecnologia, com todas as cláusulas padrão do mercado brasileiro.")}>
                    <ScrollText size={12} /> Contrato de consultoria em tecnologia
                  </button>
                  <button className="pda-btn-ghost" style={{ fontSize: 12, justifyContent: "flex-start" }}
                    onClick={() => quickAction("Gere um contrato completo de licenciamento de software SaaS, incluindo cláusulas de SLA, limitação de responsabilidade e LGPD.")}>
                    <ScrollText size={12} /> Contrato de licenciamento SaaS
                  </button>
                  <button className="pda-btn-ghost" style={{ fontSize: 12, justifyContent: "flex-start" }}
                    onClick={() => quickAction("Gere um contrato de prestação de serviços educacionais (EaD/treinamento corporativo) com cláusulas de propriedade intelectual e confidencialidade.")}>
                    <ScrollText size={12} /> Contrato de serviços educacionais
                  </button>
                </>
              )}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--pandora-ink-800)", display: "flex", gap: 8 }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Peça ao Dr. Cláudio para redigir, alterar ou explicar..."
              style={{ ...inputStyle, flex: 1, resize: "none", minHeight: 72, fontSize: 13, lineHeight: 1.5 }}
              disabled={thinking}
            />
            <button className="pda-btn" onClick={() => send()} disabled={!input.trim() || thinking}
              style={{ alignSelf: "flex-end", padding: "10px 14px", flexShrink: 0 }}>
              <Send size={14} />
            </button>
          </div>
        </div>

        {/* ── RIGHT: Contract Preview ─────────────────────────────────────── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Contract meta fields */}
          <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--pandora-ink-800)", background: "var(--pandora-ink-950)", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input
                style={{ ...inputStyle, flex: 1, minWidth: 220, fontSize: 14, fontWeight: 600 }}
                placeholder="Título do contrato..."
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
              <input
                style={{ ...inputStyle, width: 140, fontSize: 13 }}
                placeholder="Valor (R$)"
                type="number"
                value={form.value}
                onChange={e => setForm(f => ({ ...f, value: e.target.value }))}
              />
              <input
                style={{ ...inputStyle, width: 140, fontSize: 13 }}
                type="date"
                title="Início"
                value={form.starts_at}
                onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))}
              />
              <input
                style={{ ...inputStyle, width: 140, fontSize: 13 }}
                type="date"
                title="Término"
                value={form.ends_at}
                onChange={e => setForm(f => ({ ...f, ends_at: e.target.value }))}
              />
              <button
                className="pda-btn"
                onClick={saveContract}
                disabled={!contractMd || !form.title || saving}
                style={{ flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}
              >
                {saving ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={14} />}
                {saving ? "Salvando..." : "Salvar contrato"}
              </button>
            </div>
            {saveError && <p style={{ fontSize: 12, color: "var(--color-danger)", marginTop: 6 }}>{saveError}</p>}
          </div>

          {/* Contract body */}
          <div style={{ flex: 1, overflowY: "auto", padding: "32px 40px" }}>
            {!contractMd ? (
              <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, opacity: 0.4 }}>
                <ScrollText size={48} />
                <p style={{ fontSize: 14, textAlign: "center", maxWidth: 320 }}>
                  O contrato aparecerá aqui quando o Dr. Cláudio redigir o primeiro rascunho.
                  {selectedProposal ? ' Clique em "Gerar rascunho completo" para começar.' : " Escolha uma proposta base ou peça diretamente no chat."}
                </p>
              </div>
            ) : (
              <article className="contract-preview">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{contractMd}</ReactMarkdown>
              </article>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .prose-contract p { margin: 0 0 6px; }
        .prose-contract p:last-child { margin-bottom: 0; }
        .prose-contract strong { color: var(--pandora-ink-100); }
        .prose-contract ul, .prose-contract ol { padding-left: 18px; margin: 4px 0; }
        .prose-contract li { margin-bottom: 2px; }

        .contract-preview { font-family: var(--font-body); font-size: 14px; line-height: 1.7; color: var(--pandora-ink-100); max-width: 780px; margin: 0 auto; }
        .contract-preview h1 { font-size: 20px; font-weight: 700; font-family: var(--font-display); margin: 0 0 8px; color: var(--pandora-ink-50); text-align: center; }
        .contract-preview h2 { font-size: 15px; font-weight: 700; font-family: var(--font-display); margin: 28px 0 8px; color: var(--pandora-ink-50); text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--pandora-ink-800); padding-bottom: 4px; }
        .contract-preview h3 { font-size: 13px; font-weight: 700; margin: 18px 0 6px; color: var(--pandora-ink-200); }
        .contract-preview p { margin: 0 0 10px; }
        .contract-preview strong { color: var(--pandora-ink-50); font-weight: 600; }
        .contract-preview ul, .contract-preview ol { padding-left: 22px; margin: 6px 0 12px; }
        .contract-preview li { margin-bottom: 4px; }
        .contract-preview hr { border: none; border-top: 1px solid var(--pandora-ink-800); margin: 24px 0; }
        .contract-preview blockquote { border-left: 3px solid var(--pandora-violet-600); padding-left: 14px; margin: 12px 0; color: var(--pandora-ink-300); font-style: italic; }
        .contract-preview table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
        .contract-preview th, .contract-preview td { border: 1px solid var(--pandora-ink-700); padding: 8px 12px; text-align: left; }
        .contract-preview th { background: var(--pandora-ink-900); font-weight: 600; }
      `}</style>
    </div>
  );
}
