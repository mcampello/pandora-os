// ────────────────────────────────────────────
// uazapi.dev helper
// API premium para WhatsApp via QR/pair code.
// ────────────────────────────────────────────

const BASE = process.env.UAZAPI_BASE_URL ?? "https://pandora.uazapi.com";

export interface UazInstance {
  id: string;
  token: string;
  status: "disconnected" | "connecting" | "connected";
  paircode?: string;
  qrcode?: string;
  name?: string;
  profileName?: string;
  profilePicUrl?: string;
  isBusiness?: boolean;
  plataform?: string;
  systemName?: string;
  owner?: string;
}

export interface UazStatus {
  instance: UazInstance;
  status: {
    connected: boolean;
    loggedIn: boolean;
    jid: { user: string; server: string } | null;
  };
}

async function call<T = unknown>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      token,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`uazapi ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const uaz = {
  status: (token: string) => call<UazStatus>("/instance/status", token),

  connect: (token: string, body: { phone?: string; browser?: string; systemName?: string } = {}) =>
    call<{ connected: boolean; loggedIn: boolean; instance: UazInstance }>("/instance/connect", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  disconnect: (token: string) =>
    call("/instance/disconnect", token, { method: "POST" }),

  setWebhook: (token: string, url: string, events: string[] = ["messages", "connection"]) =>
    call("/webhook", token, {
      method: "POST",
      body: JSON.stringify({
        url,
        events,
        excludeMessages: ["wasSentByApi"],
      }),
    }),

  getWebhook: (token: string) =>
    call("/webhook", token),

  sendText: (token: string, number: string, text: string) =>
    call("/send/text", token, {
      method: "POST",
      body: JSON.stringify({ number, text }),
    }),

  // mediatype: "image" | "video" | "document"
  sendMedia: (token: string, number: string, mediaBase64: string, mediatype: string, caption?: string, filename?: string) =>
    call("/send/media", token, {
      method: "POST",
      body: JSON.stringify({ number, mediatype, media: mediaBase64, caption, filename }),
    }),

  // ptt: true = push-to-talk (voice message)
  sendAudio: (token: string, number: string, audioBase64: string) =>
    call("/send/audio", token, {
      method: "POST",
      body: JSON.stringify({ number, audio: audioBase64, ptt: true }),
    }),

  // Returns { base64?: string; mimetype?: string } — may fail if message expired from cache
  downloadMedia: (token: string, messageId: string, chatId: string) =>
    call<{ base64?: string; mimetype?: string; buffer?: string }>("/message/download", token, {
      method: "POST",
      body: JSON.stringify({ messageId, chatId }),
    }),
};
