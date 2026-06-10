import type { CSSProperties } from "react";
import type { OpportunityStatus, OpportunityChannel, OpportunityConfidence } from "@/lib/types";

export const STATUS_LABEL: Record<OpportunityStatus, string> = {
  nova:         "Nova",
  em_contato:   "Em contato",
  proposta:     "Proposta",
  contrato:     "Contrato",
  operacional:  "Operacional",
  perdida:      "Perdida",
};

export const STATUS_COLOR: Record<OpportunityStatus, string> = {
  nova:        "var(--pandora-violet-600)",
  em_contato:  "#0284c7",
  proposta:    "#7c3aed",
  contrato:    "#d97706",
  operacional: "#059669",
  perdida:     "var(--pandora-ink-400)",
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
  "nova",
  "em_contato",
  "proposta",
  "contrato",
  "operacional",
  "perdida",
];

export const NEXT_STATUS: Partial<Record<OpportunityStatus, OpportunityStatus>> = {
  nova:        "em_contato",
  em_contato:  "proposta",
  proposta:    "contrato",
  contrato:    "operacional",
};

export function qualifiedAtForStatus(
  status: OpportunityStatus,
  currentQualifiedAt?: string | null
): string | undefined {
  if (status === "em_contato" && !currentQualifiedAt) {
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
