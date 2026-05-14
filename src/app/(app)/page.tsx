import { Users, Zap, FileText, Wallet, TrendingUp, Clock } from "lucide-react";

const stats = [
  { label: "Clientes ativos",    value: "3",     sub: "cap. máx 5",        icon: Users,      dot: "pda-dot-green" },
  { label: "Oportunidades",      value: "—",     sub: "nenhuma detectada",  icon: Zap,        dot: "pda-dot-gray" },
  { label: "Propostas abertas",  value: "—",     sub: "nenhuma pendente",   icon: FileText,   dot: "pda-dot-gray" },
  { label: "Receita mensal",     value: "—",     sub: "aguardando dados",   icon: Wallet,     dot: "pda-dot-amber" },
];

const recentActivity = [
  { time: "Agora",      text: "Sistema inicializado",              type: "system" },
  { time: "Em breve",   text: "Monitoramento WhatsApp conectado",  type: "pending" },
  { time: "Em breve",   text: "Email mario@ sincronizado",         type: "pending" },
];

export default function DashboardPage() {
  return (
    <>
      {/* Top bar */}
      <header className="pda-topbar">
        <div className="pda-topbar-left">
          <h1 className="pda-topbar-title">Dashboard</h1>
          <span className="pda-chip">Pandora OS</span>
        </div>
        <div className="pda-topbar-right">
          <span style={{ fontFamily: "var(--font-display)", fontSize: 12, color: "var(--pandora-ink-400)" }}>
            {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" })}
          </span>
        </div>
      </header>

      {/* Content */}
      <div className="pda-content">
        {/* Stats grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 32 }}>
          {stats.map(({ label, value, sub, icon: Icon, dot }) => (
            <div key={label} className="pda-card" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span className="pda-eyebrow">{label}</span>
                <div style={{ color: "var(--pandora-violet-400)", opacity: 0.7 }}>
                  <Icon size={16} strokeWidth={1.5} />
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 32, fontWeight: 600, color: "var(--pandora-violet-900)", lineHeight: 1 }}>
                  {value}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span className={`pda-dot ${dot}`} />
                <span style={{ fontSize: 12, color: "var(--pandora-ink-400)" }}>{sub}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Two columns */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Activity feed */}
          <div className="pda-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <Clock size={14} color="var(--pandora-violet-500)" strokeWidth={1.5} />
              <span className="pda-eyebrow">Atividade recente</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {recentActivity.map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  padding: "10px 0",
                  borderBottom: i < recentActivity.length - 1 ? "1px solid var(--pandora-ink-100)" : "none"
                }}>
                  <span style={{ fontSize: 11, color: "var(--pandora-ink-400)", fontFamily: "var(--font-mono)", whiteSpace: "nowrap", marginTop: 1 }}>
                    {item.time}
                  </span>
                  <span style={{ fontSize: 13, color: item.type === "system" ? "var(--pandora-violet-800)" : "var(--pandora-ink-400)" }}>
                    {item.text}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Quick access */}
          <div className="pda-card">
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
              <TrendingUp size={14} color="var(--pandora-violet-500)" strokeWidth={1.5} />
              <span className="pda-eyebrow">Próximos passos</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "Conectar Supabase ao sistema",
                "Configurar monitoramento de email",
                "Integrar WhatsApp via uazapi",
                "Configurar Telegram Bot",
                "Adicionar clientes ativos",
              ].map((step, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "8px 0",
                  borderBottom: i < 4 ? "1px solid var(--pandora-ink-100)" : "none"
                }}>
                  <span style={{
                    width: 20, height: 20, borderRadius: "50%",
                    background: "var(--pandora-violet-50)",
                    color: "var(--pandora-violet-600)",
                    fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 600,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: "var(--pandora-ink-600)" }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
