import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { getValidToken, gFetch } from "@/lib/google";
import type { GoogleCredentials } from "@/lib/google";

interface GmailThread {
  id: string;
  snippet: string;
}

interface GmailMessage {
  id: string;
  internalDate: string;
  payload: {
    headers: { name: string; value: string }[];
  };
  snippet: string;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase.from("contacts").select("email, name").eq("id", id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!contact.email) return NextResponse.json({ error: "contact has no email" }, { status: 400 });

  // Carrega conector Gmail
  const { data: connector } = await supabase
    .from("connectors").select("credentials").eq("type", "gmail").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();
  if (!connector) return NextResponse.json({ error: "Gmail não conectado" }, { status: 400 });

  const token = await getValidToken(connector.credentials as GoogleCredentials);
  const email = contact.email;

  // Busca threads relacionados ao contato (últimos 30)
  const query = encodeURIComponent(`from:${email} OR to:${email}`);
  const { threads = [] } = await gFetch<{ threads?: GmailThread[] }>(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?q=${query}&maxResults=30`,
    token
  );

  let created = 0;

  for (const thread of threads) {
    // Pula threads já registrados
    const { count } = await supabase
      .from("interactions")
      .select("id", { count: "exact", head: true })
      .eq("external_id", `gmail_thread_${thread.id}`);
    if ((count ?? 0) > 0) continue;

    // Busca primeira mensagem do thread para pegar metadata
    const msg = await gFetch<GmailMessage>(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${thread.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date`,
      token
    ).catch(() => null);
    if (!msg) continue;

    const headers = msg.payload?.headers ?? [];
    const h = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

    const subject   = h("Subject") || "(sem assunto)";
    const from      = h("From");
    const occurred  = msg.internalDate
      ? new Date(parseInt(msg.internalDate)).toISOString()
      : new Date().toISOString();

    const isInbound = from.toLowerCase().includes(email.toLowerCase());

    await supabase.from("interactions").insert({
      contact_id: id,
      channel: "email",
      type: isInbound ? "email_in" : "email_out",
      subject,
      summary: thread.snippet?.slice(0, 500) || null,
      external_id: `gmail_thread_${thread.id}`,
      external_url: `https://mail.google.com/mail/u/0/#all/${thread.id}`,
      occurred_at: occurred,
    });

    created++;
  }

  // Atualiza last_sync_at do conector
  await supabase.from("connectors").update({ last_sync_at: new Date().toISOString() })
    .eq("type", "gmail").eq("status", "connected");

  return NextResponse.json({ synced: threads.length, created, contact_email: email });
}
