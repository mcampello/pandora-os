"use client";

import { useEffect, useRef, useState, useCallback, FormEvent } from "react";
import { X, Send, MessageCircle, RefreshCw, Paperclip, Mic, MicOff, FileText, ImageIcon, Music, Link2 } from "lucide-react";
import { useChatPanel } from "@/lib/chat-panel-context";

interface Message {
  id: string;          // UUID from DB, or stringified Date.now() for optimistic
  optimistic?: boolean;
  content: string;
  // From relational table (whatsapp_messages)
  message_type?: string;
  media_url?: string | null;
  media_filename?: string | null;
  media_caption?: string | null;
  media_duration?: number | null;
  // Legacy fields from public.documents (kept for fallback compat)
  kind?: "text" | "image" | "url";
  sender_name: string;
  date: string | null;
  direction: "inbound" | "outbound";
  // Optimistic-only (sent media — blob URL)
  mediaKind?: "image" | "audio" | "document" | "video";
  mediaUrl?: string;
  mediaName?: string;
}

type MediaKind = "image" | "audio" | "document" | "video";

interface PendingFile {
  file: File;
  kind: MediaKind;
  previewUrl: string; // blob URL
  caption: string;
}

export default function WhatsAppChatPanel() {
  const { panelOpen, panelContact, closePanel } = useChatPanel();
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [text, setText] = useState("");

  // Media state
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordSeconds, setRecordSeconds] = useState(0);

  const bottomRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async (contactId: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/contacts/${contactId}/whatsapp-messages`);
      const data = await res.json() as { messages?: Message[] };
      if (data.messages) {
        setMessages(prev => {
          const optimistic = prev.filter(m => m.optimistic);
          const apiMessages = data.messages!;
          const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
          const pendingOptimistic = optimistic.filter(opt => {
            const optTs = Number(opt.id);
            if (opt.mediaKind) return Date.now() - optTs < 5 * 60 * 1000;
            return !apiMessages.some(api =>
              api.direction === "outbound" &&
              api.content === opt.content &&
              new Date(api.date ?? 0).getTime() > tenMinutesAgo
            );
          });
          return [...apiMessages, ...pendingOptimistic];
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (!panelOpen || !panelContact) return;
    fetchMessages(panelContact.contactId);
    pollRef.current = setInterval(() => fetchMessages(panelContact.contactId), 30_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [panelOpen, panelContact, fetchMessages]);

  useEffect(() => {
    if (panelOpen) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  }, [messages, panelOpen]);

  // Revoke blob URLs on unmount
  useEffect(() => {
    return () => {
      if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    };
  }, [pendingFile]);

  function detectKind(file: File): MediaKind {
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("video/")) return "video";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      setSendError("Arquivo muito grande (máx 16 MB)");
      return;
    }
    if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile({ file, kind: detectKind(file), previewUrl: URL.createObjectURL(file), caption: "" });
    e.target.value = "";
  }

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      audioChunksRef.current = [];
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const file = new File([blob], "audio.webm", { type: "audio/webm" });
        if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
        setPendingFile({ file, kind: "audio", previewUrl: URL.createObjectURL(blob), caption: "" });
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
      setRecordSeconds(0);
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
    } catch {
      setSendError("Não foi possível acessar o microfone");
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    setRecording(false);
  }

  function cancelPendingFile() {
    if (pendingFile) URL.revokeObjectURL(pendingFile.previewUrl);
    setPendingFile(null);
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!panelContact || sending) return;
    if (!pendingFile && !text.trim()) return;
    setSendError("");
    setSending(true);

    try {
      let res: Response;

      if (pendingFile) {
        const form = new FormData();
        form.append("file", pendingFile.file);
        form.append("kind", pendingFile.kind);
        if (pendingFile.caption.trim()) form.append("caption", pendingFile.caption.trim());

        res = await fetch(`/api/contacts/${panelContact.contactId}/send-whatsapp`, {
          method: "POST",
          body: form,
        });

        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok) {
          setSendError(data.error ?? "Erro ao enviar");
        } else {
          // Optimistic media message
          setMessages(prev => [...prev, {
            id: String(Date.now()),
            optimistic: true,
            content: pendingFile.caption.trim() || pendingFile.file.name,
            sender_name: "Você",
            date: new Date().toISOString(),
            direction: "outbound",
            mediaKind: pendingFile.kind,
            mediaUrl: pendingFile.previewUrl,
            mediaName: pendingFile.file.name,
          }]);
          // Don't revoke URL yet — still showing in chat
          setPendingFile(null);
        }
      } else {
        res = await fetch(`/api/contacts/${panelContact.contactId}/send-whatsapp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.trim() }),
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok) {
          setSendError(data.error ?? "Erro ao enviar");
        } else {
          setText("");
          setMessages(prev => [...prev, {
            id: String(Date.now()),
            optimistic: true,
            content: text.trim(),
            sender_name: "Você",
            date: new Date().toISOString(),
            direction: "outbound",
          }]);
        }
      }
    } catch {
      setSendError("Erro de conexão");
    } finally {
      setSending(false);
    }
  }

  function formatTime(date: string | null) {
    if (!date) return "";
    try { return new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); }
    catch { return ""; }
  }

  function formatDay(date: string | null) {
    if (!date) return "";
    try { return new Date(date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }); }
    catch { return ""; }
  }

  function fmtSecs(s: number) {
    return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
  }

  type Item = { type: "msg"; msg: Message } | { type: "day"; label: string };
  const items: Item[] = [];
  let lastDay = "";
  for (const msg of messages) {
    const day = msg.date ? msg.date.slice(0, 10) : "";
    if (day && day !== lastDay) {
      items.push({ type: "day", label: formatDay(msg.date) });
      lastDay = day;
    }
    items.push({ type: "msg", msg });
  }

  const canSend = !sending && (!!pendingFile || !!text.trim());

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, height: "100vh", width: 420, zIndex: 50,
      display: "flex", flexDirection: "column",
      background: "var(--pandora-violet-950)",
      borderLeft: "1px solid rgba(255,255,255,0.08)",
      transform: panelOpen ? "translateX(0)" : "translateX(100%)",
      transition: "transform 280ms cubic-bezier(0.4, 0, 0.2, 1)",
      boxShadow: panelOpen ? "-8px 0 32px rgba(0,0,0,0.4)" : "none",
    }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(45,212,160,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <MessageCircle size={18} color="var(--pandora-green-400)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {panelContact?.contactName ?? "Conversa"}
          </div>
          {panelContact?.contactPhone && (
            <div style={{ fontSize: 11, color: "var(--pandora-ink-400)", marginTop: 1 }}>{panelContact.contactPhone}</div>
          )}
        </div>
        <button type="button" onClick={() => !loading && panelContact && fetchMessages(panelContact.contactId)} title="Atualizar"
          style={{ background: "none", border: "none", color: "var(--pandora-ink-400)", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", alignItems: "center" }}>
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
        </button>
        <button type="button" onClick={closePanel} title="Fechar"
          style={{ background: "none", border: "none", color: "var(--pandora-ink-400)", cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", alignItems: "center" }}>
          <X size={16} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 16px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
        {loading && messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--pandora-ink-500)", fontSize: 13, marginTop: 40 }}>Carregando mensagens...</div>
        )}
        {!loading && messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--pandora-ink-500)", fontSize: 13, marginTop: 40 }}>Nenhuma mensagem encontrada</div>
        )}
        {items.map((item, i) => {
          if (item.type === "day") {
            return (
              <div key={`day-${i}`} style={{ textAlign: "center", fontSize: 11, color: "var(--pandora-ink-500)", margin: "8px 0 4px", fontFamily: "var(--font-mono)" }}>
                {item.label}
              </div>
            );
          }
          const { msg } = item;
          const isOut = msg.direction === "outbound";
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isOut ? "flex-end" : "flex-start", marginBottom: 2 }}>
              <div style={{
                maxWidth: "80%", padding: "8px 12px",
                borderRadius: isOut ? "16px 4px 16px 16px" : "4px 16px 16px 16px",
                background: isOut ? "var(--pandora-violet-600)" : "var(--pandora-violet-800)",
                color: "#fff", fontSize: 13, lineHeight: 1.45, wordBreak: "break-word",
              }}>
                <MessageBubbleContent msg={msg} />
              </div>
              <div style={{ fontSize: 10, color: "var(--pandora-ink-500)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                {formatTime(msg.date)}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* File preview */}
      {pendingFile && (
        <div style={{ margin: "0 16px 8px", padding: "10px 12px", background: "rgba(255,255,255,0.06)", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)" }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {pendingFile.kind === "image" && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pendingFile.previewUrl} alt="preview" style={{ maxHeight: 120, maxWidth: "100%", borderRadius: 6, objectFit: "cover" }} />
              )}
              {pendingFile.kind === "audio" && (
                <audio controls src={pendingFile.previewUrl} style={{ width: "100%", height: 36 }} />
              )}
              {(pendingFile.kind === "document" || pendingFile.kind === "video") && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--pandora-ink-200)", fontSize: 12 }}>
                  <FileText size={20} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pendingFile.file.name}</span>
                </div>
              )}
              {pendingFile.kind !== "audio" && (
                <input
                  type="text"
                  value={pendingFile.caption}
                  onChange={e => setPendingFile(p => p ? { ...p, caption: e.target.value } : p)}
                  placeholder="Legenda (opcional)"
                  style={{ marginTop: 6, width: "100%", background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.15)", color: "#fff", fontSize: 12, outline: "none", paddingBottom: 2 }}
                />
              )}
            </div>
            <button type="button" onClick={cancelPendingFile}
              style={{ background: "none", border: "none", color: "var(--pandora-ink-400)", cursor: "pointer", padding: 2, flexShrink: 0 }}>
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Recording indicator */}
      {recording && (
        <div style={{ margin: "0 16px 8px", padding: "8px 12px", background: "rgba(239,68,68,0.15)", borderRadius: 10, border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", animation: "pulse 1s infinite" }} />
          <span style={{ color: "#ef4444", fontSize: 12, fontFamily: "var(--font-mono)" }}>Gravando {fmtSecs(recordSeconds)}</span>
          <button type="button" onClick={stopRecording}
            style={{ marginLeft: "auto", background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 12, display: "flex", alignItems: "center", gap: 4 }}>
            <MicOff size={13} /> Parar
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} style={{ padding: "12px 16px 16px", borderTop: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        {sendError && <div style={{ fontSize: 11, color: "#f87171", marginBottom: 6 }}>{sendError}</div>}
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>

          {/* Paperclip */}
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={recording}
            title="Anexar arquivo"
            style={{ background: "none", border: "none", color: "var(--pandora-ink-400)", cursor: "pointer", padding: 8, borderRadius: 8, display: "flex", alignItems: "center", flexShrink: 0, transition: "color 150ms" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#fff")}
            onMouseLeave={e => (e.currentTarget.style.color = "var(--pandora-ink-400)")}>
            <Paperclip size={18} />
          </button>
          <input ref={fileInputRef} type="file" style={{ display: "none" }}
            accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip,.rar"
            onChange={handleFileChange} />

          {/* Text input */}
          <input type="text" value={text} onChange={e => { setText(e.target.value); setSendError(""); }}
            placeholder={pendingFile ? "Adicionar legenda…" : "Digite uma mensagem…"}
            disabled={sending || recording}
            style={{ flex: 1, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px 14px", color: "#fff", fontSize: 13, outline: "none" }}
          />

          {/* Mic / Send */}
          {!pendingFile && !text.trim() && !recording ? (
            <button type="button" onClick={startRecording} title="Gravar áudio"
              style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <Mic size={16} color="var(--pandora-ink-400)" />
            </button>
          ) : (
            <button type="submit" disabled={!canSend}
              style={{ background: canSend ? "var(--pandora-green-500)" : "rgba(255,255,255,0.08)", border: "none", borderRadius: 10, width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", cursor: canSend ? "pointer" : "not-allowed", transition: "background 150ms", flexShrink: 0 }}>
              <Send size={16} color={canSend ? "#fff" : "var(--pandora-ink-500)"} />
            </button>
          )}
        </div>
      </form>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  );
}

function MessageBubbleContent({ msg }: { msg: Message }) {
  // ── Optimistic sent media (blob URL) ──────────────────────────
  if (msg.mediaKind === "image" && msg.mediaUrl) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={msg.mediaUrl} alt="imagem" style={{ maxWidth: "100%", borderRadius: 8, display: "block" }} />
        {msg.content && msg.content !== msg.mediaName && (
          <div style={{ marginTop: 4, fontSize: 12 }}>{msg.content}</div>
        )}
      </div>
    );
  }
  if (msg.mediaKind === "audio" && msg.mediaUrl) {
    return <audio controls src={msg.mediaUrl} style={{ width: 220, height: 36 }} />;
  }
  if ((msg.mediaKind === "document" || msg.mediaKind === "video") && msg.mediaUrl) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        {msg.mediaKind === "video" ? <ImageIcon size={16} /> : <FileText size={16} />}
        <a href={msg.mediaUrl} download={msg.mediaName} style={{ color: "#fff", fontSize: 12, textDecoration: "underline" }}>
          {msg.mediaName ?? msg.content}
        </a>
      </div>
    );
  }

  // ── Real media from whatsapp_messages (Storage URL) ───────────
  const mt = msg.message_type;
  if (mt === "image" && msg.media_url) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={msg.media_url} alt="imagem" style={{ maxWidth: "100%", borderRadius: 8, display: "block" }} />
        {msg.media_caption && <div style={{ marginTop: 4, fontSize: 12 }}>{msg.media_caption}</div>}
      </div>
    );
  }
  if (mt === "audio" && msg.media_url) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, opacity: 0.7, fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <Music size={10} /> Áudio
          {msg.media_duration ? ` · ${msg.media_duration}s` : ""}
        </div>
        <audio controls src={msg.media_url} style={{ width: 220, height: 36 }} />
        {msg.content && <div style={{ fontSize: 12, marginTop: 2, opacity: 0.8 }}>🎤 {msg.content}</div>}
      </div>
    );
  }
  if (mt === "document" && msg.media_url) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <FileText size={16} />
        <a href={msg.media_url} target="_blank" rel="noopener noreferrer" style={{ color: "#fff", fontSize: 12, textDecoration: "underline" }}>
          {msg.media_filename ?? msg.media_caption ?? "Documento"}
        </a>
      </div>
    );
  }
  if (mt === "video" && msg.media_url) {
    return (
      <div>
        <video controls src={msg.media_url} style={{ maxWidth: "100%", borderRadius: 8 }} />
        {msg.media_caption && <div style={{ marginTop: 4, fontSize: 12 }}>{msg.media_caption}</div>}
      </div>
    );
  }
  if (mt === "sticker" && msg.media_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={msg.media_url} alt="sticker" style={{ width: 100, height: 100, objectFit: "contain" }} />;
  }

  // ── Legacy: received image (N8N description text) ──────────────
  if (msg.kind === "image") {
    return <ReceivedImage description={msg.content} />;
  }

  // ── Legacy: received URL (N8N summary) ────────────────────────
  if (msg.kind === "url") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, opacity: 0.7, fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          <Link2 size={10} /> Link compartilhado
        </div>
        <span style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{msg.content}</span>
      </div>
    );
  }

  // ── Plain text ─────────────────────────────────────────────────
  return <span style={{ whiteSpace: "pre-wrap" }}>{msg.content}</span>;
}

function ReceivedImage({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = description.slice(0, 120);
  const hasMore = description.length > 120;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5, opacity: 0.7, fontSize: 10, fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
        <ImageIcon size={10} /> Imagem
      </div>
      <span style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>
        {expanded ? description : preview}
        {hasMore && !expanded && "…"}
      </span>
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", fontSize: 11, cursor: "pointer", padding: 0, textAlign: "left", textDecoration: "underline" }}
        >
          {expanded ? "Ver menos" : "Ver descrição completa"}
        </button>
      )}
    </div>
  );
}
