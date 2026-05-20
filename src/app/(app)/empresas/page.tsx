"use client";

import { useState, useEffect, useCallback } from "react";
import { Building2, Search, ChevronRight, Users, Briefcase, X } from "lucide-react";

interface CompanyGroup {
  name: string;
  contact_count: number;
}

interface ContactItem {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  source?: string;
}

interface ClientItem {
  id: string;
  company_name: string;
  status: string;
  monthly_fee?: number;
}

interface CompanyDetail extends CompanyGroup {
  contacts: ContactItem[];
  clients: ClientItem[];
}

export default function EmpresasPage() {
  const [companies, setCompanies] = useState<CompanyGroup[]>([]);
  const [selected, setSelected]   = useState<CompanyDetail | null>(null);
  const [loading, setLoading]     = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [q, setQ] = useState("");

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(q.toLowerCase())
  );

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/companies");
    if (res.ok) setCompanies(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function openDetail(company: CompanyGroup) {
    setSelected({ ...company, contacts: [], clients: [] });
    setDetailLoading(true);
    const res = await fetch(`/api/companies/${encodeURIComponent(company.name)}`);
    if (res.ok) setSelected(await res.json());
    setDetailLoading(false);
  }

  return (
    <div className="pda-main">
      <div className="pda-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Building2 size={20} style={{ color: "var(--pandora-violet-400)" }} />
          <h1 style={{ margin: 0, fontSize: 18, fontFamily: "var(--font-display)" }}>Empresas</h1>
          <span className="pda-badge-violet" style={{ fontSize: 11 }}>{companies.length}</span>
        </div>
      </div>

      <div className="pda-content" style={{ display: "flex", gap: 0, padding: 0, height: "calc(100vh - 57px)", overflow: "hidden" }}>
        {/* Lista */}
        <div style={{ flex: selected ? "0 0 360px" : "1", borderRight: "1px solid var(--pandora-ink-100)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--pandora-ink-100)" }}>
            <div style={{ position: "relative" }}>
              <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--pandora-ink-400)" }} />
              <input
                type="text"
                placeholder="Buscar empresa..."
                value={q}
                onChange={e => setQ(e.target.value)}
                style={{
                  width: "100%", padding: "8px 8px 8px 32px",
                  background: "var(--pandora-ink-50)",
                  border: "1px solid var(--pandora-ink-200)", borderRadius: 8,
                  color: "var(--pandora-ink-800)", fontSize: 13, boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div className="pda-empty">Carregando...</div>
            ) : filtered.length === 0 ? (
              <div className="pda-empty">
                <Building2 size={32} />
                <p>{q ? "Nenhuma empresa encontrada" : "Nenhuma empresa cadastrada nos contatos"}</p>
              </div>
            ) : (
              filtered.map(company => (
                <button
                  key={company.name}
                  type="button"
                  onClick={() => openDetail(company)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, width: "100%",
                    padding: "14px 16px",
                    background: selected?.name === company.name ? "var(--pandora-violet-50)" : "transparent",
                    border: "none", borderBottom: "1px solid var(--pandora-ink-100)", cursor: "pointer",
                    textAlign: "left", color: "var(--pandora-ink-800)",
                  }}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: 8, background: "var(--pandora-violet-50)",
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  }}>
                    <Building2 size={16} style={{ color: "var(--pandora-violet-600)" }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {company.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--pandora-ink-500)", marginTop: 2 }}>
                      {company.contact_count} contato{company.contact_count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <ChevronRight size={14} style={{ color: "var(--pandora-ink-400)", flexShrink: 0 }} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* Detalhe */}
        {selected && (
          <div style={{ flex: 1, overflowY: "auto", padding: 24, background: "#fff" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: "var(--pandora-violet-50)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Building2 size={24} style={{ color: "var(--pandora-violet-600)" }} />
                </div>
                <div>
                  <h2 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-display)", color: "var(--pandora-violet-950)" }}>
                    {selected.name}
                  </h2>
                  <div style={{ fontSize: 13, color: "var(--pandora-ink-500)", marginTop: 2 }}>
                    {selected.contact_count} contato{selected.contact_count !== 1 ? "s" : ""}
                  </div>
                </div>
              </div>
              <button className="pda-btn-ghost" onClick={() => setSelected(null)}>
                <X size={14} />
              </button>
            </div>

            {detailLoading ? (
              <div style={{ color: "var(--pandora-ink-500)", fontSize: 13 }}>Carregando...</div>
            ) : (
              <>
                <div className="pda-card" style={{ marginBottom: 16 }}>
                  <div className="pda-eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                    <Users size={12} /> Contatos ({selected.contacts.length})
                  </div>
                  {selected.contacts.length ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {selected.contacts.map(c => (
                        <a
                          key={c.id}
                          href={`/clientes/${c.id}`}
                          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, textDecoration: "none", color: "inherit" }}
                        >
                          <div>
                            <span style={{ fontWeight: 500, color: "var(--pandora-violet-700)" }}>{c.name}</span>
                            {c.role && <span style={{ color: "var(--pandora-ink-400)", marginLeft: 8 }}>{c.role}</span>}
                          </div>
                          {c.email && <span style={{ color: "var(--pandora-ink-500)", fontSize: 12 }}>{c.email}</span>}
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "var(--pandora-ink-500)", fontSize: 13 }}>Nenhum contato encontrado</div>
                  )}
                </div>

                {selected.clients.length > 0 && (
                  <div className="pda-card">
                    <div className="pda-eyebrow" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                      <Briefcase size={12} /> Relacionamento comercial ({selected.clients.length})
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {selected.clients.map(c => (
                        <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13 }}>
                          <span style={{ fontWeight: 500 }}>{c.company_name}</span>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            {c.monthly_fee && (
                              <span style={{ color: "var(--pandora-green-500)", fontSize: 12 }}>
                                R$ {c.monthly_fee.toLocaleString("pt-BR")}
                              </span>
                            )}
                            <span className={`pda-badge-${c.status === "active" ? "success" : c.status === "paused" ? "warning" : "violet"}`} style={{ fontSize: 10 }}>
                              {c.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
