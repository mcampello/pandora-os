"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Connector, ConnectorType } from "@/lib/types";
import {
  Mail, MessageCircle, Video, Calendar, Send, DollarSign,
  Plus, RefreshCw, Unplug, CheckCircle2, AlertCircle, Circle
} from "lucide-react";

type CatalogItem = {
  type: ConnectorType;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  placeholder: string;
  mode?: "manual" | "oauth" | "token";
  oauthInitUrl?: string;
  inputLabel?: string;
};

const CATALOG: CatalogItem[] = [
  { type: "gmail",    name: "Gmail",    description: "Monitora emails e detecta oportunidades", icon: Mail,          color: "#EA4335", placeholder: "ex: mario@campello.me",      mode: "oauth", oauthInitUrl: "/api/connectors/gmail/init" },
  { type: "whatsapp", name: "WhatsApp", description: "Envio de mensagens (recebimento via N8N)", icon: MessageCircle, color: "#25D366", placeholder: "Cole aqui o token da instância", mode: "token", inputLabel: "Token da instância uazapi" },
  { type: "fathom",   name: "Fathom",   description: "Importa transcrições e resumos de reuniões", icon: Video,       color: "#7C3AED", placeholder: "ex: Conta principal",        mode: "manual" },
  { type: "calcom",   name: "Cal.com",  description: "Detecta agendamentos como oportunidades",  icon: Calendar,      color: "#0070F3", placeholder: "ex: mario@campello.me",      mode: "manual" },
  { type: "telegram", name: "Telegram", description: "Bot para alertas e interações do agente",  icon: Send,          color: "#2AABEE", placeholder: "ex: @pandora_bot",           mode: "manual" },
  { type: "asaas",    name: "Asaas",    description: "NFs, cobranças e financeiro",               icon: DollarSign,   color: "#00B09B", placeholder: "ex: Pandora Tech",           mode: "manual" },
];

function StatusDot({ status }: { status: Connector["status"] }) {
  if (status === "connected") return <CheckCircle2 size={14} color="var(--color-success)" />;
  if (status === "error")     return <AlertCircle  size={14} color="var(--color-danger)" />;
  return <Circle size={14} color="var(--pandora-ink-400)" />;
}

function StatusLabel({ status }: { status: Connector["status"] }) {
  const map = { connected: "Conectado", disconnected: "Desconectado", error: "Erro" };
  const color = status === "connected" ? "var(--color-success)" : status === "error" ? "var(--color-danger)" : "var(--pandora-ink-400)";
  return <span style={{ fontSize: 12, color }}>{map[status]}</span>;
}

function ConectoresInner() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading]       = useState(true);
  const [adding, setAdding]         = useState<ConnectorType | null>(null);
  const [input, setInput]           = useState("");
  const [saving, setSaving]         = useState(false);
  const [msg, setMsg]               = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const supabase = supabaseBrowser();
  const params   = useSearchParams();
  const connected = params.get("connected");
  const error     = params.get("error");

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("connectors").select("*").order("created_at");
    setConnectors((data as Connector[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addManual() {
    if (!adding || !input.trim()) return;
    setSaving(true);
    await supabase.from("connectors").insert({
      type: adding, label: input.trim(), status: "disconnected",
      metadata: { display: input.trim() },
    });
    setAdding(null); setInput(""); setSaving(false);
    await load();
  }

  async function registerWhatsapp() {
    if (!input.trim()) return;
    setSaving(true); setMsg(null);
    const res = await fetch("/api/connectors/whatsapp/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: input.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg({ kind: "err", text: data.error || "Falha ao validar token" });
      setSaving(false);
      return;
    }
    setMsg({ kind: "ok", text: `Instância registrada: ${data.instance?.profileName || data.instance?.name}` });
    setAdding(null); setInput(""); setSaving(false);
    await load();
  }

  async function remove(id: string) {
    await supabase.from("connectors").delete().eq("id", id);
    await load();
  }

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Conectores</h1>
          <span className="pda-chip">Configurações</span>
        </div>
        <button className="pda-icon-btn" onClick={load} title="Recarregar">
          <RefreshCw size={16} />
        </button>
      </header>

      <div className="pda-content">
        <p style={{ fontSize: 14, color: "var(--pandora-ink-500)", marginBottom: 16, maxWidth: 600 }}>
          Conecte suas contas para que o Pandora OS monitore emails, reuniões, WhatsApp e muito mais.
        </p>

        {(connected || msg?.kind === "ok") && (
          <div style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--color-success)" }}>
            ✓ {connected ? <>Conta <strong>{connected}</strong> conectada</> : msg?.text}
          </div>
        )}
        {(error || msg?.kind === "err") && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "var(--color-danger)" }}>
            {error || msg?.text}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16, marginTop: 16 }}>
          {CATALOG.map((item) => {
            const { type, name, description, icon: Icon, color, placeholder, mode, oauthInitUrl, inputLabel } = item;
            const instances = connectors.filter((c) => c.type === type);
            const isAdding  = adding === type;

            return (
              <div key={type} className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "var(--radius-md)", background: color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Icon size={20} color={color} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--pandora-violet-900)" }}>{name}</div>
                    <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>{description}</div>
                  </div>
                </div>

                {instances.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {instances.map((c) => (
                      <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: "var(--radius-sm)", background: "var(--pandora-ink-25)", border: "1px solid var(--pandora-ink-100)" }}>
                        <StatusDot status={c.status} />
                        <span style={{ flex: 1, fontSize: 13, color: "var(--pandora-violet-800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</span>
                        <StatusLabel status={c.status} />
                        <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", padding: 2, display: "flex" }} title="Remover">
                          <Unplug size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {mode === "oauth" ? (
                  <a href={oauthInitUrl} className="pda-btn" style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
                    <Plus size={14} />
                    Conectar conta Google
                  </a>
                ) : isAdding ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {inputLabel && (
                      <label style={{ fontSize: 11, color: "var(--pandora-ink-500)", fontFamily: "var(--font-display)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        {inputLabel}
                      </label>
                    )}
                    <input
                      autoFocus
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (mode === "token" ? registerWhatsapp() : addManual())}
                      placeholder={placeholder}
                      style={{
                        border: "1px solid var(--pandora-violet-400)",
                        borderRadius: "var(--radius-sm)",
                        padding: "8px 12px",
                        fontSize: 13,
                        fontFamily: mode === "token" ? "var(--font-mono)" : "var(--font-text)",
                        outline: "none",
                        color: "var(--pandora-violet-900)",
                        boxShadow: "var(--shadow-glow)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="pda-btn" style={{ flex: 1, justifyContent: "center" }} onClick={mode === "token" ? registerWhatsapp : addManual} disabled={saving}>
                        {saving ? "Validando…" : (mode === "token" ? "Validar e conectar" : "Adicionar")}
                      </button>
                      <button className="pda-btn pda-btn-ghost" onClick={() => { setAdding(null); setInput(""); setMsg(null); }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="pda-btn pda-btn-ghost"
                    style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}
                    onClick={() => { setAdding(type); setInput(""); setMsg(null); }}
                  >
                    <Plus size={14} />
                    {mode === "token" ? "Conectar instância" : "Adicionar conta"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {loading && <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", marginTop: 24 }}>Carregando…</p>}
      </div>
    </>
  );
}

export default function ConectoresPage() {
  return (
    <Suspense fallback={null}>
      <ConectoresInner />
    </Suspense>
  );
}
