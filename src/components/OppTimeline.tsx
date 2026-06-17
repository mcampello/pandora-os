"use client";

import { useMemo, useState } from "react";
import {
  Sparkles, CalendarDays, Video, FileText, History,
  MessageCircle, Mail, StickyNote, LayoutList,
} from "lucide-react";
import type { Interaction, AnalysisSnapshot } from "@/lib/types";

// ─── Filtros por canal ──────────────────────────────────────────────────────

type FilterKey = "all" | "meeting" | "whatsapp" | "email" | "note";

const FILTERS: { key: FilterKey; label: string; icon: React.ElementType; match: (i: Interaction) => boolean }[] = [
  { key: "all",      label: "Tudo",     icon: LayoutList,     match: () => true },
  { key: "meeting",  label: "Reuniões", icon: CalendarDays,   match: (i) => i.type === "meeting" || i.channel === "fathom" || i.channel === "calcom" },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle,  match: (i) => i.channel === "whatsapp" },
  { key: "email",    label: "Email",    icon: Mail,           match: (i) => i.channel === "email" },
  { key: "note",     label: "Notas",    icon: StickyNote,     match: (i) => i.channel === "manual" || i.type === "note" },
];

// ─── Componente principal ───────────────────────────────────────────────────

export function OppTimeline({
  interactions,
  snapshot,
  showSnapshot = true,
}: {
  interactions: Interaction[];
  snapshot?: AnalysisSnapshot | null;
  showSnapshot?: boolean;
}) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: interactions.length, meeting: 0, whatsapp: 0, email: 0, note: 0 };
    for (const i of interactions) {
      for (const f of FILTERS) {
        if (f.key !== "all" && f.match(i)) c[f.key]++;
      }
    }
    return c;
  }, [interactions]);

  const activeFilter = FILTERS.find((f) => f.key === filter)!;
  const filtered = interactions.filter(activeFilter.match);

  type TimelineEntry =
    | { kind: "snapshot"; date: Date; snap: AnalysisSnapshot }
    | { kind: "interaction"; date: Date; item: Interaction };

  const timeline: TimelineEntry[] = [
    ...(showSnapshot && snapshot && filter === "all"
      ? [{ kind: "snapshot" as const, date: new Date(snapshot.created_at), snap: snapshot }]
      : []),
    ...filtered.map((i) => ({ kind: "interaction" as const, date: new Date(i.occurred_at), item: i })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Chips de filtro */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          const n = counts[f.key];
          if (f.key !== "all" && n === 0) return null;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "5px 11px",
                borderRadius: 99, fontSize: 12, cursor: "pointer",
                border: `1px solid ${active ? "var(--pandora-violet-500)" : "var(--pandora-ink-200)"}`,
                background: active ? "var(--pandora-violet-600)" : "transparent",
                color: active ? "#fff" : "var(--pandora-ink-500)",
                fontWeight: active ? 600 : 500,
              }}
            >
              <f.icon size={12} />
              {f.label}
              <span style={{ opacity: 0.7 }}>{n}</span>
            </button>
          );
        })}
      </div>

      {timeline.length === 0 ? (
        <div className="pda-empty" style={{ padding: "40px 0" }}>
          <History />
          <p>Nenhuma atividade {filter !== "all" ? "neste filtro" : "ainda"}.</p>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {/* Linha vertical da timeline */}
          <div style={{ position: "absolute", left: 7, top: 4, bottom: 4, width: 2, background: "var(--pandora-ink-100)" }} />
          {timeline.map((e, idx) =>
            e.kind === "snapshot" ? (
              <SnapshotEntry key={`s-${e.snap.id}`} snap={e.snap} isLatest={idx === 0} />
            ) : (
              <InteractionEntry key={`i-${e.item.id}`} item={e.item} />
            )
          )}
        </div>
      )}
    </div>
  );
}

// ─── Snapshot (resumo IA na timeline) ───────────────────────────────────────

