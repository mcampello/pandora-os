"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ArrowLeft, Send, Loader2, ScrollText, Search, X, Save,
  FileText, ChevronDown, Plus,
} from "lucide-react";
import type { Proposal, ContractWithRefs } from "@/lib/types";
import { inputStyle } from "@/lib/docs";

interface ChatMessage { role: "user" | "assistant"; content: string; }
interface SaveForm { title: string; value: string; starts_at: string; ends_at: string; }
type SaveMode = "new" | "version";

const SCRATCH = [
  { id: "consultoria", label: "Consultoria em Tecnologia", prompt: "Gere um contrato completo de prestação de serviços de consultoria em tecnologia, com todas as cláusulas padrão do mercado brasileiro. Deixe campos de identificação das partes em aberto." },
  { id: "saas",       label: "Licenciamento SaaS",        prompt: "Gere um contrato completo de licenciamento de software SaaS, incluindo cláusulas de SLA, limitação de responsabilidade e LGPD. Deixe campos de identificação em aberto." },
  { id: "educacao",  label: "Serviços Educacionais",     prompt: "Gere um contrato de prestação de serviços educacionais (EaD/treinamento) com cláusulas de propriedade intelectual, confidencialidade e LGPD. Deixe campos de identificação em aberto." },
];

function NovoContratoInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sourceContractId = searchParams.get("source") ?? "";
  const isDuplicate = searchParams.get("mode") === "duplicate";
  const proposalIdParam = searchParams.get("proposal_id") ?? "";

  const [selectedProposal, setSelectedProposal] = useState<Proposal | null>(null);
  const [selectedContract, setSelectedContract] = useState<ContractWithRefs | null>(null);

  // Context picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [proposalSearch, setProposalSearch] = useState("");
  const [proposalResults, setProposalResults] = useState<Proposal[]>([]);
  const [dbTemplates, setDbTemplates] = useState<ContractWithRefs[]>([]);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Chat
  const [messages, setMessages] = useState<ChatMessage[]>([{
    role: "assistant",
    content: isDuplicate
      ? "Recebi o contrato original. Posso adaptá-lo para uma nova oportunidade ou criar uma nova versão com ajustes pontuais. O que prefere?"
      : "Olá! Sou o Dr. Cláudio. Selecione uma proposta ou modelo acima para começarmos, ou me diga diretamente o que precisa.",
  }]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [streamingRaw, setStreamingRaw] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const autoStartedRef = useRef(false);

  // Contract
  const [contractMd, setContractMd] = useState("");

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveForm, setSaveForm] = useState<SaveForm>({ title: "", value: "", starts_at: "", ends_at: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>("new");

  // ── Load templates when picker opens ────────────────────────────────────

  useEffect(() => {
    if (!pickerOpen || dbTemplates.length) return;
    fetch("/api/contracts")
      .then(r => r.ok ? r.json() : [])
      .then((list: ContractWithRefs[]) => {
        const sorted = [...list].sort((a, b) => {
          const o: Record<string, number> = { signed: 0, active: 1, in_review: 2, draft: 3 };
          return (o[a.status] ?? 9) - (o[b.status] ?? 9);
        });
        setDbTemplates(sorted.slice(0, 6));
      });
  }, [pickerOpen, dbTemplates.length]);

  // ── Auto-load from query params ──────────────────────────────────────────

  useEffect(() => {
    if (!sourceContractId) return;
    fetch(`/api/contracts/${sourceContractId}`)
      .then(r => r.ok ? r.json() : null)
      .then((c: ContractWithRefs | null) => {
        if (!c) return;
        setSelectedContract(c);
        if (isDuplicate) setSaveForm(f => ({ ...f, title: `${c.title} (cópia)`, value: c.value ? String(c.value) : "" }));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceContractId]);

  useEffect(() => {
    if (!proposalIdParam) return;
    fetch(`/api/proposals/${proposalIdParam}`)
      .then(r => r.ok ? r.json() : null)
      .then((p: Proposal | null) => { if (p) activateWithProposal(p, false); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposalIdParam]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingRaw]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  // ── Proposal search ──────────────────────────────────────────────────────

  async function searchProposals(q: string) {
    setProposalSearch(q);
    if (q.length < 1) { setProposalResults([]); return; }
    const res = await fetch(`/api/proposals?q=${encodeURIComponent(q)}`);
    if (res.ok) setProposalResults(await res.json());
  }

  // ── Activate contexts ────────────────────────────────────────────────────

  async function activateWithProposal(p: Proposal, sendAuto = true) {
    setSelectedProposal(p);
    setSelectedContract(null);
    setPickerOpen(false);
    setProposalSearch("");
    if (sendAuto && !autoStartedRef.current) {
      autoStartedRef.current = true;
      await sendMessage(
        `Analisou a proposta "${p.title}". Quais informações sobre as cláusulas precisamos definir antes de redigir o contrato?`,
        p, null,
      );
    }
  }

  function activateWithContract(c: ContractWithRefs) {
    setSelectedContract(c);
    setSelectedProposal(null);
    setPickerOpen(false);
    if (isDuplicate) setSaveForm(f => ({ ...f, title: `${c.title} (cópia)`, value: c.value ? String(c.value) : "" }));
  }

  async function startFromScratch(prompt: string) {
    setSelectedProposal(null);
    setSelectedContract(null);
    setPickerOpen(false);
    if (!autoStartedRef.current) {
      autoStartedRef.current = true;
      await sendMessage(prompt, null, null);
    }
  }

  function clearContext() {
    setSelectedProposal(null);
    setSelectedContract(null);
    setContractMd("");
    setStreamingRaw("");
    setMessages([{ role: "assistant", content: "Contexto limpo. Selecione uma proposta ou modelo, ou me diga o que precisa." }]);
    setInput("");
    autoStartedRef.current = false;
  }

  // ── Parse streaming content ──────────────────────────────────────────────

  function parseStreaming(raw: string) {
    const openTag = "<CONTRATO>";
    const closeTag = "</CONTRATO>";
    const openIdx = raw.indexOf(openTag);
    if (openIdx === -1) return { reply: raw, contract: "", inContract: false };
    const replyBefore = raw.slice(0, openIdx).trim();
    const closeIdx = raw.indexOf(closeTag);
    if (closeIdx === -1) {
      return { reply: replyBefore, contract: raw.slice(openIdx + openTag.length), inContract: true };
    }
    const contract = raw.slice(openIdx + openTag.length, closeIdx).trim();
    const replyAfter = raw.slice(closeIdx + closeTag.length).trim();
    const reply = [replyBefore, replyAfter].filter(Boolean).join("\n\n");
    return { reply, contract, inContract: false };
  }

  // ── Send message ─────────────────────────────────────────────────────────

  async function sendMessage(text: string, proposal: Proposal | null, contract: ContractWithRefs | null) {
    if (!text.trim() || thinking) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setThinking(true);
    setStreamingRaw("");

    const effectiveProposal = proposal ?? selectedProposal;
    const effectiveContract = contract ?? selectedContract;
    const apiMessages = history.filter(m => !(m.role === "assistant" && m.content.startsWith("Olá! Sou o Dr. Cláudio")));

    const res = await fetch("/api/contracts/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: apiMessages,
        proposal_content: effectiveProposal?.content_md ?? null,
        proposal_title: effectiveProposal?.title ?? null,
        source_contract_md: effectiveContract?.content_md ?? null,
        source_contract_title: effectiveContract?.title ?? null,
        source_mode: effectiveContract ? (isDuplicate ? "duplicate" : "template") : undefined,
      }),
    });

    if (!res.ok || !res.body) {
      let detail = `status ${res.status}`;
      try { const j = await res.json(); detail = j.error ?? detail; } catch { /* ignore */ }
      console.error("[contracts/agent] client error:", detail);
      setThinking(false);
      setStreamingRaw("");
      setMessages(m => [...m, { role: "assistant", content: `Erro ao contatar o agente: ${detail}` }]);
      return;
    }

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let accumulated = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += dec.decode(value, { stream: true });
        setStreamingRaw(accumulated);
      }
    } finally {
      reader.releaseLock();
    }

    const contractMatch = accumulated.match(/<CONTRATO>([\s\S]*?)<\/CONTRATO>/);
    const newContractMd = contractMatch ? contractMatch[1].trim() : null;
    const reply = contractMatch
      ? accumulated.replace(/<CONTRATO>[\s\S]*?<\/CONTRATO>/, "").trim() || "Contrato atualizado."
      : accumulated.trim();

    setMessages(m => [...m, { role: "assistant", content: reply }]);
    if (newContractMd) {
      setContractMd(newContractMd);
      if (!saveForm.title) {
        const match = newContractMd.match(/^#\s+(.+)/m);
        if (match) setSaveForm(f => ({ ...f, title: match[1] }));
      }
    }

    setStreamingRaw("");
    setThinking(false);
  }

  async function send(override?: string) {
    const text = (override ?? input).trim();
    if (!text) return;
    setInput("");
    await sendMessage(text, null, null);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  function openSaveModal() {
    if (!contractMd) return;
    if (!saveForm.title) {
      const match = contractMd.match(/^#\s+(.+)/m);
      if (match) setSaveForm(f => ({ ...f, title: match[1] }));
    }
    setSaveError(null);
    setShowSaveModal(true);
  }

  async function doSave() {
    if (!contractMd || !saveForm.title) return;
    setSaving(true);
    setSaveError(null);

    let contractGroupId: string | undefined;
    let version: number | undefined;

    if (saveMode === "version" && selectedContract?.contract_group_id) {
      const res = await fetch(`/api/contracts?group_id=${selectedContract.contract_group_id}`);
      if (res.ok) {
        const versions: ContractWithRefs[] = await res.json();
        const maxVersion = versions.reduce((max, c) => Math.max(max, c.version ?? 1), 0);
        contractGroupId = selectedContract.contract_group_id;
        version = maxVersion + 1;
      }
    }

    const payload: Record<string, unknown> = {
      title: saveForm.title,
      content_md: contractMd,
      value: saveForm.value ? parseFloat(saveForm.value) : null,
      starts_at: saveForm.starts_at || null,
      ends_at: saveForm.ends_at || null,
      client_id: (selectedProposal?.client_id ?? selectedContract?.client_id) || null,
      opportunity_id: (selectedProposal?.opportunity_id ?? selectedContract?.opportunity_id) || null,
      company_id: selectedContract?.company_id ?? null,
      status: "draft",
    };
    if (contractGroupId) payload.contract_group_id = contractGroupId;
    if (version != null) payload.version = version;

    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    if (!res.ok) { const err = await res.json(); setSaveError(err.error ?? "Erro ao salvar"); return; }
    const contract = await res.json();
    router.push(`/contratos?highlight=${contract.id}`);
  }

  // ─── Computed state ───────────────────────────────────────────────────────

  const parsed = streamingRaw ? parseStreaming(streamingRaw) : null;
  const displayContract = parsed?.contract || contractMd;
  const hasContract = !!displayContract;

  const contextLabel = selectedProposal
    ? selectedProposal.title
    : selectedContract
      ? selectedContract.title
      : null;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>

      {/* ── Left: Dr. Cláudio chat panel ──────────────────────────────────── */}
      <div style={{
        width: 320, flexShrink: 0,
        display: "flex", flexDirection: "column",
        borderRight: "1px solid var(--pandora-ink-100)",
        background: "#fff",
      }}>

        {/* Panel header */}
        <div style={{
          padding: "14px 16px 12px",
          borderBottom: "1px solid var(--pandora-ink-100)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <Link href="/contratos" style={{ color: "var(--pandora-ink-400)", display: "flex", alignItems: "center", gap: 4, textDecoration: "none", fontSize: 12 }}>
              <ArrowLeft size={13} /> Contratos
            </Link>
            {contractMd && !thinking && (
              <button className="pda-btn" onClick={openSaveModal}
                style={{ fontSize: 11, padding: "4px 9px", display: "flex", alignItems: "center", gap: 4 }}>
                <Save size={11} /> Salvar
              </button>
            )}
          </div>

          <p style={{ fontSize: 10, color: "var(--pandora-violet-600)", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "0 0 2px" }}>
            Dr. Cláudio · Contratos
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: "var(--pandora-ink-800)", margin: 0, fontFamily: "var(--font-display)" }}>
            Novo contrato com IA
          </p>

          {/* Context selector */}
          <div ref={pickerRef} style={{ position: "relative", marginTop: 10 }}>
            <button
              onClick={() => setPickerOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 6, width: "100%",
                padding: "7px 10px", background: "var(--pandora-ink-25)",
                border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-sm)",
                cursor: "pointer", fontSize: 12, color: "var(--pandora-ink-600)",
                textAlign: "left",
              }}
            >
              {contextLabel ? (
                <>
                  <FileText size={12} style={{ color: "var(--pandora-violet-600)", flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contextLabel}</span>
                  <button
                    onClick={e => { e.stopPropagation(); clearContext(); }}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--pandora-ink-400)", display: "flex" }}
                  >
                    <X size={11} />
                  </button>
                </>
              ) : (
                <>
                  <Plus size={12} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>Selecionar contexto</span>
                  <ChevronDown size={11} style={{ transform: pickerOpen ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
                </>
              )}
            </button>

            {pickerOpen && (
              <div style={{
                position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0,
                background: "#fff", border: "1px solid var(--pandora-ink-100)",
                borderRadius: "var(--radius-sm)", zIndex: 50,
                boxShadow: "var(--shadow-md)", maxHeight: 320, overflowY: "auto",
              }}>
                {/* Proposal search */}
                <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--pandora-ink-50)" }}>
                  <p style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 6px" }}>
                    Partir de uma proposta
                  </p>
                  <div style={{ position: "relative" }}>
                    <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--pandora-ink-400)", pointerEvents: "none" }} />
                    <input
                      style={{ ...inputStyle, paddingLeft: 28, fontSize: 12, width: "100%" }}
                      placeholder="Buscar proposta..."
                      value={proposalSearch}
                      onChange={e => searchProposals(e.target.value)}
                      autoFocus
                    />
                  </div>
                  {proposalResults.slice(0, 4).map(p => (
                    <button key={p.id} onClick={() => activateWithProposal(p)}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--pandora-ink-25)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <FileText size={11} style={{ color: "var(--pandora-violet-600)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--pandora-ink-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                    </button>
                  ))}
                </div>

                {/* Existing contracts as templates */}
                {dbTemplates.length > 0 && (
                  <div style={{ padding: "8px 10px", borderBottom: "1px solid var(--pandora-ink-50)" }}>
                    <p style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
                      Usar contrato como modelo
                    </p>
                    {dbTemplates.map(c => (
                      <button key={c.id} onClick={() => activateWithContract(c)}
                        style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "5px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "var(--pandora-ink-25)")}
                        onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                        <ScrollText size={11} style={{ color: "var(--pandora-ink-300)", flexShrink: 0 }} />
                        <span style={{ fontSize: 12, color: "var(--pandora-ink-700)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* From scratch */}
                <div style={{ padding: "8px 10px" }}>
                  <p style={{ fontSize: 10, color: "var(--pandora-ink-400)", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>
                    Começar do zero
                  </p>
                  {SCRATCH.map(t => (
                    <button key={t.id} onClick={() => startFromScratch(t.prompt)}
                      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "5px 4px", background: "none", border: "none", cursor: "pointer", textAlign: "left" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--pandora-ink-25)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                      <ScrollText size={11} style={{ color: "var(--pandora-violet-500)", flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: "var(--pandora-ink-700)" }}>{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Chat messages */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.map((m, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
              {m.role === "assistant" && (
                <span style={{ fontSize: 9, color: "var(--pandora-violet-600)", marginLeft: 2, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                  Dr. Cláudio
                </span>
              )}
              <div style={{
                maxWidth: "92%", padding: "8px 11px",
                borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
                background: m.role === "user" ? "var(--pandora-violet-600)" : "var(--pandora-ink-25)",
                border: m.role === "assistant" ? "1px solid var(--pandora-ink-100)" : "none",
                color: m.role === "user" ? "#fff" : "var(--pandora-ink-700)",
                fontSize: 12.5, lineHeight: 1.55,
              }}>
                <div className="prose-chat">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              </div>
            </div>
          ))}

          {/* Streaming reply bubble */}
          {thinking && parsed && (parsed.reply || parsed.inContract || !parsed.contract) && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start" }}>
              <span style={{ fontSize: 9, color: "var(--pandora-violet-600)", marginLeft: 2, fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Dr. Cláudio
              </span>
              <div style={{
                maxWidth: "92%", padding: "8px 11px",
                borderRadius: "2px 10px 10px 10px",
                background: "var(--pandora-ink-25)", border: "1px solid var(--pandora-ink-100)",
                color: "var(--pandora-ink-700)", fontSize: 12.5, lineHeight: 1.55,
              }}>
                {parsed.reply ? (
                  <div className="prose-chat">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.reply}</ReactMarkdown>
                  </div>
                ) : null}
                {parsed.inContract && (
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: parsed.reply ? 6 : 0, color: "var(--pandora-violet-600)", fontSize: 11 }}>
                    <Loader2 size={10} style={{ animation: "spin 1s linear infinite" }} />
                    <span>Redigindo o contrato...</span>
                  </div>
                )}
                {!parsed.reply && !parsed.inContract && (
                  <Loader2 size={10} style={{ animation: "spin 1s linear infinite", color: "var(--pandora-ink-400)" }} />
                )}
              </div>
            </div>
          )}

          {/* Simple loading indicator (before first token) */}
          {thinking && !streamingRaw && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 11px", borderRadius: "2px 10px 10px 10px", background: "var(--pandora-ink-25)", border: "1px solid var(--pandora-ink-100)", width: "fit-content" }}>
              <Loader2 size={11} style={{ animation: "spin 1s linear infinite", color: "var(--pandora-violet-600)" }} />
              <span style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>Redigindo...</span>
            </div>
          )}

          <div ref={chatEndRef} style={{ height: 14 }} />
        </div>

        {/* Chat input */}
        <div style={{ padding: "10px 12px 12px", borderTop: "1px solid var(--pandora-ink-100)", background: "#fff", flexShrink: 0 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end" }}>
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Pergunte ou peça ajustes..."
              style={{ ...inputStyle, flex: 1, resize: "none", minHeight: 56, fontSize: 12.5, lineHeight: 1.5, width: "auto" }}
              disabled={thinking}
            />
            <button className="pda-btn" onClick={() => send()} disabled={!input.trim() || thinking}
              style={{ padding: "8px 11px", flexShrink: 0, marginBottom: 1 }}>
              <Send size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* ── Right: Contract document ───────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "#f8f8f8" }}>
        {hasContract ? (
          <div style={{ flex: 1, overflowY: "auto", padding: "48px 0 80px" }}>
            <article className="pandora-contract">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContract}</ReactMarkdown>
            </article>
            {parsed?.inContract && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, margin: "16px auto", maxWidth: 720, paddingLeft: 48, color: "var(--pandora-violet-600)", fontSize: 12 }}>
                <Loader2 size={11} style={{ animation: "spin 1s linear infinite" }} />
                <span>Redigindo...</span>
              </div>
            )}
          </div>
        ) : (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, color: "var(--pandora-ink-300)" }}>
            <ScrollText size={40} strokeWidth={1} />
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--pandora-ink-400)", margin: "0 0 6px", fontFamily: "var(--font-display)" }}>
                O contrato aparece aqui
              </p>
              <p style={{ fontSize: 12, color: "var(--pandora-ink-300)", margin: 0, maxWidth: 260 }}>
                Selecione um contexto ou descreva para o Dr. Cláudio o que precisa
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Save Modal ─────────────────────────────────────────────────────── */}
      {showSaveModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(13,2,25,0.35)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
          onClick={e => e.target === e.currentTarget && setShowSaveModal(false)}>
          <div style={{ background: "#fff", border: "1px solid var(--pandora-ink-100)", borderRadius: "var(--radius-lg)", padding: 28, width: "min(460px, 90vw)", display: "flex", flexDirection: "column", gap: 18, color: "var(--pandora-ink-800)" }}>

            <div>
              <p style={{ fontSize: 11, color: "var(--pandora-violet-600)", fontFamily: "var(--font-display)", textTransform: "uppercase", letterSpacing: "0.06em", margin: "0 0 4px" }}>Salvar contrato</p>
              <p style={{ fontSize: 15, fontWeight: 700, margin: 0, fontFamily: "var(--font-display)", color: "var(--pandora-ink-800)" }}>Definir dados</p>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <input style={{ ...inputStyle }} placeholder="Título do contrato *"
                value={saveForm.title} onChange={e => setSaveForm(f => ({ ...f, title: e.target.value }))} autoFocus />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <input style={{ ...inputStyle }} placeholder="Valor (R$)" type="number"
                  value={saveForm.value} onChange={e => setSaveForm(f => ({ ...f, value: e.target.value }))} />
                <input style={{ ...inputStyle }} type="date" title="Início"
                  value={saveForm.starts_at} onChange={e => setSaveForm(f => ({ ...f, starts_at: e.target.value }))} />
                <input style={{ ...inputStyle }} type="date" title="Término"
                  value={saveForm.ends_at} onChange={e => setSaveForm(f => ({ ...f, ends_at: e.target.value }))} />
              </div>
            </div>

            {isDuplicate && selectedContract && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(["new", "version"] as SaveMode[]).map(mode => (
                  <label key={mode} style={{
                    display: "flex", gap: 10, padding: "11px 13px", borderRadius: "var(--radius-sm)", cursor: "pointer",
                    border: `1px solid ${saveMode === mode ? "var(--pandora-violet-300)" : "var(--pandora-ink-100)"}`,
                    background: saveMode === mode ? "var(--pandora-violet-50)" : "none",
                  }}>
                    <input type="radio" name="saveMode" value={mode} checked={saveMode === mode} onChange={() => setSaveMode(mode)} style={{ accentColor: "var(--pandora-violet-600)", marginTop: 2 }} />
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 600, margin: "0 0 2px", color: "var(--pandora-ink-800)" }}>
                        {mode === "new" ? "Novo contrato independente" : "Nova versão do original"}
                      </p>
                      <p style={{ fontSize: 11, color: "var(--pandora-ink-400)", margin: 0 }}>
                        {mode === "new" ? "Sem vínculo com o original" : "Vincula ao grupo e cria histórico de versões"}
                      </p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {saveError && <p style={{ fontSize: 12, color: "var(--color-danger)", margin: 0 }}>{saveError}</p>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button className="pda-btn-ghost" onClick={() => setShowSaveModal(false)} style={{ fontSize: 13 }}>Cancelar</button>
              <button className="pda-btn" onClick={doSave} disabled={!saveForm.title || saving}
                style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : <Save size={13} />}
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        .prose-chat p { margin: 0 0 4px; }
        .prose-chat p:last-child { margin-bottom: 0; }
        .prose-chat ul, .prose-chat ol { padding-left: 14px; margin: 2px 0; }
        .prose-chat li { margin-bottom: 1px; }
        .prose-chat strong { font-weight: 600; }

        .pandora-contract {
          max-width: 720px;
          margin: 0 auto;
          padding: 0 48px;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          font-size: 14px;
          line-height: 1.75;
          color: #1a1a1a;
        }
        .pandora-contract h1 {
          font-size: 22px; font-weight: 700;
          font-family: var(--font-display);
          margin: 0 0 6px; color: #111;
          text-align: center; letter-spacing: -0.02em;
        }
        .pandora-contract h2 {
          font-size: 10px; font-weight: 700;
          font-family: var(--font-display);
          margin: 36px 0 10px; color: #888;
          text-transform: uppercase; letter-spacing: 0.09em;
          border-bottom: 1px solid #e8e8e8; padding-bottom: 6px;
        }
        .pandora-contract h3 {
          font-size: 13px; font-weight: 600;
          margin: 20px 0 6px; color: #444;
        }
        .pandora-contract p { margin: 0 0 10px; }
        .pandora-contract strong { color: #111; font-weight: 600; }
        .pandora-contract ul, .pandora-contract ol { padding-left: 22px; margin: 6px 0 12px; }
        .pandora-contract li { margin-bottom: 4px; }
        .pandora-contract hr { border: none; border-top: 1px solid #eee; margin: 28px 0; }
        .pandora-contract blockquote {
          border-left: 2px solid var(--pandora-violet-200);
          padding-left: 14px; margin: 12px 0;
          color: #666; font-style: italic;
        }
        .pandora-contract table {
          width: 100%; border-collapse: collapse;
          margin: 12px 0; font-size: 13px;
        }
        .pandora-contract th, .pandora-contract td {
          border: 1px solid #e8e8e8;
          padding: 8px 12px; text-align: left;
        }
        .pandora-contract th {
          background: #f5f5f5; font-weight: 600; color: #555;
        }
        .pandora-contract a { color: var(--pandora-violet-600); text-decoration: underline; }
      `}</style>
    </div>
  );
}

export default function NovoContratoPage() {
  return <Suspense><NovoContratoInner /></Suspense>;
}
