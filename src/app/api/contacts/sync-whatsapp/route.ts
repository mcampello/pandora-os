import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// Sincroniza contatos a partir de mensagens 1:1 (não-grupo) na tabela documents.
// Lê chatIds únicos que não terminam em @g.us, extrai phone e senderName,
// e cria/atualiza contatos.

interface DocumentRow {
  metadata: {
    chatId?: string;
    senderName?: string;
    date?: string;
  };
}

export async function POST() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  // Busca chatIds únicos de conversas 1:1
  // Paginação manual pra evitar limites
  const seen = new Map<string, { name: string; lastDate: string; count: number }>();
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("documents")
      .select("metadata")
      .not("metadata->>chatId", "ilike", "%@g.us")
      .not("metadata->>chatId", "is", null)
      .range(offset, offset + pageSize - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;

    for (const row of data as DocumentRow[]) {
      const chatId = row.metadata?.chatId;
      const name   = row.metadata?.senderName;
      const date   = row.metadata?.date;
      if (!chatId) continue;
      const phone  = chatId.replace(/@.*$/, "").replace(/\\D/g, "");
      if (!phone || phone.length < 8) continue;

      const existing = seen.get(phone);
      if (!existing) {
        seen.set(phone, { name: name || phone, lastDate: date || "", count: 1 });
      } else {
        existing.count++;
        if (date && date > existing.lastDate) {
          existing.lastDate = date;
          if (name) existing.name = name;
        }
      }
    }

    if (data.length < pageSize) break;
    offset += pageSize;
  }

  // Para cada chatId único, cria/atualiza contato
  let created = 0;
  let updated = 0;

  for (const [phone, info] of seen) {
    const { data: existing } = await supabase
      .from("contacts").select("id, name").eq("phone", phone).maybeSingle();

    if (existing) {
      // Atualiza nome se estiver vazio ou for igual ao phone
      if (!existing.name || existing.name === phone) {
        await supabase.from("contacts").update({ name: info.name }).eq("id", existing.id);
        updated++;
      }
    } else {
      await supabase.from("contacts").insert({
        name: info.name,
        phone,
        source: "whatsapp",
      });
      created++;
    }
  }

  return NextResponse.json({
    ok: true,
    total_chats: seen.size,
    created,
    updated,
  });
}
