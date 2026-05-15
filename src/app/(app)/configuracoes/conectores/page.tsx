"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Connector, ConnectorType } from "@/lib/types";
import {
  Mail, MessageCircle, Video, Calendar, Send, DollarSign,
  Plus, RefreshCw, Unplug, CheckCircle2, AlertCircle, Circle
} from "lucide-react";

const CATALOG: {
  type: ConnectorType;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
  placeholder: string;
}[] = [
  { type: "gmail",    name: "Gmail",    description: "Monitora emails e detecta oportunidades", icon: Mail,          color: "#EA4335", placeholder: "ex: mario@campello.me" },
  { type: "whatsapp", name: "WhatsApp", description: "Lê conversas via uazapi.dev",              icon: MessageCircle, color: "#25D366", placeholder: "ex: +55 11 99999-9999" },
  { type: "fathom",   name: "Fathom",   description: "Importa transcrições e resumos de reuniões", icon: Video,       color: "#7C3AED", placeholder: "ex: Conta principal" },
  { type: "calcom",   name: "Cal.com",  description: "Detecta agendamentos como oportunidades",  icon: Calendar,      color: "#0070F3", placeholder: "ex: mario@campello.me" },
  { type: "telegram", name: "Telegram", description: "Bot para alertas e interações do agente",  icon: Send,          color: "#2AABEE", placeholder: "ex: @pandora_bot" },
  { type: "asaas",    name: "Asaas",    description: "NFs, cobranças e financeiro",               icon: DollarSign,   color: "#00B09B", placeholder: "ex: Pandora Tech" },
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

export default function ConectoresPage() {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [loading, setLoading]       = useState(true);
  const [adding, setAdding]         = useState<ConnectorType | null>(null);
  const [label, setLabel]           = useState("");
  const [saving, setSaving]         = useState(false);
  const supabase = supabaseBrowser();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("connectors").select("*").order("created_at");
    setConnectors((data as Connector[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function add() {
    if (!adding || !label.trim()) return;
    setSaving(true);
    await supabase.from("connectors").insert({
      type: adding,
      label: label.trim(),
      status: "disconnected",
      metadata: { display: label.trim() },
    });
    setAdding(null);
    setLabel("");
    setSaving(false);
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
        <p style={{ fontSize: 14, color: "var(--pandora-ink-500)", marginBottom: 32, maxWidth: 600 }}>
          Conecte suas contas para que o Pandora OS monitore emails, reuniões, WhatsApp e muito mais.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
          {CATALOG.map(({ type, name, description, icon: Icon, color, placeholder }) => {
            const instances = connectors.filter((c) => c.type === type);
            const isAdding  = adding === type;

            return (
              <div key={type} className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "var(--radius-md)",
                    background: color + "18",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon size={20} color={color} strokeWidth={1.5} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "var(--pandora-violet-900)" }}>
                      {name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pandora-ink-400)", marginTop: 2 }}>{description}</div>
                  </div>
                </div>

                {instances.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {instances.map((c) => (
                      <div key={c.id} style={{
                        display: "flex", alignItems: "center", gap: 8,
                        padding: "8px 10px", borderRadius: "var(--radius-sm)",
                        background: "var(--pandora-ink-25)",
                        border: "1px solid var(--pandora-ink-100)",
                      }}>
                        <StatusDot status={c.status} />
                        <span style={{ flex: 1, fontSize: 13, color: "var(--pandora-violet-800)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {c.label}
                        </span>
                        <StatusLabel status={c.status} />
                        <button
                          onClick={() => remove(c.id)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--pandora-ink-400)", padding: 2, display: "flex" }}
                          title="Remover"
                        >
                          <Unplug size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {isAdding ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <input
                      autoFocus
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && add()}
                      placeholder={placeholder}
                      style={{
                        border: "1px solid var(--pandora-violet-400)",
                        borderRadius: "var(--radius-sm)",
                        padding: "8px 12px",
                        fontSize: 13,
                        fontFamily: "var(--font-text)",
                        outline: "none",
                        color: "var(--pandora-violet-900)",
                        boxShadow: "var(--shadow-glow)",
                      }}
                    />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="pda-btn" style={{ flex: 1, justifyContent: "center" }} onClick={add} disabled={saving}>
                        {saving ? "Salvando…" : "Adicionar"}
                      </button>
                      <button className="pda-btn pda-btn-ghost" onClick={() => { setAdding(null); setLabel(""); }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    className="pda-btn pda-btn-ghost"
                    style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}
                    onClick={() => { setAdding(type); setLabel(""); }}
                  >
                    <Plus size={14} />
                    Adicionar conta
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {loading && (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-400)", marginTop: 24 }}>Carregando…</p>
        )}
      </div>
    </>
  );
}
