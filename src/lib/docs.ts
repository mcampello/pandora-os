import type { CSSProperties } from "react";
import type { ProposalStatus, ContractStatus } from "@/lib/types";

// ── Labels ──────────────────────────────────────────
export const PROPOSAL_STATUS_LABEL: Record<ProposalStatus, string> = {
  draft:    "Rascunho",
  sent:     "Enviada",
  viewed:   "Visualizada",
  accepted: "Aceita",
  rejected: "Recusada",
  expired:  "Expirada",
};

export const PROPOSAL_STATUS_COLOR: Record<ProposalStatus, string> = {
  draft:    "var(--pandora-ink-400)",
  sent:     "var(--pandora-violet-600)",
  viewed:   "#0284c7",
  accepted: "#059669",
  rejected: "var(--color-danger)",
  expired:  "#d97706",
};

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft:     "Rascunho",
  in_review: "Em revisão",
  signed:    "Assinado",
  active:    "Ativo",
  ended:     "Encerrado",
  cancelled: "Cancelado",
};

export const CONTRACT_STATUS_COLOR: Record<ContractStatus, string> = {
  draft:     "var(--pandora-ink-400)",
  in_review: "#d97706",
  signed:    "var(--pandora-violet-600)",
  active:    "#059669",
  ended:     "var(--pandora-ink-500)",
  cancelled: "var(--color-danger)",
};

// ── Viewer URL ────────────────────────────────────────
export function proposalViewerUrl(id: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.campello.me"}/view/p/${id}`;
}

export function contractViewerUrl(id: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.campello.me"}/view/c/${id}`;
}

// ── Dynamic tokens ────────────────────────────────────
export function applyDynamicTokens(md: string): string {
  const now = new Date();
  const longDate = now.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return md
    .replace(/\[\[DATA_ATUAL_EXTENSO\]\]/g, longDate)
    .replace(/\[\s*data\s*\](?:\s*de\s*[A-Za-zÀ-ÿ]+\s*de\s*\d{4})?/gi, longDate);
}

// ── Shared input style ────────────────────────────────
export const inputStyle: CSSProperties = {
  border: "1px solid var(--pandora-ink-200)",
  borderRadius: "var(--radius-sm)",
  padding: "9px 12px",
  fontSize: 13,
  fontFamily: "var(--font-text)",
  outline: "none",
  color: "var(--pandora-ink-800)",
  background: "var(--pandora-ink-0)",
  width: "100%",
};

// ── Format currency ───────────────────────────────────
export function formatBRL(value: number | null | undefined): string {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Time helpers ──────────────────────────────────────
export function fmtDate(iso: string | undefined | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}
