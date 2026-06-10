import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { upsertTask, isoWeek, todayStr, monthStr } from "@/lib/tasks";

function checkAuth(req: NextRequest): boolean {
  const secret = process.env.AGENT_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const results = { created: 0, skipped: 0, errors: [] as string[] };

  async function run(label: string, fn: () => Promise<void>) {
    try {
      await fn();
    } catch (e) {
      results.errors.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Helper local que acumula apenas erros reais (dedup skip não é erro)
  async function tryUpsert(payload: Parameters<typeof upsertTask>[1]) {
    const res = await upsertTask(db, payload);
    if (res.error) results.errors.push(`upsert_error: ${res.error}`);
    return res;
  }

  // ─── Regra 1: WhatsApp sem resposta em 6h ────────────────────────────────
  await run("whatsapp_unanswered_6h", async () => {
    const since24h = new Date(Date.now() - 24 * 3600_000).toISOString();
    const since6h  = new Date(Date.now() - 6  * 3600_000).toISOString();

    // Contatos que enviaram message_in nas últimas 24h (mas >= 6h atrás)
    const { data: inbound } = await db
      .from("interactions")
      .select("contact_id, occurred_at, contacts(name)")
      .eq("channel", "whatsapp")
      .eq("type", "message_in")
      .gte("occurred_at", since24h)
      .lte("occurred_at", since6h);

    if (!inbound?.length) return;

    // Agrupa: só o registro mais recente por contato
    const latest = new Map<string, { occurred_at: string; name: string }>();
    for (const row of inbound) {
      const prev = latest.get(row.contact_id);
      if (!prev || row.occurred_at > prev.occurred_at) {
        const name = (row.contacts as { name?: string } | null)?.name ?? "Contato";
        latest.set(row.contact_id, { occurred_at: row.occurred_at, name });
      }
    }

    for (const [contact_id, { occurred_at, name }] of latest) {
      // Verifica se há message_out depois do inbound
      const { count } = await db
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", contact_id)
        .eq("channel", "whatsapp")
        .eq("type", "message_out")
        .gte("occurred_at", occurred_at);

      if ((count ?? 0) > 0) continue; // já respondeu

      const dedup = `whatsapp_unanswered_${contact_id}_${todayStr()}`;
      const { created } = await tryUpsert({
        title: `Responder ${name} no WhatsApp`,
        priority: "high",
        source: "rule",
        rule_key: "whatsapp_unanswered_6h",
        entity_type: "contact",
        entity_id: contact_id,
        dedup_key: dedup,
      });
      created ? results.created++ : results.skipped++;
    }
  });

  // ─── Regra 2: Oportunidade parada 7 dias ─────────────────────────────────
  await run("opportunity_stale_7d", async () => {
    const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();

    const { data: opps } = await db
      .from("opportunities")
      .select("id, title")
      .not("status", "in", '("convertida","perdida")')
      .lte("updated_at", cutoff);

    for (const opp of opps ?? []) {
      const week = isoWeek();
      const dedup = `opp_stale_${opp.id}_${week}`;
      const { created } = await tryUpsert({
        title: `Oportunidade parada: ${opp.title}`,
        priority: "medium",
        source: "rule",
        rule_key: "opportunity_stale_7d",
        entity_type: "opportunity",
        entity_id: opp.id,
        dedup_key: dedup,
      });
      created ? results.created++ : results.skipped++;
    }
  });

  // ─── Regra 3: Proposta não visualizada em 5 dias ──────────────────────────
  await run("proposal_unviewed_5d", async () => {
    const cutoff = new Date(Date.now() - 5 * 86400_000).toISOString();

    const { data: proposals } = await db
      .from("proposals")
      .select("id, title, clients(company_name)")
      .eq("status", "sent")
      .is("viewed_at", null)
      .lte("sent_at", cutoff);

    for (const p of proposals ?? []) {
      const clientName = (p.clients as { company_name?: string } | null)?.company_name ?? "cliente";
      const dedup = `proposal_unviewed_${p.id}`;
      const { created } = await tryUpsert({
        title: `Proposta sem visualização: ${clientName}`,
        priority: "high",
        source: "rule",
        rule_key: "proposal_unviewed_5d",
        entity_type: "proposal",
        entity_id: p.id,
        dedup_key: dedup,
      });
      created ? results.created++ : results.skipped++;
    }
  });

  // ─── Regra 4: Entrega vencendo em 3 dias ─────────────────────────────────
  await run("deliverable_due_3d", async () => {
    const today    = new Date().toISOString().slice(0, 10);
    const in3days  = new Date(Date.now() + 3 * 86400_000).toISOString().slice(0, 10);

    const { data: delivs } = await db
      .from("deliverables")
      .select("id, title, due_date, clients(company_name)")
      .eq("done", false)
      .not("due_date", "is", null)
      .lte("due_date", in3days);

    for (const d of delivs ?? []) {
      const clientName = (d.clients as { company_name?: string } | null)?.company_name ?? "cliente";
      const isOverdue = d.due_date <= today;
      const dedup = `deliverable_due_${d.id}`;
      const { created } = await tryUpsert({
        title: `Entregar: ${d.title} — ${clientName}`,
        priority: isOverdue ? "critical" : "high",
        source: "rule",
        rule_key: "deliverable_due_3d",
        entity_type: "deliverable",
        entity_id: d.id,
        dedup_key: dedup,
        due_at: d.due_date ? new Date(d.due_date).toISOString() : undefined,
      });
      created ? results.created++ : results.skipped++;
    }
  });

  // ─── Regra 5: Cliente inativo 30 dias ────────────────────────────────────
  await run("client_inactive_30d", async () => {
    const since30d = new Date(Date.now() - 30 * 86400_000).toISOString();
    const month = monthStr();

    const { data: clients } = await db
      .from("clients")
      .select("id, company_name, contact_id")
      .eq("status", "active");

    for (const client of clients ?? []) {
      if (!client.contact_id) continue;

      const { count } = await db
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", client.contact_id)
        .gte("occurred_at", since30d);

      if ((count ?? 0) > 0) continue;

      const dedup = `client_inactive_${client.id}_${month}`;
      const { created } = await tryUpsert({
        title: `Reengajar cliente: ${client.company_name}`,
        priority: "medium",
        source: "rule",
        rule_key: "client_inactive_30d",
        entity_type: "client",
        entity_id: client.id,
        dedup_key: dedup,
      });
      created ? results.created++ : results.skipped++;
    }
  });

  // ─── Regra 6: Reunião sem follow-up 24h ──────────────────────────────────
  await run("meeting_no_followup_24h", async () => {
    const from48h = new Date(Date.now() - 48 * 3600_000).toISOString();
    const from24h = new Date(Date.now() - 24 * 3600_000).toISOString();

    const { data: meetings } = await db
      .from("interactions")
      .select("id, contact_id, occurred_at, contacts(name)")
      .eq("type", "meeting")
      .gte("occurred_at", from48h)
      .lt("occurred_at", from24h);

    for (const m of meetings ?? []) {
      const { count } = await db
        .from("interactions")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", m.contact_id)
        .gt("occurred_at", m.occurred_at);

      if ((count ?? 0) > 0) continue;

      const contactName = (m.contacts as { name?: string } | null)?.name ?? "contato";
      const dedup = `meeting_followup_${m.id}`;
      const { created } = await tryUpsert({
        title: `Follow-up da reunião com ${contactName}`,
        priority: "high",
        source: "rule",
        rule_key: "meeting_no_followup_24h",
        entity_type: "contact",
        entity_id: m.contact_id,
        dedup_key: dedup,
      });
      created ? results.created++ : results.skipped++;
    }
  });

  return NextResponse.json(results);
}
