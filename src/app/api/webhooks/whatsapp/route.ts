import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { uaz } from "@/lib/uazapi";
import { transcribeAudio } from "@/lib/whisper";

const WEBHOOK_SECRET = process.env.WHATSAPP_WEBHOOK_SECRET ?? "";
const INSTANCE_TOKEN = process.env.UAZAPI_INSTANCE_TOKEN ?? "403e482e-19bf-448c-b95c-c89dc8a66af7";
const STORAGE_BUCKET = "whatsapp-media";

// Map uazapi messageType → our canonical type
function canonicalType(messageType: string): string {
  if (messageType === "conversation" || messageType === "extendedTextMessage") return "text";
  if (messageType === "audioMessage" || messageType === "pttMessage") return "audio";
  if (messageType === "imageMessage") return "image";
  if (messageType === "documentMessage") return "document";
  if (messageType === "videoMessage") return "video";
  if (messageType === "stickerMessage") return "sticker";
  return "unknown";
}

function extFromMime(mime: string): string {
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("mp4")) return "mp4";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("pdf")) return "pdf";
  return "bin";
}

async function downloadAndStore(
  token: string,
  messageId: string,
  chatId: string,
  mimeHint: string,
): Promise<{ url: string | null; mime: string }> {
  const supabase = supabaseAdmin();
  try {
    const dl = await uaz.downloadMedia(token, messageId, chatId);
    const b64 = dl.base64 ?? dl.buffer ?? null;
    if (!b64) return { url: null, mime: mimeHint };

    const mime = dl.mimetype ?? mimeHint;
    const ext = extFromMime(mime);
    const path = `${chatId}/${messageId}.${ext}`;
    const bytes = Buffer.from(b64, "base64");

    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: true });

    if (error) {
      console.error("Storage upload error:", error.message);
      return { url: null, mime };
    }

    const { data: pub } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, mime };
  } catch (err) {
    console.error("downloadAndStore error:", err);
    return { url: null, mime: mimeHint };
  }
}

export async function POST(req: NextRequest) {
  // Accept secret via header OR query param (uazapi sends via URL)
  const headerSecret = req.headers.get("x-webhook-secret") ?? "";
  const querySecret = req.nextUrl.searchParams.get("secret") ?? "";
  const secret = headerSecret || querySecret;
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json() as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  // uazapi wraps events in an array or sends a single event
  const events: Record<string, unknown>[] = Array.isArray(payload) ? payload : [payload];

  // Process async but respond immediately
  void processEvents(events);

  return NextResponse.json({ ok: true });
}

async function processEvents(events: Record<string, unknown>[]) {
  const supabase = supabaseAdmin();

  for (const event of events) {
    const data = (event.data ?? event) as Record<string, unknown>;
    const key = data.key as Record<string, unknown> | undefined;
    if (!key) continue;

    const messageId = key.id as string | undefined;
    const chatId = (key.remoteJid as string | undefined)?.split("@")[0]
      ? (key.remoteJid as string)
      : null;
    if (!messageId || !chatId) continue;

    // Skip group messages (contain @g.us)
    if (chatId.includes("@g.us")) continue;

    const fromMe = !!(key.fromMe as boolean | undefined);
    const senderName = (data.pushName as string | undefined) ?? null;
    const rawType = (data.messageType as string | undefined) ?? "conversation";
    const msgType = canonicalType(rawType);

    // Ignore non-content messages
    if (msgType === "unknown") continue;

    const tsRaw = data.messageTimestamp as number | string | undefined;
    const timestamp = tsRaw
      ? new Date(typeof tsRaw === "number" ? tsRaw * 1000 : tsRaw).toISOString()
      : new Date().toISOString();

    const message = data.message as Record<string, unknown> | undefined;

    let content: string | null = null;
    let mediaUrl: string | null = null;
    let mediaMime: string | null = null;
    let mediaDuration: number | null = null;
    let mediaFilename: string | null = null;
    let mediaCaption: string | null = null;

    if (msgType === "text") {
      content =
        (message?.conversation as string | undefined) ??
        ((message?.extendedTextMessage as Record<string, unknown> | undefined)?.text as string | undefined) ??
        null;
    } else if (msgType === "audio") {
      const audioMsg = (message?.audioMessage ?? message?.pttMessage) as Record<string, unknown> | undefined;
      mediaMime = (audioMsg?.mimetype as string | undefined) ?? "audio/ogg";
      mediaDuration = (audioMsg?.seconds as number | undefined) ?? null;

      const { url, mime } = await downloadAndStore(INSTANCE_TOKEN, messageId, chatId, mediaMime);
      mediaUrl = url;
      mediaMime = mime;

      if (url) {
        // Transcribe from Storage URL
        try {
          const res = await fetch(url);
          if (res.ok) {
            const buf = Buffer.from(await res.arrayBuffer());
            content = await transcribeAudio(buf, mime);
          }
        } catch { /* transcription optional */ }
      }
    } else if (msgType === "image") {
      const imgMsg = (message?.imageMessage) as Record<string, unknown> | undefined;
      mediaMime = (imgMsg?.mimetype as string | undefined) ?? "image/jpeg";
      mediaCaption = (imgMsg?.caption as string | undefined) ?? null;

      const { url, mime } = await downloadAndStore(INSTANCE_TOKEN, messageId, chatId, mediaMime);
      mediaUrl = url;
      mediaMime = mime;
    } else if (msgType === "document") {
      const docMsg = (message?.documentMessage) as Record<string, unknown> | undefined;
      mediaMime = (docMsg?.mimetype as string | undefined) ?? "application/octet-stream";
      mediaFilename = (docMsg?.fileName as string | undefined) ?? null;
      mediaCaption = (docMsg?.caption as string | undefined) ?? null;

      const { url, mime } = await downloadAndStore(INSTANCE_TOKEN, messageId, chatId, mediaMime);
      mediaUrl = url;
      mediaMime = mime;
    } else if (msgType === "video") {
      const vidMsg = (message?.videoMessage) as Record<string, unknown> | undefined;
      mediaMime = (vidMsg?.mimetype as string | undefined) ?? "video/mp4";
      mediaCaption = (vidMsg?.caption as string | undefined) ?? null;
      mediaDuration = (vidMsg?.seconds as number | undefined) ?? null;

      const { url, mime } = await downloadAndStore(INSTANCE_TOKEN, messageId, chatId, mediaMime);
      mediaUrl = url;
      mediaMime = mime;
    } else if (msgType === "sticker") {
      const stMsg = (message?.stickerMessage) as Record<string, unknown> | undefined;
      mediaMime = (stMsg?.mimetype as string | undefined) ?? "image/webp";

      const { url, mime } = await downloadAndStore(INSTANCE_TOKEN, messageId, chatId, mediaMime);
      mediaUrl = url;
      mediaMime = mime;
    }

    const row = {
      message_id: messageId,
      chat_id: chatId,
      from_me: fromMe,
      sender_name: senderName,
      message_type: msgType,
      content,
      media_url: mediaUrl,
      media_mime_type: mediaMime,
      media_duration: mediaDuration,
      media_filename: mediaFilename,
      media_caption: mediaCaption,
      timestamp,
    };

    const { error } = await supabase
      .from("whatsapp_messages")
      .upsert(row, { onConflict: "message_id", ignoreDuplicates: true });

    if (error) console.error("whatsapp_messages insert error:", error.message, row);
  }
}
