import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { createSupabaseMock, ok, err } from "../helpers/supabase-mock";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: vi.fn() }));

import { supabaseServer } from "@/lib/supabase-server";
import { GET as listOpportunities, POST as createOpportunity } from "@/app/api/opportunities/route";
import { PATCH as patchOpportunity } from "@/app/api/opportunities/[id]/route";

const CONTACT_ID = "contact-uuid-001";
const OPP_ID = "opp-uuid-001";

function makeOpp(overrides: Record<string, unknown> = {}) {
  return {
    id: OPP_ID,
    contact_id: CONTACT_ID,
    channel: "email",
    confidence: "high",
    title: "Oportunidade de Serviço",
    description: "Descrição da oportunidade",
    raw_content: null,
    source_url: null,
    status: "new",
    detected_at: "2025-01-10T00:00:00Z",
    qualified_at: null,
    converted_to_client_id: null,
    notes: null,
    created_at: "2025-01-10T00:00:00Z",
    updated_at: "2025-01-10T00:00:00Z",
    contact: { id: CONTACT_ID, name: "Fulano de Tal", company: "Acme", email: "f@acme.com", phone: null },
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

// ── GET /api/opportunities ─────────────────────────────────────────────────

describe("GET /api/opportunities", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(supabaseServer).mockResolvedValue(createSupabaseMock([], null) as never);
    const res = await listOpportunities(req("http://localhost/api/opportunities"));
    expect(res.status).toBe(401);
  });

  it("returns list with embedded contact relation", async () => {
    const mock = createSupabaseMock([ok([makeOpp()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listOpportunities(req("http://localhost/api/opportunities"));
    expect(res.status).toBe(200);
    const [opp] = await res.json();
    expect(opp.contact).toMatchObject({ name: "Fulano de Tal", company: "Acme" });
  });

  it("filters by contact_id", async () => {
    const mock = createSupabaseMock([ok([makeOpp()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listOpportunities(req(`http://localhost/api/opportunities?contact_id=${CONTACT_ID}`));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "contact_id" && args[1] === CONTACT_ID)).toBe(true);
  });

  it("filters by status (single)", async () => {
    const mock = createSupabaseMock([ok([makeOpp({ status: "qualified" })])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listOpportunities(req("http://localhost/api/opportunities?status=qualified"));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const eqCalls = (chain.eq as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(eqCalls.some((args) => args[0] === "status" && args[1] === "qualified")).toBe(true);
  });

  it("filters by multiple statuses using in()", async () => {
    const mock = createSupabaseMock([ok([makeOpp()])]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    await listOpportunities(req("http://localhost/api/opportunities?status=new,qualified"));

    const chain = mock.from.mock.results[0]?.value as Record<string, { mock: { calls: unknown[][] } }>;
    const inCalls = (chain.in as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(inCalls.some((args) => args[0] === "status")).toBe(true);
  });

  it("performs client-side text search by title", async () => {
    const opps = [
      makeOpp({ title: "Proposta para Baila Creative" }),
      makeOpp({ id: "opp-002", title: "Outro projeto" }),
    ];
    const mock = createSupabaseMock([ok(opps)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listOpportunities(req("http://localhost/api/opportunities?q=baila"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].title).toContain("Baila");
  });

  it("performs client-side search by contact name", async () => {
    const opps = [
      makeOpp({ contact: { id: CONTACT_ID, name: "Mario Campello", company: null, email: null, phone: null } }),
      makeOpp({ id: "opp-002", contact: null }),
    ];
    const mock = createSupabaseMock([ok(opps)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await listOpportunities(req("http://localhost/api/opportunities?q=mario"));
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].contact.name).toBe("Mario Campello");
  });
});

// ── POST /api/opportunities ────────────────────────────────────────────────

describe("POST /api/opportunities", () => {
  it("returns 401 when not authenticated", async () => {
    vi.mocked(supabaseServer).mockResolvedValue(createSupabaseMock([], null) as never);
    const res = await createOpportunity(
      req("http://localhost/api/opportunities", {
        method: "POST",
        body: { title: "X", channel: "email", confidence: "high" },
      })
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when required fields are missing", async () => {
    const mock = createSupabaseMock([]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createOpportunity(
      req("http://localhost/api/opportunities", {
        method: "POST",
        body: { title: "Sem canal" }, // missing channel and confidence
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/channel|confidence/);
  });

  it("creates opportunity linked to a contact", async () => {
    const created = makeOpp();
    const mock = createSupabaseMock([ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createOpportunity(
      req("http://localhost/api/opportunities", {
        method: "POST",
        body: {
          contact_id: CONTACT_ID,
          title: "Oportunidade de Serviço",
          channel: "email",
          confidence: "high",
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.contact_id).toBe(CONTACT_ID);
    expect(body.contact).toMatchObject({ id: CONTACT_ID });
  });

  it("creates opportunity without contact (standalone)", async () => {
    const created = makeOpp({ contact_id: null, contact: null });
    const mock = createSupabaseMock([ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createOpportunity(
      req("http://localhost/api/opportunities", {
        method: "POST",
        body: { title: "Opp sem contato", channel: "manual", confidence: "low" },
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).contact_id).toBeNull();
  });

  it("defaults status to 'new' when not provided", async () => {
    const created = makeOpp({ status: "new" });
    const mock = createSupabaseMock([ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createOpportunity(
      req("http://localhost/api/opportunities", {
        method: "POST",
        body: { title: "Opp", channel: "whatsapp", confidence: "medium" },
      })
    );
    expect((await res.json()).status).toBe("new");
  });

  it("sets qualified_at when created with status 'qualified'", async () => {
    const created = makeOpp({ status: "qualified", qualified_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(created)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await createOpportunity(
      req("http://localhost/api/opportunities", {
        method: "POST",
        body: { title: "Opp Qualificada", channel: "email", confidence: "very_high", status: "qualified" },
      })
    );
    expect(res.status).toBe(201);
    expect((await res.json()).qualified_at).not.toBeNull();
  });
});

// ── PATCH /api/opportunities/[id] ─────────────────────────────────────────

describe("PATCH /api/opportunities/[id] — status transitions and relations", () => {
  const params = Promise.resolve({ id: OPP_ID });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(supabaseServer).mockResolvedValue(createSupabaseMock([], null) as never);
    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, { method: "PATCH", body: { status: "qualified" } }),
      { params }
    );
    expect(res.status).toBe(401);
  });

  it("sets qualified_at when transitioning to 'qualified'", async () => {
    const existing = { id: OPP_ID, status: "new", qualified_at: null, contact_id: CONTACT_ID };
    const updated = makeOpp({ status: "qualified", qualified_at: new Date().toISOString() });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, { method: "PATCH", body: { status: "qualified" } }),
      { params }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).qualified_at).not.toBeNull();
  });

  it("does not overwrite qualified_at on re-patch", async () => {
    const originalAt = "2025-01-15T08:00:00Z";
    const existing = { id: OPP_ID, status: "qualified", qualified_at: originalAt, contact_id: CONTACT_ID };
    const updated = makeOpp({ status: "qualified", qualified_at: originalAt });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, { method: "PATCH", body: { status: "qualified" } }),
      { params }
    );
    expect((await res.json()).qualified_at).toBe(originalAt);
  });

  it("requires contact_id to convert opportunity", async () => {
    // contact_id is null on existing AND not provided in body
    const existing = { id: OPP_ID, status: "qualified", qualified_at: "2025-01-01T00:00:00Z", contact_id: null };
    const mock = createSupabaseMock([ok(existing)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, { method: "PATCH", body: { status: "converted" } }),
      { params }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("contact_id");
  });

  it("allows conversion when contact_id exists on the record", async () => {
    const existing = { id: OPP_ID, status: "qualified", qualified_at: "2025-01-01T00:00:00Z", contact_id: CONTACT_ID };
    const updated = makeOpp({ status: "converted" });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, { method: "PATCH", body: { status: "converted" } }),
      { params }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("converted");
  });

  it("allows conversion when contact_id is provided in body (override)", async () => {
    const newContactId = "contact-uuid-999";
    const existing = { id: OPP_ID, status: "qualified", qualified_at: "2025-01-01T00:00:00Z", contact_id: null };
    const updated = makeOpp({ status: "converted", contact_id: newContactId });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, {
        method: "PATCH",
        body: { status: "converted", contact_id: newContactId },
      }),
      { params }
    );
    expect(res.status).toBe(200);
  });

  it("links contact_id to the opportunity", async () => {
    const existing = { id: OPP_ID, status: "new", qualified_at: null, contact_id: null };
    const updated = makeOpp({ contact_id: CONTACT_ID });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, {
        method: "PATCH",
        body: { contact_id: CONTACT_ID },
      }),
      { params }
    );
    expect(res.status).toBe(200);
    expect((await res.json()).contact_id).toBe(CONTACT_ID);
  });

  it("unlinks contact_id when empty string passed", async () => {
    const existing = { id: OPP_ID, status: "new", qualified_at: null, contact_id: CONTACT_ID };
    const updated = makeOpp({ contact_id: null, contact: null });
    const mock = createSupabaseMock([ok(existing), ok(updated)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, {
        method: "PATCH",
        body: { contact_id: "" },
      }),
      { params }
    );
    expect((await res.json()).contact_id).toBeNull();
  });

  it("returns 404 for non-existent opportunity", async () => {
    const mock = createSupabaseMock([ok(null)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req("http://localhost/api/opportunities/ghost", { method: "PATCH", body: { title: "X" } }),
      { params: Promise.resolve({ id: "ghost" }) }
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 when no fields to update", async () => {
    const existing = { id: OPP_ID, status: "new", qualified_at: null, contact_id: null };
    const mock = createSupabaseMock([ok(existing)]);
    vi.mocked(supabaseServer).mockResolvedValue(mock as never);

    const res = await patchOpportunity(
      req(`http://localhost/api/opportunities/${OPP_ID}`, { method: "PATCH", body: {} }),
      { params }
    );
    expect(res.status).toBe(400);
  });
});
