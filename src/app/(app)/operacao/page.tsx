"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Client, Deliverable, HoursEntry } from "@/lib/types";
import { formatBRL } from "@/lib/docs";

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function fmtMonth(d: Date) {
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function healthColor(score?: number | null) {
  if (!score) return "var(--pandora-ink-300)";
  if (score >= 8) return "var(--pandora-green-400)";
  if (score >= 5) return "#f59e0b";
  return "#ef4444";
}

function hoursColor(logged: number, target?: number | null) {
  if (!target) return "var(--pandora-ink-300)";
  const pct = logged / target;
  if (pct >= 0.8) return "var(--pandora-green-400)";
  if (pct >= 0.4) return "#f59e0b";
  return "var(--pandora-ink-300)";
}

export default function OperacaoPage() {
  const router = useRouter();
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const loadClients = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/clients?status=active");
    if (res.ok) setClients(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { loadClients(); }, [loadClients]);

  return (
    <div className="pda-main" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="pda-topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontFamily: "var(--font-chakra)", fontWeight: 700 }}>Operação</h1>
          <div style={{ display: "flex", alignItems: "center", gap: 6, background: "var(--pandora-ink-100)", borderRadius: 8, padding: "4px 10px" }}>
            <button className="pda-btn-ghost" style={{ padding: "2px 6px", minWidth: 0 }}
              onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>
              <ChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 13, fontWeight: 600, minWidth: 140, textAlign: "center", textTransform: "capitalize" }}>
              {fmtMonth(month)}
            </span>
            <button className="pda-btn-ghost" style={{ padding: "2px 6px", minWidth: 0 }}
              onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
        <span className="pda-chip">{clients.length} ativos</span>
      </div>

      <div className="pda-content" style={{ flex: 1, overflow: "auto" }}>
        {loading ? (
          <p className="pda-empty">Carregando clientes...</p>
        ) : clients.length === 0 ? (
          <div className="pda-empty">
            <p>Nenhum cliente ativo.</p>
            <a href="/clientes" className="pda-btn" style={{ marginTop: 8 }}>Ver Clientes</a>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {clients.map(c => (
              <ClientCard
                key={c.id}
                client={c}
                month={month}
                onClick={() => router.push(`/operacao/${c.id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ClientCard({ client, month, onClick }: { client: Client; month: Date; onClick: () => void }) {
  const [summary, setSummary] = useState<{ deliverables: number; done: number; hours: number; initiatives: number } | null>(null);

  useEffect(() => {
    const mk = monthKey(month);
    Promise.all([
      fetch(`/api/deliverables?client_id=${client.id}&month=${mk}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/hours?client_id=${client.id}&month=${mk}`).then(r => r.ok ? r.json() : []),
      fetch(`/api/initiatives?client_id=${client.id}`).then(r => r.ok ? r.json() : []),
    ]).then(([deliverables, hours, initiatives]: [Deliverable[], HoursEntry[], { status: string }[]]) => {
      setSummary({
        deliverables: deliverables.length,
        done: deliverables.filter(d => d.done).length,
        hours: hours.reduce((s, e) => s + Number(e.hours), 0),
        initiatives: initiatives.filter(i => i.status === "active").length,
      });
    });
  }, [client.id, month]);

  return (
    <div
      onClick={onClick}
      style={{
        background: "var(--pandora-ink-0)",
        border: "1.5px solid var(--pandora-ink-100)",
        borderRadius: 12, padding: 18, cursor: "pointer", transition: "border-color 0.15s",
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--pandora-violet-400)"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = "var(--pandora-ink-100)"; }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "var(--font-chakra)", color: "var(--pandora-ink-900)" }}>
          {client.company_name}
        </span>
        {client.health_score && (
          <span style={{
            background: healthColor(client.health_score), color: "#fff",
            borderRadius: 20, fontSize: 12, fontWeight: 800, padding: "2px 10px",
            fontFamily: "var(--font-chakra)",
          }}>
            {client.health_score}
          </span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <Row label="Fee" value={formatBRL(client.monthly_fee)} />
        <Row
          label="Horas"
          value={summary ? `${summary.hours.toFixed(1)}h${client.dedication_hours ? ` / ${client.dedication_hours}h` : ""}` : "—"}
          valueColor={summary ? hoursColor(summary.hours, client.dedication_hours) : undefined}
        />
        <Row
          label="Iniciativas ativas"
          value={summary != null ? String(summary.initiatives) : "—"}
        />
        <Row
          label="Entregas"
          value={summary != null ? `${summary.done}/${summary.deliverables}` : "—"}
        />
      </div>
    </div>
  );
}

function Row({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
      <span style={{ color: "var(--pandora-ink-400)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: valueColor ?? "var(--pandora-ink-700)" }}>{value}</span>
    </div>
  );
}
