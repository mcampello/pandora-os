import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, ok, err } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));

import { supabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { GET as listContracts, POST as createContract } from "@/app/api/contracts/route";
import {
  GET as getContract,
  PATCH as patchContract,
  DELETE as deleteContract,
} from "@/app/api/contracts/[id]/route";

const CLIENT_ID = "client-uuid-001";
const OPP_ID = "opp-uuid-002";
const CONTRACT_ID = "contract-uuid-001";

function makeContract(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTRACT_ID,
    title: "Contrato de Prestação de Serviços",
    content_md: null,
    value: 12000,
    status: "draft",
    client_id: CLIENT_ID,
    opportunity_id: OPP_ID,
    contract_group_id: "cg-001",
    version: 1,
    viewer_url: `https://app.campello.me/view/c/${CONTRACT_ID}`,
    signed_at: null,
    viewed_at: null,
    starts_at: "2025-02-01",
    ends_at: "2026-01-31",
    signature_provider: null,
    signature_external_id: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    client: { id: CLIENT_ID, company_name: "Nasajon", status: "active" },
    opportunity: { id: OPP_ID, title: "ERP Nasajon", status: "qualified" },
    ...overrides,
  };
}

function req(url: string, options: { method?: string; body?: unknown } = {}): NextRequest {
  return new NextRequest(url, {
    method: options.method ?? "GET",
    ...(options.body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(options.body) }
      : {}),
  });
}

// ── GET /api/contracts ─────────────────────────────────────────────────────

