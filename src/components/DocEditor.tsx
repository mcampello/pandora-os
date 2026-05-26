"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import {
  ArrowLeft, Check, Copy, Download, ExternalLink,
  FileText, Globe, Loader2, RotateCcw, Send, Sparkles, X,
} from "lucide-react";
import { applyDynamicTokens } from "@/lib/docs";
import { exportToPdf, exportToDocx } from "@/lib/export";
import type { ProposalStatus, ContractStatus } from "@/lib/types";

type DocStatus = ProposalStatus | ContractStatus;

interface AiMessage {
  role: "user" | "assistant";
  text: string;
}

interface Props {
  id: string;
  type: "p" | "c";
  initialTitle: string;
  initialContent: string;
  initialStatus: DocStatus;
  viewerUrl: string;
  statusOptions: { value: string; label: string; color: string }[];
  backHref: string;
  backLabel: string;
  apiPath: string; // "/api/proposals" | "/api/contracts"
  duplicateHref?: string;
  // Shows a CTA banner when document reaches a specific status
  nextAction?: { href: string; label: string; condition: DocStatus; message: string };
}

type SaveStatus = "saved" | "saving" | "unsaved" | "error";

export default function DocEditor({
  id, type, initialTitle, initialContent, initialStatus,
  viewerUrl, statusOptions, backHref, backLabel, apiPath, duplicateHref, nextAction,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [status, setStatus] = useState<DocStatus>(initialStatus);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [editMode, setEditMode] = useState<"edit" | "preview">("edit");
  const [aiOpen, setAiOpen] = useState(true);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiUseWeb, setAiUseWeb] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [prevContent, setPrevContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const [signedClientId, setSignedClientId] = useState<string | null>(null);
  const articleRef = useRef<HTMLDivElement>(null);
  const aiBottomRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processedContent = applyDynamicTokens(content);

  // ── Auto-save (debounced 2s) ──────────────────────────────
  useEffect(() => {
    if (saveStatus === "saved") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { save(); }, 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, status]);

  // ── Cmd+S ────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content, status]);

  // ── Scroll AI to bottom ───────────────────────────────────
  useEffect(() => {
    aiBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  async function save() {
    setSaveStatus("saving");
    try {
      const res = await fetch(`${apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content_md: content, status }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        // After signing a contract, detect the auto-created client
        if (type === "c" && status === "signed") {
          const data = await res.json().catch(() => null);
          if (data?.client_id) setSignedClientId(data.client_id);
        }
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    }
  }

  function markUnsaved() {
    setSaveStatus("unsaved");
  }

  async function sendAiMessage() {
    if (!aiInput.trim() || aiLoading) return;
    const instruction = aiInput.trim();
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", text: instruction }]);
    setAiLoading(true);
    setPrevContent(content);

    try {
      const res = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: content, instruction, useWeb: aiUseWeb, title }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({})) as { error?: string };
        setAiMessages((prev) => [...prev, { role: "assistant", text: errData.error ?? "Erro ao processar." }]);
        setPrevContent(null);
        return;
      }

      // Stream the response — update textarea in real time
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let accumulated = "";
      setContent("");
      setSaveStatus("unsaved");

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += dec.decode(value, { stream: true });
        setContent(accumulated);
      }

      setAiMessages((prev) => [
        ...prev,
        { role: "assistant", text: "Documento atualizado. Revise e salve quando estiver pronto." },
      ]);
    } catch {
      setAiMessages((prev) => [...prev, { role: "assistant", text: "Erro de conexão com o assistente." }]);
      // Restore original content on connection error
      setContent(prevContent ?? content);
      setPrevContent(null);
    } finally {
      setAiLoading(false);
    }
  }

  function undoAi() {
    if (!prevContent) return;
    setContent(prevContent);
    setPrevContent(null);
    setSaveStatus("unsaved");
    setAiMessages((prev) => [...prev, { role: "assistant", text: "Alteração revertida." }]);
  }

  function copyLink() {
    navigator.clipboard.writeText(viewerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function exportPdf() {
    if (!articleRef.current) return;
    setExportingPdf(true);
    try { await exportToPdf(articleRef.current, title); }
    finally { setExportingPdf(false); }
  }

  async function exportDocx() {
    setExportingDocx(true);
    try { await exportToDocx(processedContent, title); }
    finally { setExportingDocx(false); }
  }

  const currentStatusOpt = statusOptions.find((s) => s.value === status);

  return (
    <>
    <div className="de-root">
      {/* ── Toolbar ──────────────────────────────────────── */}
      <div className="de-toolbar">
        <div className="de-toolbar-left">
          <a href={backHref} className="de-back">
            <ArrowLeft size={15} />
            <span>{backLabel}</span>
          </a>
          <input
            className="de-title-input"
            value={title}
            onChange={(e) => { setTitle(e.target.value); markUnsaved(); }}
            placeholder="Título do documento"
          />
          <select
            className="de-status-select"
            style={{ color: currentStatusOpt?.color }}
            value={status}
            onChange={(e) => { setStatus(e.target.value as DocStatus); markUnsaved(); }}
          >
            {statusOptions.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="de-toolbar-right">
          <span className="de-save-indicator" data-status={saveStatus}>
            {saveStatus === "saving" && <><Loader2 size={12} className="de-spin" /> Salvando…</>}
            {saveStatus === "saved"  && <><Check size={12} /> Salvo</>}
            {saveStatus === "unsaved" && "Não salvo"}
            {saveStatus === "error"  && "Erro ao salvar"}
          </span>
          {duplicateHref && (
            <a className="de-btn de-btn-ghost" href={duplicateHref} title="Duplicar documento">
              Duplicar
            </a>
          )}
          <button className="de-btn de-btn-ghost" onClick={copyLink} title="Copiar link do viewer">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? "Copiado" : "Link"}
          </button>
          <a className="de-btn de-btn-ghost" href={viewerUrl} target="_blank" rel="noreferrer" title="Abrir viewer">
            <ExternalLink size={14} /> Preview
          </a>
          <button className="de-btn de-btn-ghost" onClick={exportDocx} disabled={exportingDocx} title="Exportar DOCX">
            <FileText size={14} /> {exportingDocx ? "…" : "DOCX"}
          </button>
          <button className="de-btn de-btn-primary" onClick={exportPdf} disabled={exportingPdf} title="Exportar PDF">
            <Download size={14} /> {exportingPdf ? "…" : "PDF"}
          </button>
          <button
            className={`de-btn de-btn-ai${aiOpen ? " active" : ""}`}
            onClick={() => setAiOpen(!aiOpen)}
            title="Assistente IA"
          >
            <Sparkles size={14} /> IA
          </button>
        </div>
      </div>

      {/* ── Next Action Banner ───────────────────────────── */}
      {nextAction && status === nextAction.condition && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          gap: 12, padding: "10px 20px",
          background: "linear-gradient(90deg, rgba(45,212,160,0.12) 0%, rgba(45,212,160,0.06) 100%)",
          borderBottom: "1px solid rgba(45,212,160,0.25)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Check size={14} style={{ color: "var(--pandora-green-400)", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: "var(--pandora-ink-100)" }}>{nextAction.message}</span>
          </div>
          <a
            href={nextAction.href}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: "var(--pandora-green-400)", color: "#0a1a14",
              textDecoration: "none", flexShrink: 0, whiteSpace: "nowrap",
            }}
          >
            {nextAction.label} →
          </a>
        </div>
      )}

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="de-body">
        {/* ── Editor ────────────────────────────── */}
        <div className="de-editor">
          <div className="de-editor-tabs">
            <button
              className={`de-tab${editMode === "edit" ? " active" : ""}`}
              onClick={() => setEditMode("edit")}
            >Editar</button>
            <button
              className={`de-tab${editMode === "preview" ? " active" : ""}`}
              onClick={() => setEditMode("preview")}
            >Preview</button>
          </div>

          {editMode === "edit" ? (
            <textarea
              className="de-textarea"
              value={content}
              onChange={(e) => { setContent(e.target.value); markUnsaved(); }}
              spellCheck={false}
            />
          ) : (
            <div className="de-preview" ref={articleRef}>
              <MarkdownRenderer>{processedContent}</MarkdownRenderer>
            </div>
          )}
        </div>

        {/* ── AI Panel ──────────────────────────── */}
        {aiOpen && (
          <div className="de-ai-panel">
            <div className="de-ai-head">
              <Sparkles size={14} />
              <span>Assistente IA</span>
              <button className="de-ai-close" onClick={() => setAiOpen(false)} title="Fechar">
                <X size={14} />
              </button>
            </div>

            <div className="de-ai-messages">
              {aiMessages.length === 0 && (
                <div className="de-ai-empty">
                  <Sparkles size={24} />
                  <p>Peça melhorias, reescritas ou sugestões para o documento.</p>
                  <p className="de-ai-hint">Ex: "Melhore a seção de investimento" · "Adicione cláusula de LGPD" · "Reescreva em tom mais formal"</p>
                </div>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} className={`de-ai-msg de-ai-msg-${m.role}`}>
                  {m.text}
                  {m.role === "assistant" && prevContent && i === aiMessages.length - 1 && (
                    <button className="de-undo-btn" onClick={undoAi}>
                      <RotateCcw size={11} /> Reverter
                    </button>
                  )}
                </div>
              ))}
              {aiLoading && (
                <div className="de-ai-msg de-ai-msg-assistant de-ai-loading">
                  <Loader2 size={14} className="de-spin" /> Processando…
                </div>
              )}
              <div ref={aiBottomRef} />
            </div>

            <div className="de-ai-input-area">
              <label className="de-web-toggle">
                <input
                  type="checkbox"
                  checked={aiUseWeb}
                  onChange={(e) => setAiUseWeb(e.target.checked)}
                />
                <Globe size={12} />
                <span>Buscar na web</span>
              </label>
              <div className="de-ai-input-row">
                <textarea
                  className="de-ai-textarea"
                  placeholder="Instrução para o assistente…"
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendAiMessage(); }
                  }}
                  rows={3}
                />
                <button
                  className="de-ai-send"
                  onClick={sendAiMessage}
                  disabled={aiLoading || !aiInput.trim()}
                  title="Enviar (Enter)"
                >
                  <Send size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {/* ── Contract Signed Modal ────────────────────────── */}
    {signedClientId && (
      <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200,
      }}>
        <div style={{
          background: "var(--pandora-ink-900)", border: "1px solid var(--pandora-ink-700)",
          borderRadius: 16, padding: "36px 40px", width: 380, textAlign: "center",
          display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: "50%",
            background: "rgba(45,212,160,0.15)", border: "1px solid rgba(45,212,160,0.3)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <Check size={24} style={{ color: "var(--pandora-green-400)" }} />
          </div>
          <div>
            <p style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, margin: "0 0 6px", color: "var(--pandora-ink-50)" }}>
              Contrato assinado!
            </p>
            <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", margin: 0, lineHeight: 1.5 }}>
              A operação foi iniciada automaticamente para este cliente.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <a
              href={`/operacao/${signedClientId}`}
              style={{
                padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: "var(--pandora-violet-600)", color: "#fff",
                textDecoration: "none", display: "flex", alignItems: "center", gap: 6,
              }}
            >
              Ir para operação →
            </a>
            <button
              onClick={() => setSignedClientId(null)}
              style={{
                padding: "10px 16px", borderRadius: 8, fontSize: 13,
                background: "none", border: "1px solid var(--pandora-ink-700)",
                color: "var(--pandora-ink-300)", cursor: "pointer",
              }}
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
