"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DollarSign, FileText, TrendingUp, TrendingDown, Minus,
  ExternalLink, Plus, Pencil, Trash2, X, Check,
} from "lucide-react";
import type { ContractFinanceiro, CompanyExpense, CostRecurrence } from "@/lib/types";
import { formatBRL } from "@/lib/docs";

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function billingLabel(type?: string | null) {
  if (type === "mensal") return "Mensal";
  if (type === "fechado") return "Fechado";
  return "—";
}

const RECURRENCE_LABELS: Record<CostRecurrence, string> = {
  mensal: "Mensal",
  anual: "Anual",
  pontual: "Pontual",
};

const CATEGORY_OPTIONS = ["infra", "saas", "serviço", "pessoal", "outro"];

// Converte valor para equivalente mensal (para somar no DRE)
function toMonthly(amount: number, recurrence: CostRecurrence) {
  if (recurrence === "anual") return amount / 12;
  if (recurrence === "pontual") return 0; // não entra no DRE recorrente
  return amount;
}

export default function FinanceiroPage() {
  const router = useRouter();
  const [contracts, setContracts] = useState<ContractFinanceiro[]>([]);
  const [expenses, setExpenses] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState(true);

  // form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "", amount: "", recurrence: "mensal" as CostRecurrence, notes: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cRes, eRes] = await Promise.all([
      fetch("/api/financeiro"),
      fetch("/api/company-expenses?active=true"),
    ]);
    if (cRes.ok) setContracts(await cRes.json());
    if (eRes.ok) setExpenses(await eRes.json());
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const mrr = contracts
    .filter((c) => c.billing_type === "mensal" || !c.billing_type)
    .reduce((s, c) => s + (c.value ?? c.client?.monthly_fee ?? 0), 0);

  const pendingCount = contracts.reduce((s, c) => s + c.pending_invoices, 0);

  const totalExpensesMonthly = expenses
    .filter((e) => e.active)
    .reduce((s, e) => s + toMonthly(e.amount, e.recurrence), 0);

  const result = mrr - totalExpensesMonthly;

  // ── Expense form ──────────────────────────────────────────────────────────
  function openNew() {
    setEditingId(null);
    setForm({ name: "", category: "", amount: "", recurrence: "mensal", notes: "" });
    setShowForm(true);
  }

  function openEdit(e: CompanyExpense) {
    setEditingId(e.id);
    setForm({ name: e.name, category: e.category ?? "", amount: String(e.amount), recurrence: e.recurrence, notes: e.notes ?? "" });
    setShowForm(true);
  }

  async function saveExpense() {
    if (!form.name || !form.amount) return;
    setSaving(true);
    const payload = {
      name: form.name,
      category: form.category || null,
      amount: parseFloat(form.amount),
      recurrence: form.recurrence,
      notes: form.notes || null,
      active: true,
    };
    if (editingId) {
      await fetch(`/api/company-expenses/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    } else {
      await fetch("/api/company-expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    setSaving(false);
    setShowForm(false);
    load();
  }

  async function deleteExpense(id: string) {
    if (!confirm("Remover esta despesa?")) return;
    await fetch(`/api/company-expenses/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="pda-main" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="pda-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-chakra)", fontWeight: 700 }}>Financeiro</h1>
          <span className="pda-chip">{contracts.length} contrato{contracts.length !== 1 ? "s" : ""} ativo{contracts.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      <div className="pda-content" style={{ flex: 1, overflow: "auto" }}>
        {/* DRE / KPI bar */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginBottom: 28 }}>
          <KpiCard
            icon={<TrendingUp size={16} />}
            label="MRR (receita)"
            value={formatBRL(mrr)}
            color="var(--pandora-green-400)"
          />
          <KpiCard
            icon={<TrendingDown size={16} />}
            label="Despesas / mês"
            value={formatBRL(totalExpensesMonthly)}
            color="#f59e0b"
          />
          <KpiCard
            icon={result >= 0 ? <TrendingUp size={16} /> : <Minus size={16} />}
            label="Resultado"
            value={formatBRL(result)}
            color={result >= 0 ? "var(--pandora-green-400)" : "#ef4444"}
          />
          <KpiCard
            icon={<DollarSign size={16} />}
            label="Contratos ativos"
            value={String(contracts.length)}
            color="var(--pandora-violet-600)"
          />
          <KpiCard
            icon={<FileText size={16} />}
            label="NFs pendentes"
            value={String(pendingCount)}
            color={pendingCount > 0 ? "#f59e0b" : "var(--pandora-ink-400)"}
          />
        </div>

        {/* Contratos ativos */}
        <div style={{ marginBottom: 36 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span className="pda-eyebrow">Contratos ativos</span>
          </div>

          {loading ? (
            <p className="pda-empty">Carregando...</p>
          ) : contracts.length === 0 ? (
            <div className="pda-empty">
              <p>Nenhum contrato ativo.</p>
              <a href="/contratos" className="pda-btn" style={{ marginTop: 8 }}>Ver Contratos</a>
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--pandora-ink-100)" }}>
                    {["Empresa", "CNPJ", "Contrato", "Tipo", "Valor", "Vigência", "NFs pendentes", "Total faturado", ""].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontFamily: "var(--font-chakra)", fontSize: 11, fontWeight: 700, color: "var(--pandora-ink-400)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contracts.map((c) => (
                    <tr
                      key={c.id}
                      onClick={() => router.push(`/financeiro/${c.id}`)}
                      style={{ borderBottom: "1px solid var(--pandora-ink-100)", cursor: "pointer", transition: "background 0.1s" }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--pandora-ink-50)"; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; }}
                    >
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--pandora-ink-900)", fontFamily: "var(--font-chakra)" }}>
                        {c.company?.name ?? c.client?.company_name ?? "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--pandora-ink-500)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                        {c.company?.cnpj ?? "—"}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--pandora-ink-700)", maxWidth: 220 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", padding: "2px 8px", borderRadius: 20,
                          background: c.billing_type === "mensal" ? "rgba(122,28,181,0.12)" : "rgba(45,212,160,0.12)",
                          color: c.billing_type === "mensal" ? "var(--pandora-violet-600)" : "var(--pandora-green-400)",
                        }}>
                          {billingLabel(c.billing_type)}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--pandora-ink-900)" }}>
                        {formatBRL(c.value)}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--pandora-ink-500)", fontSize: 12, whiteSpace: "nowrap" }}>
                        {c.starts_at ? `${fmtDate(c.starts_at)} → ${c.ends_at ? fmtDate(c.ends_at) : "∞"}` : "—"}
                      </td>
                      <td style={{ padding: "10px 12px", textAlign: "center" }}>
                        {c.pending_invoices > 0 ? (
                          <span style={{ background: "rgba(245,158,11,0.15)", color: "#f59e0b", borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 700 }}>
                            {c.pending_invoices}
                          </span>
                        ) : (
                          <span style={{ color: "var(--pandora-ink-300)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--pandora-green-400)", fontWeight: 600 }}>
                        {c.total_invoiced > 0 ? formatBRL(c.total_invoiced) : <span style={{ color: "var(--pandora-ink-300)" }}>—</span>}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <ExternalLink size={14} style={{ color: "var(--pandora-ink-300)" }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Despesas da empresa */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <span className="pda-eyebrow">Despesas da Pandora Tech</span>
            <button type="button" className="pda-btn" onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <Plus size={14} /> Nova despesa
            </button>
          </div>

          {showForm && (
            <div className="pda-card" style={{ padding: 16, marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Nome *</label>
                  <input
                    className="pda-input"
                    value={form.name}
                    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="ex: Vercel, GitHub, Claude API"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Categoria</label>
                  <select className="pda-input" value={form.category} onChange={(e) => setForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="">—</option>
                    {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Valor (R$) *</label>
                  <input
                    className="pda-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.amount}
                    onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Recorrência</label>
                  <select className="pda-input" value={form.recurrence} onChange={(e) => setForm(f => ({ ...f, recurrence: e.target.value as CostRecurrence }))}>
                    <option value="mensal">Mensal</option>
                    <option value="anual">Anual</option>
                    <option value="pontual">Pontual</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-400)", display: "block", marginBottom: 4 }}>Notas</label>
                <input className="pda-input" value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observações opcionais" />
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="pda-btn" onClick={saveExpense} disabled={saving} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Check size={14} /> {saving ? "Salvando..." : "Salvar"}
                </button>
                <button type="button" className="pda-btn-ghost" onClick={() => setShowForm(false)} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <X size={14} /> Cancelar
                </button>
              </div>
            </div>
          )}

          {!loading && expenses.length === 0 && !showForm ? (
            <p className="pda-empty" style={{ marginTop: 8 }}>Nenhuma despesa cadastrada.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1.5px solid var(--pandora-ink-100)" }}>
                    {["Nome", "Categoria", "Valor", "Recorrência", "Mensal equiv.", "Notas", ""].map((h) => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontFamily: "var(--font-chakra)", fontSize: 11, fontWeight: 700, color: "var(--pandora-ink-400)", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {expenses.map((e) => (
                    <tr key={e.id} style={{ borderBottom: "1px solid var(--pandora-ink-100)" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--pandora-ink-900)" }}>{e.name}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {e.category ? (
                          <span className="pda-chip" style={{ fontSize: 11 }}>{e.category}</span>
                        ) : (
                          <span style={{ color: "var(--pandora-ink-300)" }}>—</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "var(--pandora-ink-900)" }}>
                        {formatBRL(e.amount)}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--pandora-ink-500)", fontSize: 12 }}>
                        {RECURRENCE_LABELS[e.recurrence]}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--pandora-green-400)", fontWeight: 600, fontSize: 12 }}>
                        {e.recurrence === "pontual" ? <span style={{ color: "var(--pandora-ink-300)" }}>—</span> : formatBRL(toMonthly(e.amount, e.recurrence))}
                      </td>
                      <td style={{ padding: "10px 12px", color: "var(--pandora-ink-400)", fontSize: 12, maxWidth: 200 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {e.notes ?? "—"}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button type="button" className="pda-btn-ghost" onClick={() => openEdit(e)} style={{ padding: "4px 8px" }}>
                            <Pencil size={13} />
                          </button>
                          <button type="button" className="pda-btn-ghost" onClick={() => deleteExpense(e.id)} style={{ padding: "4px 8px", color: "#ef4444" }}>
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {expenses.length > 0 && (
                  <tfoot>
                    <tr style={{ borderTop: "1.5px solid var(--pandora-ink-100)" }}>
                      <td colSpan={4} style={{ padding: "10px 12px", fontFamily: "var(--font-chakra)", fontSize: 11, fontWeight: 700, color: "var(--pandora-ink-400)", textTransform: "uppercase" }}>Total mensal</td>
                      <td style={{ padding: "10px 12px", fontWeight: 800, color: "#f59e0b", fontFamily: "var(--font-chakra)" }}>
                        {formatBRL(totalExpensesMonthly)}
                      </td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="pda-card" style={{ padding: "14px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, color }}>
        {icon}
        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "var(--font-chakra)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-900)" }}>{value}</div>
    </div>
  );
}