describe("GET /api/contracts", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(supabaseServer).mockResolvedValue(createSupabaseMock([], null) as never);
    const res = await listContracts(req("http://localhost/api/contracts"));
    expect(res.status).toBe(401);
  });

  it("returns all contracts with embedded client and opportunity", async () => {
    const mock = createSupabaseMock([ok([makeContract()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listContracts(req("http://localhost/api/contracts"));
    expect(res.status).toBe(200);
    const [c] = await res.json();
    expect(c.client).toMatchObject({ company_name: "Nasajon" });
    expect(c.opportunity).toMatchObject({ title: "ERP Nasajon" });
  });

  it("filters by client_id", async () => {
    const mock = createSupabaseMock([ok([makeContract()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listContracts(req(`http://localhost/api/contracts?client_id=${CLIENT_ID}`));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "client_id" && args[1] === CLIENT_ID)).toBe(true);
  });

  it("filters by opportunity_id", async () => {
    const mock = createSupabaseMock([ok([makeContract()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listContracts(req(`http://localhost/api/contracts?opportunity_id=${OPP_ID}`));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "opportunity_id" && args[1] === OPP_ID)).toBe(true);
  });

  it("filters by group_id using contract_group_id field", async () => {
    const mock = createSupabaseMock([ok([makeContract()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listContracts(req("http://localhost/api/contracts?group_id=cg-001"));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "contract_group_id" && args[1] === "cg-001")).toBe(true);
  });
});

// ── POST /api/contracts ────────────────────────────────────────────────────

describe("POST /api/contracts", () => {
  it("returns 400 when title is missing", async () => {
    const mock = createSupabaseMock([]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createContract(
      req("http://localhost/api/contracts", { method: "POST", body: {} })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("title");
  });

  it("creates contract with client_id, opportunity_id and date range", async () => {
    const created = makeContract();
    const mock = createSupabaseMock([ok(created), ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createContract(
      req("http://localhost/api/contracts", {
        method: "POST",
        body: {
          title: "Contrato de Prestação de Serviços",
          client_id: CLIENT_ID,
          opportunity_id: OPP_ID,
          value: 12000,
          starts_at: "2025-02-01",
          ends_at: "2026-01-31",
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBe(CLIENT_ID);
    expect(body.opportunity_id).toBe(OPP_ID);
    expect(body.starts_at).toBe("2025-02-01");
    expect(body.ends_at).toBe("2026-01-31");
  });

  it("generates viewer_url with /view/c/ path", async () => {
    const created = makeContract();
    const mock = createSupabaseMock([ok(created), ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createContract(
      req("http://localhost/api/contracts", {
        method: "POST",
        body: { title: "Contrato" },
      })
    );
    const body = await res.json();
    expect(body.viewer_url).toMatch(/\/view\/c\//);
    expect(body.viewer_url).toContain(CONTRACT_ID);
  });

  it("defaults status to draft", async () => {
    const created = makeContract({ status: "draft" });
    const mock = createSupabaseMock([ok(created), ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createContract(
      req("http://localhost/api/contracts", { method: "POST", body: { title: "C" } })
    );
    expect((await res.json()).status).toBe("draft");
  });
});

// ── GET /api/contracts/[id] ────────────────────────────────────────────────

describe("GET /api/contracts/[id]", () => {
  it("returns contract with embedded relations", async () => {
    const chain = createSupabaseMock([ok(makeContract())]);
    vi.mocked(createClient).mockReturnValue(chain as never);

    const res = await getContract(req(`http://localhost/api/contracts/${CONTRACT_ID}`), {
      params: Promise.resolve({ id: CONTRACT_ID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client).toBeDefined();
    expect(body.opportunity).toBeDefined();
  });

  it("returns 404 for non-existent contract", async () => {
    const chain = createSupabaseMock([ok(null)]);
    vi.mocked(createClient).mockReturnValue(chain as never);

    const res = await getContract(req("http://localhost/api/contracts/nope"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/contracts/[id] — status transitions ────────────────────────

describe("PATCH /api/contracts/[id] — status transitions", () => {
  const params = Promise.resolve({ id: CONTRACT_ID });

  it("sets signed_at when transitioning to 'signed'", async () => {
    const existing = { id: CONTRACT_ID, status: "in_review", signed_at: null, viewed_at: null };
    const updated = makeContract({ status: "signed", signed_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, { method: "PATCH", body: { status: "signed" } }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("signed");
    expect(body.signed_at).not.toBeNull();
  });

  it("does not overwrite signed_at on re-patch", async () => {
    const originalSignedAt = "2025-03-01T09:00:00Z";
    const existing = { id: CONTRACT_ID, status: "signed", signed_at: originalSignedAt, viewed_at: null };
    const updated = makeContract({ status: "signed", signed_at: originalSignedAt });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, { method: "PATCH", body: { status: "signed" } }),
      { params }
    );
    const body = await res.json();
    expect(body.signed_at).toBe(originalSignedAt);
  });

  it("updates starts_at / ends_at dates", async () => {
    const existing = { id: CONTRACT_ID, status: "draft", signed_at: null, viewed_at: null };
    const updated = makeContract({ starts_at: "2025-06-01", ends_at: "2026-05-31" });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, {
        method: "PATCH",
        body: { starts_at: "2025-06-01", ends_at: "2026-05-31" },
      }),
      { params }
    );
    const body = await res.json();
    expect(body.starts_at).toBe("2025-06-01");
    expect(body.ends_at).toBe("2026-05-31");
  });

  it("updates client_id relationship", async () => {
    const newClientId = "client-uuid-new";
    const existing = { id: CONTRACT_ID, status: "draft", signed_at: null, viewed_at: null };
    const updated = makeContract({ client_id: newClientId });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, {
        method: "PATCH",
        body: { client_id: newClientId },
      }),
      { params }
    );
    expect((await res.json()).client_id).toBe(newClientId);
  });

  it("records viewed_at on first view (from viewer)", async () => {
    const existing = { id: CONTRACT_ID, status: "signed", signed_at: "2025-01-01T00:00:00Z", viewed_at: null };
    const updated = makeContract({ status: "signed", viewed_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, {
        method: "PATCH",
        body: { viewed_at: true },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).viewed_at).not.toBeNull();
  });

  it("allows unauthenticated viewer mark (viewed_at only)", async () => {
    const existing = { id: CONTRACT_ID, status: "signed", signed_at: "2025-01-01T00:00:00Z", viewed_at: null };
    const updated = makeContract({ viewed_at: new Date().toISOString() });
    // null user — should be allowed for viewer-only patch
    const mock = createSupabaseMock([ok(existing), ok(updated)], null);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, {
        method: "PATCH",
        body: { viewed_at: true },
      }),
      { params }
    );
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent contract", async () => {
    const mock = createSupabaseMock([ok(null)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req("http://localhost/api/contracts/ghost", { method: "PATCH", body: { status: "active" } }),
      { params: Promise.resolve({ id: "ghost" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when no fields to update", async () => {
    const existing = { id: CONTRACT_ID, status: "draft", signed_at: null, viewed_at: null };
    const mock = createSupabaseMock([ok(existing)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, { method: "PATCH", body: {} }),
      { params }
    );
    expect(res.status).toBe(400);
  });
});

// ── DELETE /api/contracts/[id] ────────────────────────────────────────────

describe("DELETE /api/contracts/[id]", () => {
  const params = Promise.resolve({ id: CONTRACT_ID });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(supabaseServer).mockResolvedValue(createSupabaseMock([], null) as never);
    const res = await deleteContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 204 on successful deletion", async () => {
    const mock = createSupabaseMock([ok(null)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);
    const res = await deleteContract(
      req(`http://localhost/api/contracts/${CONTRACT_ID}`, { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(204);
  });
});
