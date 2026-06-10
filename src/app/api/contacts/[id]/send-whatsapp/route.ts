import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { uaz } from "@/lib/uazapi";

async function getConnectorToken(supabase: Awaited<ReturnType<typeof supabaseServer>>) {
  const { data: connector } = await supabase
    .from("connectors")
    .select("credentials")
    .eq("type", "whatsapp")
    .eq("status", "connected")
    .limit(1)
    .single();

  if (!connector) return null;
  const credentials = connector.credentials as { instance_token?: string };
  return credentials?.instance_token ?? null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase
    .from("contacts").select("id, name, phone").eq("id", id).single();
  if (!contact) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!contact.phone) return NextResponse.json({ error: "contact has no phone" }, { status: 400 });

  const token = await getConnectorToken(supabase);
  if (!token) return NextResponse.json({ error: "WhatsApp connector not connected" }, { status: 503 });

  const number = contact.phone.replace(/\D/g, "");
  const contentType = req.headers.get("content-type") ?? "";

  try {
    // ── Multipart (file/audio upload) ──────────────────────────────
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file") as File | null;
      const kind = form.get("kind") as string | null; // "image" | "audio" | "document" | "video"
      const caption = (form.get("caption") as string | null) ?? undefined;

      if (!file) return NextResponse.json({ error: "file is required" }, { status: 400 });

      const bytes = await file.arrayBuffer();
      const base64 = Buffer.from(bytes).toString("base64");
      const dataUri = `data:${file.type};base64,${base64}`;

      if (kind === "audio") {
        await uaz.sendAudio(token, number, dataUri);
      } else {
        const mediatype = kind === "image" ? "image" : kind === "video" ? "video" : "document";
        await uaz.sendMedia(token, number, dataUri, mediatype, caption, file.name);
      }

      return NextResponse.json({ ok: true });
    }

    // ── JSON (plain text) ──────────────────────────────────────────
    const body = await req.json() as { text?: string };
    if (!body.text?.trim()) return NextResponse.json({ error: "text is required" }, { status: 400 });
    await uaz.sendText(token, number, body.text.trim());
    return NextResponse.json({ ok: true });

  } catch (err) {
    const message = err instanceof Error ? err.message : "send failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
