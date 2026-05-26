"use client";

import { useEffect, useRef, useState } from "react";
import MarkdownRenderer from "./MarkdownRenderer";
import { Download, FileText, Copy, Check } from "lucide-react";
import { applyDynamicTokens } from "@/lib/docs";
import { exportToPdf, exportToDocx } from "@/lib/export";

interface Props {
  id: string;
  type: "p" | "c";
  title: string;
  subtitle: string;
  content: string;
  status: string;
}

export default function DocViewerClient({ id, type, title, subtitle, content, status }: Props) {
  const articleRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingDocx, setExportingDocx] = useState(false);
  const processedContent = applyDynamicTokens(content);

  useEffect(() => {
    const endpoint = type === "p" ? `/api/proposals/${id}` : `/api/contracts/${id}`;
    if (status === "sent") {
      fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ viewed_at: true }),
      }).catch(() => {});
    }
  }, [id, type, status]);

  async function handleExportPdf() {
    if (!articleRef.current) return;
    setExportingPdf(true);
    try { await exportToPdf(articleRef.current, title); }
    finally { setExportingPdf(false); }
  }

  async function handleExportDocx() {
    setExportingDocx(true);
    try { await exportToDocx(processedContent, title); }
    finally { setExportingDocx(false); }
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <div className="dv-header">
        <div className="dv-header-brand">
          <img src="/pandora_ico.svg" alt="Pandora" />
          Pandora
        </div>
        <div className="dv-header-meta">
          <div className="dv-header-title">{title}</div>
          <div className="dv-header-subtitle">{subtitle}</div>
        </div>
        <div className="dv-header-actions">
          <button type="button" className="dv-btn dv-btn-ghost" onClick={copyLink} title="Copiar link">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? "Copiado" : "Copiar link"}</span>
          </button>
          <button type="button" className="dv-btn dv-btn-ghost" onClick={handleExportDocx} disabled={exportingDocx} title="Baixar .docx">
            <FileText size={14} />
            <span>{exportingDocx ? "Gerando…" : ".docx"}</span>
          </button>
          <button type="button" className="dv-btn dv-btn-primary" onClick={handleExportPdf} disabled={exportingPdf} title="Baixar PDF">
            <Download size={14} />
            <span>{exportingPdf ? "Gerando…" : "PDF"}</span>
          </button>
        </div>
      </div>

      <div className="dv-body">
        <article className="dv-article" ref={articleRef}>
          <MarkdownRenderer>{processedContent}</MarkdownRenderer>
        </article>
      </div>
    </>
  );
}
