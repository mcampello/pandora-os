/**
 * Tests for /api/proposals (GET, POST) and /api/proposals/[id] (GET, PATCH, DELETE).
 *
 * Strategy: mock @/lib/supabase-server so the route handlers run with a
 * controlled Supabase client. Each test describes the expected relationship
 * behaviour (client_id, opportunity_id linkage, status transitions, etc.).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, ok, err } from "../helpers/supabase-mock";

// ── Module-level mock ──────────────────────────────────────────────────────
// supabaseServer is replaced before any import of the route handlers.
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: vi.fn(),
}));
// Also mock the anon createClient used by the public GET /[id] route.
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(),
}));

import { supabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";
import { GET as listProposals, POST as createProposal } from "@/app/api/proposals/route";
import {
  GET as getProposal,
  PATCH as patchProposal,
  DELETE as deleteProposal,
} from "@/app/api/proposals/[id]/route";

// ── Helpers ────────────────────────────────────────────────────────────────

const CLIENT_ID = "client-uuid-001";
const OPP_ID = "opp-uuid-001";
const PROPOSAL_ID = "prop-uuid-001";
const COMPANY_ID = "company-uuid-001";

function makeProposal(overrides: Record<string, unknown> = {}) {
  return {
    id: PROPOSAL_ID,
    title: "Proposta Teste",
    content_md: null,
    value: 5000,
    status: "draft",
    client_id: CLIENT_ID,
    opportunity_id: OPP_ID,
    proposal_group_id: "group-001",
    version: 1,
    viewer_url: `https://app.campello.me/view/p/${PROPOSAL_ID}`,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    client: { id: CLIENT_ID, company_name: "Baila Creative", status: "active" },
    opportunity: { id: OPP_ID, title: "Fee Mensal", status: "qualified" },
    ...overrides,
  };
}

function req(
  url: string,
  options: { method?: string; body?: unknown } = {}
): NextRequest {
  return new NextRequest(url, {
    method: options.method ?? "GET",
    ...(options.body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options.body),
        }
      : {}),
  });
}

// ── GET /api/proposals ─────────────────────────────────────────────────────

describe("GET /api/proposals", () => {
  it("returns 401 when not authenticated", async () => {
    const mock = createSupabaseMock([], null); // null user
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listProposals(req("http://localhost/api/proposals"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("returns all proposals for authenticated user", async () => {
    const proposals = [makeProposal(), makeProposal({ id: "prop-002" })];
    const mock = createSupabaseMock([ok(proposals)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listProposals(req("http://localhost/api/proposals"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(2);
  });

  it("passes client_id filter to Supabase query", async () => {
    const proposals = [makeProposal()];
    const mock = createSupabaseMock([ok(proposals)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listProposals(
      req(`http://localhost/api/proposals?client_id=${CLIENT_ID}`)
    );
    expect(res.status).toBe(200);
    // The `from` chain's `eq` should have been called with client_id
    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "client_id" && args[1] === CLIENT_ID)).toBe(true);
  });

  it("passes opportunity_id filter to Supabase query", async () => {
    const mock = createSupabaseMock([ok([makeProposal()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listProposals(req(`http://localhost/api/proposals?opportunity_id=${OPP_ID}`));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "opportunity_id" && args[1] === OPP_ID)).toBe(true);
  });

  it("applies single-status filter with eq", async () => {
    const mock = createSupabaseMock([ok([makeProposal({ status: "sent" })])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listProposals(req("http://localhost/api/proposals?status=sent"));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "status" && args[1] === "sent")).toBe(true);
  });

  it("applies multi-status filter with in", async () => {
    const mock = createSupabaseMock([ok([])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listProposals(req("http://localhost/api/proposals?status=sent,viewed"));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const inCalls = (chain.in as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(inCalls.some((args) => args[0] === "status")).toBe(true);
  });

  it("returns empty array when no proposals match", async () => {
    const mock = createSupabaseMock([ok([])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listProposals(req("http://localhost/api/proposals"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("returns embedded client and opportunity relations", async () => {
    const proposal = makeProposal();
    const mock = createSupabaseMock([ok([proposal])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listProposals(req("http://localhost/api/proposals"));
    const [first] = await res.json();
    expect(first.client).toMatchObject({ id: CLIENT_ID, company_name: "Baila Creative" });
    expect(first.opportunity).toMatchObject({ id: OPP_ID, title: "Fee Mensal" });
  });
});

// ── POST /api/proposals ────────────────────────────────────────────────────

describe("POST /api/proposals", () => {
  it("returns 401 when not authenticated", async () => {
    const mock = createSupabaseMock([], null);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createProposal(
      req("http://localhost/api/proposals", { method: "POST", body: { title: "X" } })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when title is missing", async () => {
    const mock = createSupabaseMock([]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createProposal(
      req("http://localhost/api/proposals", { method: "POST", body: {} })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("title");
  });

  it("creates proposal with client_id and opportunity_id relationships", async () => {
    const created = makeProposal();
    // POST handler calls from() twice: insert + update (viewer_url)
    const mock = createSupabaseMock([ok(created), ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createProposal(
      req("http://localhost/api/proposals", {
        method: "POST",
        body: {
          title: "Proposta Teste",
          company_id: COMPANY_ID,
          client_id: CLIENT_ID,
          opportunity_id: OPP_ID,
          value: 5000,
          status: "draft",
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBe(CLIENT_ID);
    expect(body.opportunity_id).toBe(OPP_ID);
    expect(body.viewer_url).toContain(`/view/p/${PROPOSAL_ID}`);
  });

  it("generates viewer_url containing the proposal id", async () => {
    const created = makeProposal({ id: "new-id-999" });
    const mock = createSupabaseMock([ok(created), ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createProposal(
      req("http://localhost/api/proposals", {
        method: "POST",
        body: { title: "Nova Proposta", company_id: COMPANY_ID },
      })
    );
    const body = await res.json();
    expect(body.viewer_url).toMatch(/\/view\/p\//);
    expect(body.viewer_url).toContain("new-id-999");
  });

  it("creates proposal without client or opportunity (standalone)", async () => {
    const created = makeProposal({ client_id: null, opportunity_id: null, client: null, opportunity: null });
    const mock = createSupabaseMock([ok(created), ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createProposal(
      req("http://localhost/api/proposals", {
        method: "POST",
        body: { title: "Proposta Independente", company_id: COMPANY_ID },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toBeNull();
    expect(body.opportunity_id).toBeNull();
  });

  it("defaults status to draft when not provided", async () => {
    const created = makeProposal({ status: "draft" });
    const mock = createSupabaseMock([ok(created), ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createProposal(
      req("http://localhost/api/proposals", {
        method: "POST",
        body: { title: "Proposta", company_id: COMPANY_ID },
      })
    );
    const body = await res.json();
    expect(body.status).toBe("draft");
  });

  it("returns 500 on database error", async () => {
    const mock = createSupabaseMock([err("duplicate key value violates unique constraint")]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createProposal(
      req("http://localhost/api/proposals", {
        method: "POST",
        body: { title: "Proposta", company_id: COMPANY_ID },
      })
    );
    expect(res.status).toBe(500);
  });
});

// ── GET /api/proposals/[id] (public) ──────────────────────────────────────

describe("GET /api/proposals/[id]", () => {
  const params = Promise.resolve({ id: PROPOSAL_ID });

  it("returns proposal with client and opportunity relations", async () => {
    const proposal = makeProposal();
    const chain = createSupabaseMock([ok(proposal)]);
    vi.mocked(createClient).mockReturnValue(chain as never);

    const res = await getProposal(req(`http://localhost/api/proposals/${PROPOSAL_ID}`), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(PROPOSAL_ID);
    expect(body.client).toBeDefined();
    expect(body.opportunity).toBeDefined();
  });

  it("returns 404 when proposal does not exist", async () => {
    const chain = createSupabaseMock([ok(null)]);
    vi.mocked(createClient).mockReturnValue(chain as never);

    const res = await getProposal(req(`http://localhost/api/proposals/not-found`), {
      params: Promise.resolve({ id: "not-found" }),
    });
    expect(res.status).toBe(404);
  });
});

// ── PATCH /api/proposals/[id] ─────────────────────────────────────────────

describe("PATCH /api/proposals/[id] — status transitions", () => {
  const params = Promise.resolve({ id: PROPOSAL_ID });

  it("returns 401 when not authenticated and not a viewer mark", async () => {
    const mock = createSupabaseMock(
      [ok({ id: PROPOSAL_ID, status: "draft", sent_at: null, viewed_at: null, responded_at: null })],
      null // no user
    );
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { status: "sent" },
      }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("sets sent_at when transitioning to 'sent' status", async () => {
    const existing = { id: PROPOSAL_ID, status: "draft", sent_at: null, viewed_at: null, responded_at: null };
    const updated = makeProposal({ status: "sent", sent_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { status: "sent" },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("sent");
    expect(body.sent_at).not.toBeNull();
  });

  it("does not overwrite sent_at if already set", async () => {
    const existingSentAt = "2025-01-01T10:00:00Z";
    const existing = {
      id: PROPOSAL_ID,
      status: "sent",
      sent_at: existingSentAt,
      viewed_at: null,
      responded_at: null,
    };
    const updated = makeProposal({ status: "sent", sent_at: existingSentAt });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { status: "sent" },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sent_at).toBe(existingSentAt);
  });

  it("sets responded_at when transitioning to 'accepted'", async () => {
    const existing = { id: PROPOSAL_ID, status: "viewed", sent_at: "2025-01-01T00:00:00Z", viewed_at: "2025-01-02T00:00:00Z", responded_at: null };
    const updated = makeProposal({ status: "accepted", responded_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { status: "accepted" },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("accepted");
    expect(body.responded_at).not.toBeNull();
  });

  it("sets responded_at when transitioning to 'rejected'", async () => {
    const existing = { id: PROPOSAL_ID, status: "viewed", sent_at: "2025-01-01T00:00:00Z", viewed_at: "2025-01-02T00:00:00Z", responded_at: null };
    const updated = makeProposal({ status: "rejected", responded_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { status: "rejected" },
      }),
      { params }
    );
    const body = await res.json();
    expect(body.responded_at).not.toBeNull();
  });

  it("marks viewed_at and transitions to 'viewed' when viewer opens sent proposal", async () => {
    const existing = { id: PROPOSAL_ID, status: "sent", sent_at: "2025-01-01T00:00:00Z", viewed_at: null, responded_at: null };
    const updated = makeProposal({ status: "viewed", viewed_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { viewed_at: true }, // viewer sends this
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.viewed_at).not.toBeNull();
    expect(body.status).toBe("viewed");
  });

  it("returns 400 on repeated views — viewed_at is not overwritten (no-op patch)", async () => {
    // When viewed_at is already set and only { viewed_at: true } is in the body,
    // nothing ends up in the patch → the handler returns 400 "nenhum campo para atualizar".
    // This is the correct idempotent behaviour: subsequent viewer opens are ignored.
    const firstView = "2025-01-02T12:00:00Z";
    const existing = { id: PROPOSAL_ID, status: "viewed", sent_at: "2025-01-01T00:00:00Z", viewed_at: firstView, responded_at: null };
    const mock = createSupabaseMock([ok(existing)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { viewed_at: true },
      }),
      { params }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("nenhum campo");
  });

  it("updates client_id relationship (re-linking to different client)", async () => {
    const newClientId = "client-uuid-999";
    const existing = { id: PROPOSAL_ID, status: "draft", sent_at: null, viewed_at: null, responded_at: null };
    const updated = makeProposal({ client_id: newClientId });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { client_id: newClientId },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client_id).toBe(newClientId);
  });

  it("unlinks client_id when empty string is passed", async () => {
    const existing = { id: PROPOSAL_ID, status: "draft", sent_at: null, viewed_at: null, responded_at: null };
    const updated = makeProposal({ client_id: null, client: null });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { client_id: "" },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.client_id).toBeNull();
  });

  it("updates opportunity_id relationship", async () => {
    const newOppId = "opp-uuid-999";
    const existing = { id: PROPOSAL_ID, status: "draft", sent_at: null, viewed_at: null, responded_at: null };
    const updated = makeProposal({ opportunity_id: newOppId });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: { opportunity_id: newOppId },
      }),
      { params }
    );
    const body = await res.json();
    expect(body.opportunity_id).toBe(newOppId);
  });

  it("returns 404 when proposal does not exist", async () => {
    const mock = createSupabaseMock([ok(null)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/ghost`, {
        method: "PATCH",
        body: { status: "sent" },
      }),
      { params: Promise.resolve({ id: "ghost" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when no fields to update are provided", async () => {
    const existing = { id: PROPOSAL_ID, status: "draft", sent_at: null, viewed_at: null, responded_at: null };
    const mock = createSupabaseMock([ok(existing)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, {
        method: "PATCH",
        body: {},
      }),
      { params }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("nenhum campo");
  });
});

// ── DELETE /api/proposals/[id] ────────────────────────────────────────────

describe("DELETE /api/proposals/[id]", () => {
  const params = Promise.resolve({ id: PROPOSAL_ID });

  it("returns 401 when not authenticated", async () => {
    const mock = createSupabaseMock([], null);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await deleteProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("returns 204 on successful deletion", async () => {
    const mock = createSupabaseMock([ok(null)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await deleteProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(204);
  });

  it("returns 500 on database error during deletion", async () => {
    const mock = createSupabaseMock([err("foreign key constraint violation")]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await deleteProposal(
      req(`http://localhost/api/proposals/${PROPOSAL_ID}`, { method: "DELETE" }),
      { params }
    );
    expect(res.status).toBe(500);
  });
});
