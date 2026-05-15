import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Sincroniza contatos a partir de mensagens 1:1 (não-grupo) na tabela documents.
// Para cada chatId único, identifica o "outro lado" (não o owner) e cria contato.

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

  // Estrutura: chatId -> { senderTallies, ownerPhone }
  const chats = new Map<string, {
    phone: string;
    ownerPhone: string;
    counts: Map<string, number>;  // senderName -> count
    lastDate: string;
  }>();

  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("documents").select("metadata")
      .like("metadata->>chatId", "%@s.whatsapp.net")
      .range(offset, offset + pageSize - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;

    for (const row of data as DocumentRow[]) {
      const chatId = row.metadata?.chatId;
      const name   = (row.metadata?.senderName ?? "").trim();
      const date   = row.metadata?.date ?? "";
      const owner  = row.metadata?.owner ?? "";
      if (!chatId) continue;
      const phone = chatId.replace(/@.*$/, "").replace(/\\D/g, "");
      if (!phone || phone.length < 8) continue;

      let entry = chats.get(chatId);
      if (!entry) {
        entry = { phone, ownerPhone: owner, counts: new Map(), lastDate: "" };
        chats.set(chatId, entry);
      }
      if (name) entry.counts.set(name, (entry.counts.get(name) ?? 0) + 1);
      if (date > entry.lastDate) entry.lastDate = date;
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Identifica nomes "do Mario" (owner) para excluir
  const ownerNames = new Set<string>();
  for (const { ownerPhone, counts } of chats.values()) {
    if (!ownerPhone) continue;
    // O nome "do owner" provavelmente aparece em MUITOS chats. Coleta candidatos.
  }
  // Conta em quantos chats cada nome aparece
  const presenceByName = new Map<string, number>();
  for (const { counts } of chats.values()) {
    for (const n of counts.keys()) {
      presenceByName.set(n, (presenceByName.get(n) ?? 0) + 1);
    }
  }
  // Nome que aparece em >50% dos chats provavelmente é o owner (Mario)
  const totalChats = chats.size;
  for (const [name, presence] of presenceByName) {
    if (totalChats > 1 && presence / totalChats > 0.5) ownerNames.add(name);
  }
  // Fallback: também excluímos hardcoded
  ownerNames.add("Mario Campello");

  let created = 0;
  let updated = 0;
  const summary: Array<{ phone: string; name: string; messages: number; status: "created" | "updated" | "skipped" }> = [];

  for (const [, info] of chats) {
    // Escolhe o nome do "outro lado": maior contador entre nomes que NÃO são do owner
    let bestName = "";
    let bestCount = 0;
    let totalMsgs = 0;
    for (const [name, count] of info.counts) {
      totalMsgs += count;
      if (ownerNames.has(name)) continue;
      if (count > bestCount) {
        bestName = name;
        bestCount = count;
      }
    }
    if (!bestName) bestName = info.phone; // fallback

    const { data: existing } = await supabase
      .from("contacts").select("id, name").eq("phone", info.phone).maybeSingle();

    if (existing) {
      // Atualiza nome se for igual ao phone (placeholder) ou estiver vazio
      if (!existing.name || existing.name === info.phone) {
        await supabase.from("contacts").update({ name: bestName }).eq("id", existing.id);
        updated++;
        summary.push({ phone: info.phone, name: bestName, messages: totalMsgs, status: "updated" });
      } else {
        summary.push({ phone: info.phone, name: existing.name, messages: totalMsgs, status: "skipped" });
      }
    } else {
      await supabase.from("contacts").insert({
        name: bestName, phone: info.phone, source: "whatsapp",
      });
      created++;
      summary.push({ phone: info.phone, name: bestName, messages: totalMsgs, status: "created" });
    }
  }

  return NextResponse.json({
    ok: true,
    total_chats: chats.size,
    created, updated,
    owner_names_excluded: Array.from(ownerNames),
    summary,
  });
}
