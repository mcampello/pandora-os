"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import {
  Check, ChevronRight, Copy, Download, ExternalLink, FileText,
  Globe, Loader2, RotateCcw, Send, Sparkles, X,
} from "lucide-react";
import { applyDynamicTokens } from "@/lib/docs";
import { exportToPdf, exportToDocx } from "@/lib/export";
import type { ProposalStatus, ContractStatus } from "@/lib/types";
import type { DocBreadcrumb } from "@/lib/doc-breadcrumb";

const TiptapEditor = dynamic(() => import("./TiptapEditor"), {
  ssr: false,
  loading: () => <div className="dn-editor-skeleton" />,
});

type DocStatus = ProposalStatus | ContractStatus;
type SaveStatus = "saved" | "saving" | "unsaved" | "error";

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
  apiPath: string; // "/api/proposals" | "/api/contracts"
  breadcrumb: DocBreadcrumb;
}

export default function NotionDocEditor({
  id, initialTitle, initialContent, initialStatus,
  viewerUrl, statusOptions, apiPath, breadcrumb,
}: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [initialMarkdown] = useState(initialContent); // estável: usado só na montagem do editor
  const [status, setStatus] = useState<DocStatus>(initialStatus);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("saved");
  const [aiOpen, setAiOpen] = useState(true);
  const [aiMessages, setAiMessages] = useState<AiMessage[]>([]);
  const [aiInput, setAiInput] = useState("");
  const [aiUseWeb, setAiUseWeb] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [prevContent, setPrevContent] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);
  const aiBottomRef = useRef<HTMLDivElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const processedContent = applyDynamicTokens(content);

  const save = useCallback(async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`${apiPath}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content_md: content, status }),
      });
      setSaveStatus(res.ok ? "saved" : "error");
    } catch {
      setSaveStatus("error");
    }
  }, [apiPath, id, title, content, status]);

  // ── Auto-save (debounced 2s) ──────────────────────────────
  useEffect(() => {
    if (saveStatus !== "unsaved") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { save(); }, 2000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [title, content, status, saveStatus, save]);

  // ── Cmd+S ────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); save(); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // ── Scroll do chat IA ─────────────────────────────────────
  useEffect(() => {
    aiBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [aiMessages]);

  function markUnsaved() {
    setSaveStatus("unsaved");
  }

  const onEditorChange = useCallback((md: string) => {
    setContent(md);
    setSaveStatus((s) => (s === "saving" ? s : "unsaved"));
  }, []);

  async function sendAiMessage() {
    if (!aiInput.trim() || aiLoading) return;
    const instruction = aiInput.trim();
    setAiInput("");
    setAiMessages((prev) => [...prev, { role: "user", text: instruction }]);
    setAiLoading(true);

    try {
      const res = await fetch("/api/ai/improve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document: content, instruction, useWeb: aiUseWeb, title }),
      });
      const data = await res.json();
      if (data.content) {
        setAiMessages((prev) => [
          ...prev,
          { role: "assistant", text: "Documento atualizado. Revise e salve quando estiver pronto." },
        ]);
        setPrevContent(content);
        setContent(data.content);
        setSaveStatus("unsaved");
      } else {
        setAiMessages((prev) => [...prev, { role: "assistant", text: data.error ?? "Erro ao processar." }]);
      }
    } catch {
      setAiMessages((prev) => [...prev, { role: "assistant", text: "Erro de conexão com o assistente." }]);
    } finally {
      setAiLoading(false);
    }
  }

  function undoAi() {
    if (prevContent === null) return;
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
    <div className="dn-shell">
      {/* ── Topbar: breadcrumb + ações ─────────────────────── */}
      <header className="dn-topbar">
        <nav className="dn-breadcrumb" aria-label="breadcrumb">
          {breadcrumb.company && <span className="dn-crumb">{breadcrumb.company.name}</span>}
          {breadcrumb.contact && (
            <>
              {breadcrumb.company && <ChevronRight size={13} className="dn-crumb-sep" />}
              <Link className="dn-crumb-link" href={`/clientes/${breadcrumb.contact.id}`}>{breadcrumb.contact.name}</Link>
            </>
          )}
          {breadcrumb.opportunity && (
            <>
              {(breadcrumb.company || breadcrumb.contact) && <ChevronRight size={13} className="dn-crumb-sep" />}
              <Link className="dn-crumb-link" href={`/oportunidades/${breadcrumb.opportunity.id}`}>{breadcrumb.opportunity.title}</Link>
            </>
          )}
          {!breadcrumb.company && !breadcrumb.contact && !breadcrumb.opportunity && (
            <span className="dn-crumb">Documento</span>
          )}
        </nav>

        <div className="dn-topbar-actions">
          <span className="de-save-indicator" data-status={saveStatus}>
            {saveStatus === "saving" && <><Loader2 size={12} className="de-spin" /> Salvando…</>}
            {saveStatus === "saved" && <><Check size={12} /> Salvo</>}
            {saveStatus === "unsaved" && "Não salvo"}
            {saveStatus === "error" && "Erro ao salvar"}
          </span>
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
          <button className="de-btn de-btn-ghost" onClick={copyLink} title="Copiar link do viewer">
            {copied ? <Check size={14} /> : <Copy size={14} />}{copied ? "Copiado" : "Link"}
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
          <button className={`de-btn de-btn-ai${aiOpen ? " active" : ""}`} onClick={() => setAiOpen(!aiOpen)} title="Assistente IA">
            <Sparkles size={14} /> IA
          </button>
        </div>
      </header>

      {/* ── Corpo: editor + painel IA ──────────────────────── */}
      <div className="dn-body">
        <main className="dn-editor">
          <TiptapEditor
            initialMarkdown={initialMarkdown}
            markdown={content}
            onChange={onEditorChange}
            header={
              <input
                className="dn-title-input"
                value={title}
                onChange={(e) => { setTitle(e.target.value); markUnsaved(); }}
                placeholder="Título do documento"
              />
            }
          />
        </main>

        {aiOpen && (
          <aside className="dn-ai-panel" data-open="true">
            <div className="de-ai-head">
              <Sparkles size={14} />
              <span>Assistente</span>
              <button className="de-ai-close" onClick={() => setAiOpen(false)} title="Fechar">
                <X size={14} />
              </button>
            </div>

            <div className="de-ai-messages">
              {aiMessages.length === 0 && (
                <div className="de-ai-empty">
                  <Sparkles size={24} />
                  <p>Peça melhorias, reescritas ou sugestões para o documento.</p>
                  <p className="de-ai-hint">Ex: &quot;Melhore a seção de investimento&quot; · &quot;Adicione cláusula de LGPD&quot; · &quot;Tom mais formal&quot;</p>
                </div>
              )}
              {aiMessages.map((m, i) => (
                <div key={i} className={`de-ai-msg de-ai-msg-${m.role}`}>
                  {m.text}
                  {m.role === "assistant" && prevContent !== null && i === aiMessages.length - 1 && (
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
                <input type="checkbox" checked={aiUseWeb} onChange={(e) => setAiUseWeb(e.target.checked)} />
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
                <button className="de-ai-send" onClick={sendAiMessage} disabled={aiLoading || !aiInput.trim()} title="Enviar (Enter)">
                  <Send size={14} />
                </button>
              </div>
            </div>
          </aside>
        )}
      </div>

      {/* Fonte offscreen p/ export PDF (markdown processado, mesma tipografia do viewer) */}
      <div className="de-preview dn-print-source" ref={articleRef} aria-hidden="true">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{processedContent}</ReactMarkdown>
      </div>
    </div>
  );
}
