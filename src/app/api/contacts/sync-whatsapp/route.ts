import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Sincroniza contatos a partir de mensagens 1:1 (não-grupo) na tabela documents.
// Para cada chatId único, identifica o "outro lado" (não o owner) e cria contato + client prospect.

interface DocumentRow {
  metadata: {
    chatId?: string;
    senderName?: string;
    date?: string;
    owner?: string;
  };
}

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const chats = new Map<string, {
    phone: string;
    counts: Map<string, number>;
    lastDate: string;
  }>();

  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("documents").select("metadata")
      .like("metadata->>chatId", "%@s.whatsapp.net")
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;

    for (const row of data as DocumentRow[]) {
      const chatId = row.metadata?.chatId;
      const name   = (row.metadata?.senderName ?? "").trim();
      const date   = row.metadata?.date ?? "";
      if (!chatId) continue;
      const phone = chatId.replace(/@.*$/, "").replace(/\D/g, "");
      if (!phone || phone.length < 8) continue;

      let entry = chats.get(chatId);
      if (!entry) {
        entry = { phone, counts: new Map(), lastDate: "" };
        chats.set(chatId, entry);
      }
      if (name) entry.counts.set(name, (entry.counts.get(name) ?? 0) + 1);
      // Normaliza para ISO antes de comparar — o campo date tem dois formatos no banco:
      // "2026-05-05 09:06" e "2026-05-21T16:14:49.000-03:00"
      const dateIso = date ? new Date(date).toISOString() : "";
      if (dateIso && dateIso > entry.lastDate) entry.lastDate = dateIso;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Detecta nomes do owner: aparecem em >50% dos chats
  const ownerNames = new Set<string>(["Mario Campello", "Campello"]);
  const presenceByName = new Map<string, number>();
  for (const { counts } of chats.values()) {
    for (const n of counts.keys()) {
      presenceByName.set(n, (presenceByName.get(n) ?? 0) + 1);
    }
  }
  const totalChats = chats.size;
  for (const [name, presence] of presenceByName) {
    if (totalChats > 1 && presence / totalChats > 0.5) ownerNames.add(name);
  }

  let created = 0;
  let updated = 0;
  const errors: string[] = [];
  const summary: Array<{ phone: string; name: string; messages: number; status: "created" | "updated" | "skipped" }> = [];

  for (const [, info] of chats) {
    let bestName = "";
    let bestCount = 0;
    let totalMsgs = 0;
    for (const [name, count] of info.counts) {
      totalMsgs += count;
      if (ownerNames.has(name)) continue;
      if (count > bestCount) { bestName = name; bestCount = count; }
    }
    if (!bestName) continue; // skip chats onde só o owner falou

    const { data: existing, error: selectErr } = await supabase
      .from("contacts").select("id, name").eq("phone", info.phone).maybeSingle();

    if (selectErr) { errors.push(`select ${info.phone}: ${selectErr.message}`); continue; }

    if (existing) {
      if (!existing.name || existing.name === info.phone) {
        const { error: updErr } = await supabase.from("contacts").update({ name: bestName }).eq("id", existing.id);
        if (updErr) errors.push(`update ${info.phone}: ${updErr.message}`);
        else updated++;
        summary.push({ phone: info.phone, name: bestName, messages: totalMsgs, status: "updated" });
      } else {
        summary.push({ phone: info.phone, name: existing.name, messages: totalMsgs, status: "skipped" });
      }
    } else {
      const { data: newContact, error: insErr } = await supabase
        .from("contacts")
        .insert({ name: bestName, phone: info.phone, source: "whatsapp" })
        .select("id")
        .single();

      if (insErr) { errors.push(`insert contact ${info.phone}: ${insErr.message}`); continue; }

      // Cria client prospect para validação
      const { error: clientErr } = await supabase.from("clients").insert({
        contact_id: newContact.id,
        company_name: bestName,
        status: "prospect",
      });
      if (clientErr) errors.push(`insert client ${info.phone}: ${clientErr.message}`);

      created++;
      summary.push({ phone: info.phone, name: bestName, messages: totalMsgs, status: "created" });
    }
  }

  return NextResponse.json({
    ok: true,
    total_chats: chats.size,
    created, updated,
    errors,
    owner_names_excluded: Array.from(ownerNames),
    summary,
  });
}
