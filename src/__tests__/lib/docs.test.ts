import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  formatBRL,
  fmtDate,
  applyDynamicTokens,
  unescapeDocTokens,
  proposalViewerUrl,
  contractViewerUrl,
  PROPOSAL_STATUS_LABEL,
  PROPOSAL_STATUS_COLOR,
  CONTRACT_STATUS_LABEL,
  CONTRACT_STATUS_COLOR,
} from "@/lib/docs";
import type { ProposalStatus, ContractStatus } from "@/lib/types";

// ── formatBRL ──────────────────────────────────────────────────────────────

describe("formatBRL", () => {
  it("formats positive values as BRL currency", () => {
    const result = formatBRL(1500);
    expect(result).toMatch(/R\$\s*1\.500,00/);
  });

  it("formats zero", () => {
    const result = formatBRL(0);
    expect(result).toMatch(/R\$\s*0,00/);
  });

  it("formats decimal values", () => {
    const result = formatBRL(99.5);
    expect(result).toMatch(/99,50/);
  });

  it("returns em-dash for null", () => {
    expect(formatBRL(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(formatBRL(undefined)).toBe("—");
  });
});

// ── fmtDate ────────────────────────────────────────────────────────────────

describe("fmtDate", () => {
  it("formats an ISO date string to dd/mm/yyyy", () => {
    const result = fmtDate("2025-01-15T00:00:00Z");
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it("returns em-dash for null", () => {
    expect(fmtDate(null)).toBe("—");
  });

  it("returns em-dash for undefined", () => {
    expect(fmtDate(undefined)).toBe("—");
  });

  it("returns em-dash for empty string", () => {
    expect(fmtDate("")).toBe("—");
  });
});

// ── applyDynamicTokens ────────────────────────────────────────────────────

describe("applyDynamicTokens", () => {
  it("replaces [[DATA_ATUAL_EXTENSO]] with a Portuguese date string", () => {
    const result = applyDynamicTokens("Emitido em [[DATA_ATUAL_EXTENSO]].");
    expect(result).not.toContain("[[DATA_ATUAL_EXTENSO]]");
    // Should contain a year (current year)
    expect(result).toContain(new Date().getFullYear().toString());
  });

  it("replaces [data] token", () => {
    const result = applyDynamicTokens("Assinado em [data].");
    expect(result).not.toContain("[data]");
    expect(result).toContain(new Date().getFullYear().toString());
  });

  it("handles [data] followed by extenso date pattern", () => {
    const result = applyDynamicTokens("[data] de janeiro de 2020");
    expect(result).not.toContain("[data]");
  });

  it("leaves unrelated text unchanged", () => {
    const result = applyDynamicTokens("Sem tokens aqui.");
    expect(result).toBe("Sem tokens aqui.");
  });

  it("replaces multiple occurrences", () => {
    const result = applyDynamicTokens(
      "[[DATA_ATUAL_EXTENSO]] e também [[DATA_ATUAL_EXTENSO]]"
    );
    const parts = result.split(" e também ");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toBe(parts[1]);
  });
});

// ── unescapeDocTokens ─────────────────────────────────────────────────────
// O serializador de markdown do editor (prosemirror-markdown) escapa `[` e `]`
// como `\[` `\]`. unescapeDocTokens restaura os tokens dinâmicos para a forma crua.

describe("unescapeDocTokens", () => {
  it("restores escaped [[DATA_ATUAL_EXTENSO]]", () => {
    // forma exata que o serializador produz (underscores entre letras NÃO são escapados)
    const escaped = "Emitido em \\[\\[DATA_ATUAL_EXTENSO\\]\\].";
    expect(unescapeDocTokens(escaped)).toBe("Emitido em [[DATA_ATUAL_EXTENSO]].");
  });

  it("restores escaped [data]", () => {
    expect(unescapeDocTokens("Assinado em \\[data\\].")).toBe("Assinado em [data].");
  });

  it("restores escaped [ data de janeiro de 2020 ]", () => {
    expect(unescapeDocTokens("\\[ data de janeiro de 2020 \\]")).toBe("[ data de janeiro de 2020 ]");
  });

  it("leaves already-clean tokens unchanged", () => {
    const clean = "[[DATA_ATUAL_EXTENSO]] e [data]";
    expect(unescapeDocTokens(clean)).toBe(clean);
  });

  it("end-to-end: escaped token survives serialização e vira data no applyDynamicTokens", () => {
    const fromEditor = "Documento de \\[\\[DATA_ATUAL_EXTENSO\\]\\] válido.";
    const restored = unescapeDocTokens(fromEditor);
    const final = applyDynamicTokens(restored);
    expect(final).not.toContain("DATA_ATUAL_EXTENSO");
    expect(final).not.toContain("\\[");
    expect(final).toContain(new Date().getFullYear().toString());
  });

  it("não toca em colchetes escapados que não são tokens", () => {
    const other = "ver nota \\[1\\] abaixo";
    expect(unescapeDocTokens(other)).toBe(other);
  });
});

// ── Viewer URLs ────────────────────────────────────────────────────────────

describe("proposalViewerUrl", () => {
  it("generates a URL with the proposal id", () => {
    const url = proposalViewerUrl("abc-123");
    expect(url).toContain("/view/p/abc-123");
  });

  it("uses NEXT_PUBLIC_APP_URL when set", () => {
    const url = proposalViewerUrl("abc-123");
    expect(url).toContain("app.campello.me");
  });

  it("falls back to default domain when env is not set", () => {
    const saved = process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    const url = proposalViewerUrl("xyz");
    expect(url).toContain("app.campello.me");
    process.env.NEXT_PUBLIC_APP_URL = saved;
  });
});

describe("contractViewerUrl", () => {
  it("generates a URL with the contract id", () => {
    const url = contractViewerUrl("def-456");
    expect(url).toContain("/view/c/def-456");
  });

  it("uses /view/c/ path (different from proposals /view/p/)", () => {
    const pUrl = proposalViewerUrl("id");
    const cUrl = contractViewerUrl("id");
    expect(pUrl).toContain("/view/p/");
    expect(cUrl).toContain("/view/c/");
    expect(pUrl).not.toEqual(cUrl);
  });
});

// ── Status labels / colors coverage ───────────────────────────────────────

describe("PROPOSAL_STATUS_LABEL", () => {
  const statuses: ProposalStatus[] = [
    "draft", "sent", "viewed", "accepted", "rejected", "expired",
  ];

  it.each(statuses)("has a label for status '%s'", (s) => {
    expect(PROPOSAL_STATUS_LABEL[s]).toBeTruthy();
    expect(typeof PROPOSAL_STATUS_LABEL[s]).toBe("string");
  });

  it.each(statuses)("has a color for status '%s'", (s) => {
    expect(PROPOSAL_STATUS_COLOR[s]).toBeTruthy();
  });
});

describe("CONTRACT_STATUS_LABEL", () => {
  const statuses: ContractStatus[] = [
    "draft", "in_review", "signed", "active", "ended", "cancelled",
  ];

  it.each(statuses)("has a label for status '%s'", (s) => {
    expect(CONTRACT_STATUS_LABEL[s]).toBeTruthy();
    expect(typeof CONTRACT_STATUS_LABEL[s]).toBe("string");
  });

  it.each(statuses)("has a color for status '%s'", (s) => {
    expect(CONTRACT_STATUS_COLOR[s]).toBeTruthy();
  });
});
