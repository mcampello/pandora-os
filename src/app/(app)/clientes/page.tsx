"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Contact } from "@/lib/types";
import { Plus, Search, Users, Phone, Mail, Building2, RefreshCw, Sparkles } from "lucide-react";

export default function ClientesPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState("");
  const [syncing, setSyncing]   = useState(false);
  const [classifying, setCL]    = useState(false);
  const [toast, setToast]       = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const supabase = supabaseBrowser();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("contacts").select("*").order("updated_at", { ascending: false });
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function syncWhatsapp() {
    setSyncing(true); setToast(null);
    const res = await fetch("/api/contacts/sync-whatsapp", { method: "POST" });
    const data = await res.json();
    if (!res.ok) setToast({ kind: "err", text: data.error || "Falha na sincronização" });
    else setToast({ kind: "ok", text: \`Sincronizado: \${data.created} novos, \${data.updated} atualizados (\${data.total_chats} conversas)\` });
    setSyncing(false);
    await load();
  }

  async function classifyAll() {
    setCL(true); setToast(null);
    const targets = contacts.filter((c) => c.phone && !c.ai_summary).slice(0, 15);
    let ok = 0, err = 0;
    for (const c of targets) {
      try {
        const res = await fetch(\`/api/contacts/\${c.id}/classify\`, { method: "POST" });
        if (res.ok) ok++; else err++;
      } catch { err++; }
    }
    setToast({ kind: "ok", text: \`Classificados: \${ok} OK, \${err} erros (limite 15 por execução)\` });
    setCL(false);
    await load();
  }

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.email, c.phone, c.company, c.role, c.ai_summary, ...(c.tags ?? [])]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [contacts, query]);

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Clientes</h1>
          <span className="pda-chip">{contacts.length} {contacts.length === 1 ? "contato" : "contatos"}</span>
        </div>
        <div className="pda-topbar-right" style={{ gap: 8 }}>
          <button className="pda-btn pda-btn-ghost" onClick={syncWhatsapp} disabled={syncing} title="Importa contatos a partir das conversas privadas em documents">
            <RefreshCw size={14} style={syncing ? { animation: "spin 1s linear infinite" } : {}} />
            {syncing ? "Sincronizando…" : "Sincronizar WhatsApp"}
          </button>
          <button className="pda-btn pda-btn-ghost" onClick={classifyAll} disabled={classifying} title="Classifica até 15 contatos sem análise">
            <Sparkles size={14} />
            {classifying ? "Classificando…" : "Classificar pendentes"}
          </button>
          <Link href="/clientes/novo" className="pda-btn">
            <Plus size={14} /> Novo contato
          </Link>
        </div>
      </header>

      <div className="pda-content">
        {toast && (
          <div style={{
            background: toast.kind === "ok" ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: \`1px solid \${toast.kind === "ok" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}\`,
            borderRadius: "var(--radius-md)", padding: "10px 14px", marginBottom: 16, fontSize: 13,
            color: toast.kind === "ok" ? "var(--color-success)" : "var(--color-danger)",
          }}>{toast.text}</div>
        )}

        <div style={{ position: "relative", marginBottom: 24, maxWidth: 480 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: "var(--pandora-ink-400)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, empresa, telefone, tag…"
            style={{
              width: "100%", padding: "10px 12px 10px 36px",
              border: "1px solid var(--pandora-ink-100)",
              borderRadius: "var(--radius-md)", fontSize: 13,
              fontFamily: "var(--font-text)", outline: "none",
              background: "#fff", color: "var(--pandora-violet-900)",
            }}
          />
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>
        ) : filtered.length === 0 ? (
          <div className="pda-empty">
            <Users />
            <div className="pda-empty-title">Nenhum contato ainda</div>
            <div className="pda-empty-desc">Clique em <strong>Sincronizar WhatsApp</strong> pra importar das suas conversas, ou crie manualmente.</div>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {filtered.map((c) => (
              <Link key={c.id} href={\`/clientes/\${c.id}\`} className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 10, textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Avatar name={c.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--pandora-violet-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name}
                    </div>
                    {(c.role || c.company) && (
                      <div style={{ fontSize: 12, color: "var(--pandora-ink-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.role}{c.role && c.company ? " · " : ""}{c.company}
                      </div>
                    )}
                  </div>
                  {c.source && <span className="pda-badge pda-badge-violet">{c.source}</span>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--pandora-ink-500)" }}>
                  {c.email && <Row icon={<Mail size={12} />}>{c.email}</Row>}
                  {c.phone && <Row icon={<Phone size={12} />}>{c.phone}</Row>}
                  {c.company && !c.role && <Row icon={<Building2 size={12} />}>{c.company}</Row>}
                </div>

                {c.ai_summary && (
                  <p style={{ fontSize: 12, color: "var(--pandora-ink-600)", lineHeight: 1.4, margin: 0, paddingTop: 6, borderTop: "1px solid var(--pandora-ink-100)" }}>
                    {c.ai_summary}
                  </p>
                )}

                {c.tags && c.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.tags.slice(0, 5).map((t) => (
                      <span key={t} className="pda-badge pda-badge-green" style={{ textTransform: "lowercase" }}>{t}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
      <style>{\`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }\`}</style>
    </>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: "var(--pandora-violet-50)", color: "var(--pandora-violet-700)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, flexShrink: 0,
    }}>{initials}</div>
  );
}

function Row({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ display: "flex", color: "var(--pandora-ink-400)" }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{children}</span>
    </div>
  );
}
