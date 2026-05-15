import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

interface UazContact {
  contact_name: string;
  contact_FirstName: string;
  jid: string;
}

export interface WhatsAppMatch {
  name: string;
  phone: string;   // digits only, e.g. "5511999990000"
  jid: string;     // e.g. "5511999990000@s.whatsapp.net"
  score: number;
}

function normalize(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

function similarity(a: string, b: string): number {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;

  // Token overlap
  const tokA = new Set(na.split(/\s+/));
  const tokB = new Set(nb.split(/\s+/));
  const intersection = [...tokA].filter((t) => tokB.has(t)).length;
  const union = new Set([...tokA, ...tokB]).size;
  return intersection / union;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts").select("name, phone").eq("id", id).single();
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Load WhatsApp connector token
  const { data: connector } = await supabase
    .from("connectors").select("credentials")
    .eq("type", "whatsapp").eq("status", "connected")
    .order("created_at").limit(1).maybeSingle();
  if (!connector) return NextResponse.json({ error: "WhatsApp não conectado" }, { status: 400 });

  const token = (connector.credentials as { instance_token: string }).instance_token;
  const base = process.env.UAZAPI_BASE_URL ?? "https://pandora.uazapi.com";

  const res = await fetch(`${base}/contacts`, { headers: { token } });
  if (!res.ok) return NextResponse.json({ error: "Falha ao buscar agenda do WhatsApp" }, { status: 502 });

  const contacts: UazContact[] = await res.json();

  const matches: WhatsAppMatch[] = contacts
    .filter((c) => c.jid.endsWith("@s.whatsapp.net")) // only direct contacts, skip groups/lids
    .map((c) => {
      const phone = c.jid.replace("@s.whatsapp.net", "");
      const score = similarity(contact.name, c.contact_name || c.contact_FirstName || "");
      return { name: c.contact_name || c.contact_FirstName || phone, phone, jid: c.jid, score };
    })
    .filter((m) => m.score > 0.3)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  return NextResponse.json({ matches, contact_name: contact.name });
}