export function SnapshotEntry({ snap, isLatest }: { snap: AnalysisSnapshot; isLatest: boolean }) {
  const [open, setOpen] = useState(false);
  const date = new Date(snap.created_at);

  return (
    <div style={{ display: "flex", gap: 16, paddingBottom: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{
          width: 16, height: 16, borderRadius: "50%", marginTop: 2, zIndex: 1, position: "relative",
          background: isLatest ? "var(--pandora-violet-600)" : "var(--pandora-ink-300)",
          border: `2px solid ${isLatest ? "var(--pandora-violet-200)" : "var(--pandora-ink-100)"}`,
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5, flexWrap: "wrap" }}>
          <Sparkles size={11} color="var(--pandora-violet-500)" />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pandora-ink-400)" }}>
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })} · {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          {isLatest && <span className="pda-badge pda-badge-violet">análise IA</span>}
          {snap.message_count > 0 && (
            <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{snap.message_count} msgs analisadas</span>
          )}
          <button onClick={() => setOpen((v) => !v)} style={{ marginLeft: "auto", fontSize: 11, color: "var(--pandora-violet-600)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
            {open ? "fechar" : "expandir"}
          </button>
        </div>

        {snap.status && (
          <p style={{ fontSize: 13, color: "var(--pandora-ink-600)", margin: 0, lineHeight: 1.5 }}>
            {open ? snap.status : snap.status.slice(0, 140) + (snap.status.length > 140 ? "…" : "")}
          </p>
        )}

        {open && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            {snap.next_steps && snap.next_steps.length > 0 && (
              <div>
                <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Próximos passos (na época)</div>
                <ul style={{ margin: 0, paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
                  {snap.next_steps.map((s, i) => <li key={i} style={{ fontSize: 12, color: "var(--pandora-ink-700)" }}>{s}</li>)}
                </ul>
              </div>
            )}
            {snap.topics && snap.topics.length > 0 && (
              <div>
                <div className="pda-eyebrow" style={{ marginBottom: 6 }}>Temas</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {snap.topics.map((t) => <span key={t} className="pda-badge pda-badge-violet">{t}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Interação (reunião / whatsapp / email / nota) ──────────────────────────

export function InteractionEntry({ item }: { item: Interaction }) {
  const channelColors: Record<string, string> = {
    whatsapp: "#25D366", email: "#EA4335", fathom: "#7C3AED", calcom: "#0070F3", manual: "#857891",
  };
  const date = new Date(item.occurred_at);
  const isMeeting = item.type === "meeting";
  const meta = (item.metadata ?? {}) as Record<string, unknown>;
  const meetUrl     = meta.meet_url as string | null;
  const fathomUrl   = (meta.fathom_url as string | null) ?? null;
  const fathomSum   = meta.fathom_summary as string | null;
  const durationMin = meta.duration_min as number | null;
  const isPast      = date < new Date();

  return (
    <div style={{ display: "flex", gap: 16, paddingBottom: 20 }}>
      <div style={{ flexShrink: 0 }}>
        <div style={{
          width: 16, height: 16, borderRadius: isMeeting ? 4 : "50%", marginTop: 2, zIndex: 1, position: "relative",
          background: channelColors[item.channel] ?? "#aaa",
          border: "2px solid var(--pandora-ink-100)",
        }} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--pandora-ink-400)" }}>
            {date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
            {` · ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          </span>
          {isMeeting
            ? <span style={{ fontSize: 11, color: "#0070F3", display: "flex", alignItems: "center", gap: 3 }}><CalendarDays size={11} /> reunião</span>
            : <span className="pda-badge pda-badge-violet" style={{ textTransform: "lowercase" }}>{item.channel} · {item.type}</span>
          }
          {durationMin && <span style={{ fontSize: 11, color: "var(--pandora-ink-400)" }}>{durationMin}min</span>}
          {isMeeting && !isPast && <span style={{ fontSize: 11, color: "#059669", fontWeight: 600 }}>próxima</span>}
          {meetUrl && (
            <a href={meetUrl} target="_blank" rel="noopener noreferrer" style={{ marginLeft: "auto", fontSize: 11, color: "#0070F3", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
              <Video size={11} /> Meet
            </a>
          )}
          {fathomUrl && (
            <a href={fathomUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: "#7C3AED", display: "flex", alignItems: "center", gap: 3, textDecoration: "none" }}>
              <FileText size={11} /> Transcrição
            </a>
          )}
        </div>

        {item.subject && (
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--pandora-violet-800)", marginBottom: 2 }}>
            {item.external_url
              ? <a href={item.external_url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>{item.subject}</a>
              : item.subject}
          </div>
        )}

        {fathomSum ? (
          <p style={{ fontSize: 12, color: "var(--pandora-ink-600)", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>{fathomSum}</p>
        ) : (item.summary || item.content) ? (
          <p style={{ fontSize: 12, color: "var(--pandora-ink-600)", margin: 0, lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
            {item.summary || item.content}
          </p>
        ) : null}
      </div>
    </div>
  );
}
