"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase-browser";
import type { Contact } from "@/lib/types";
import { Plus, Search, Users, Phone, Mail, Building2 } from "lucide-react";

export default function ClientesPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading]   = useState(true);
  const [query, setQuery]       = useState("");
  const supabase = supabaseBrowser();

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("contacts").select("*").order("updated_at", { ascending: false });
    setContacts((data as Contact[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return contacts;
    return contacts.filter((c) =>
      [c.name, c.email, c.phone, c.company, c.role].some((v) => v?.toLowerCase().includes(q))
    );
  }, [contacts, query]);

  return (
    <>
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Clientes</h1>
          <span className="pda-chip">{contacts.length} {contacts.length === 1 ? "contato" : "contatos"}</span>
        </div>
        <div className="pda-topbar-right">
          <Link href="/clientes/novo" className="pda-btn">
            <Plus size={14} /> Novo contato
          </Link>
        </div>
      </header>

      <div className="pda-content">
        {/* Busca */}
        <div style={{ position: "relative", marginBottom: 24, maxWidth: 480 }}>
          <Search size={16} style={{ position: "absolute", left: 12, top: 11, color: "var(--pandora-ink-400)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, empresa, email ou telefone…"
            style={{
              width: "100%",
              padding: "10px 12px 10px 36px",
              border: "1px solid var(--pandora-ink-100)",
              borderRadius: "var(--radius-md)",
              fontSize: 13,
              fontFamily: "var(--font-text)",
              outline: "none",
              background: "#fff",
              color: "var(--pandora-violet-900)",
            }}
          />
        </div>

        {loading ? (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-400)" }}>Carregando…</p>
        ) : filtered.length === 0 ? (
          <div className="pda-empty">
            <Users />
            <div className="pda-empty-title">Nenhum contato ainda</div>
            <div className="pda-empty-desc">
              Adicione seu primeiro contato — pode ser um prospect, cliente ativo ou indicação.
            </div>
            <Link href="/clientes/novo" className="pda-btn" style={{ marginTop: 8 }}>
              <Plus size={14} /> Novo contato
            </Link>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 16 }}>
            {filtered.map((c) => (
              <Link key={c.id} href={`/clientes/${c.id}`} className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 12, textDecoration: "none", color: "inherit" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <Avatar name={c.name} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 600, color: "var(--pandora-violet-900)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {c.name}
                    </div>
                    {c.role && (
                      <div style={{ fontSize: 12, color: "var(--pandora-ink-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.role}{c.company ? ` · ${c.company}` : ""}
                      </div>
                    )}
                    {!c.role && c.company && (
                      <div style={{ fontSize: 12, color: "var(--pandora-ink-500)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {c.company}
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

                {c.tags && c.tags.length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {c.tags.slice(0, 4).map((t) => (
                      <span key={t} className="pda-badge pda-badge-green" style={{ textTransform: "lowercase" }}>{t}</span>
                    ))}
                  </div>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map((s) => s[0]).join("").toUpperCase();
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      background: "var(--pandora-violet-50)",
      color: "var(--pandora-violet-700)",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13,
      flexShrink: 0,
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
