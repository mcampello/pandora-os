import type { CSSProperties } from "react";
import type { OpportunityStatus, OpportunityChannel, OpportunityConfidence } from "@/lib/types";

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  new: "Nova",
  qualified: "Qualificada",
  converted: "Convertida",
  dismissed: "Descartada",
};

export const STATUS_COLOR: Record<OpportunityStatus, string> = {
  new: "var(--pandora-violet-600)",
  qualified: "#0284c7",
  converted: "#059669",
  dismissed: "var(--pandora-ink-400)",
};

export const CHANNEL_LABEL: Record<OpportunityChannel, string> = {
  whatsapp: "WhatsApp",
  email: "Email",
  calcom: "Cal.com",
  manual: "Manual",
  group: "Grupo",
};

export const CONFIDENCE_LABEL: Record<OpportunityConfidence, string> = {
  very_high: "Muito alta",
  high: "Alta",
  medium: "Média",
  low: "Baixa",
};

export const CONFIDENCE_COLOR: Record<OpportunityConfidence, string> = {
  very_high: "#059669",
  high: "#0284c7",
  medium: "#d97706",
  low: "var(--pandora-ink-400)",
};

export const STATUS_COLUMNS: OpportunityStatus[] = [
  "new",
  "qualified",
  "converted",
  "dismissed",
];

/** Próximo status ao avançar no pipeline (null = sem avanço automático). */
export const NEXT_STATUS: Partial<Record<OpportunityStatus, OpportunityStatus>> = {
  new: "qualified",
  qualified: "converted",
};

export function qualifiedAtForStatus(
  status: OpportunityStatus,
  currentQualifiedAt?: string | null
): string | undefined {
  if (status === "qualified" && !currentQualifiedAt) {
    return new Date().toISOString();
  }
  return undefined;
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  if (d === 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 7) return `há ${d} dias`;
  if (d < 30) return `há ${Math.floor(d / 7)} sem`;
  if (d < 365) return `há ${Math.floor(d / 30)} m`;
  return `há ${Math.floor(d / 365)} a`;
}

export const inputStyle: CSSProperties = {
  border: "1px solid var(--pandora-ink-100)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "var(--font-text)",
  outline: "none",
  color: "var(--pandora-violet-900)",
  background: "#fff",
  width: "100%",
};
