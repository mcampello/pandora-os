import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchCallsSince, fetchCallSummary, formatSummaryPT, isSkippable } from "@/lib/fathom";

const MY_EMAIL = "mario@campello.me";

// POST /api/connectors/fathom/sync
// Importa reuniões novas do Fathom desde o último sync.
// Cria contatos ausentes e insere interações deduplicadas por external_id.
export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: connector } = await supabase
    .from("connectors").select("id, credentials, last_sync_at")
    .eq("type", "fathom").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();

  if (!connector) return NextResponse.json({ error: "Fathom não conectado" }, { status: 400 });

  const apiKey = (connector.credentials as { api_key: string }).api_key;
  if (!apiKey) return NextResponse.json({ error: "API key do Fathom não configurada" }, { status: 400 });

  const since: string | undefined = connector.last_sync_at ?? undefined;
  const calls = await fetchCallsSince(apiKey, since);

  const stats = {
    total_calls: calls.length,
    skipped_no_attendees: 0,
    contacts_created: 0,
    contacts_found: 0,
    interactions_created: 0,
    interactions_skipped: 0,
  };

  for (const call of calls) {
    if (isSkippable(call, MY_EMAIL)) {
      stats.skipped_no_attendees++;
      continue;
    }

    const externalId = `fathom_${call.id}`;

    // Deduplicação antes de qualquer trabalho
    const { count } = await supabase
      .from("interactions").select("id", { count: "exact", head: true })
      .eq("external_id", externalId);

    if ((count ?? 0) > 0) {
      stats.interactions_skipped++;
      continue;
    }

    // Primeiro participante externo como contato principal
    const attendees = (call.attendees ?? []).filter(a => a.email && a.email !== MY_EMAIL);
    const primary = attendees[0];

    // Upsert contato pelo email
    let contactId: string;
    const { data: existing } = await supabase
      .from("contacts").select("id")
      .eq("email", primary.email).maybeSingle();

    if (existing) {
      contactId = existing.id;
      stats.contacts_found++;
    } else {
      const { data: created } = await supabase.from("contacts").insert({
        name: primary.name || primary.email.split("@")[0],
        email: primary.email,
        source: "fathom",
        category: "desconhecido",
      }).select("id").single();
      contactId = created!.id;
      stats.contacts_created++;
    }

    // Busca resumo e formata em português
    const summary = await fetchCallSummary(apiKey, call.call_id ?? call.id);
    const content = formatSummaryPT(summary);

    await supabase.from("interactions").insert({
      contact_id: contactId,
      channel: "fathom",
      type: "meeting",
      subject: `${call.title} (${call.started_at.slice(0, 10)})`,
      content: content || null,
      occurred_at: call.started_at,
      external_id: externalId,
      external_url: call.share_url,
      metadata: {
        fathom_recording_id: call.id,
        fathom_call_id: call.call_id,
        attendees: attendees.map(a => ({ name: a.name, email: a.email })),
      },
    });

    stats.interactions_created++;
  }

  // Atualiza last_sync_at
  await supabase.from("connectors")
    .update({ last_sync_at: new Date().toISOString() })
    .eq("id", connector.id);

  return NextResponse.json(stats);
}
