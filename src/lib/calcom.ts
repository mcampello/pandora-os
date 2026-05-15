// Cal.com API v2 helper

const BASE = "https://api.cal.com/v2";
const VERSION = "2024-08-13";

export interface CalBooking {
  id: number;
  uid: string;
  title: string;
  status: "accepted" | "pending" | "cancelled" | "rejected";
  start: string;
  end: string;
  duration: number;
  eventTypeId: number;
  eventType: { id: number; slug: string } | null;
  meetingUrl: string | null;
  location: string | null;
  description: string | null;
  attendees: { name: string; email: string; timeZone?: string }[];
  createdAt: string;
}

// Mapeamento event type slug → categoria do contato
// "start" = primeiro contato com prospect
// "papo"  = qualquer conversa (inclusive follow-up, segunda reunião)
// Os demais seguem a mesma lógica de primeiro contato / relacionamento
const SLUG_TO_CATEGORY: Record<string, string> = {
  "start":                    "prospect",   // primeiro papo com prospect
  "papo":                     "prospect",   // follow-up ou qualquer conversa (mantém prospect, intel atualiza depois)
  "first":                    "prospect",
  "15":                       "prospect",
  "30-min-discovery-call":    "prospect",
  "pandora-talk":             "prospect",
  "entrevista-com-campello":  "parceiro",
  "mentoria-n8n-ai":          "cliente",
};

export function categoryFromSlug(slug: string): string {
  return SLUG_TO_CATEGORY[slug] ?? "prospect";
}

export async function calFetch<T = unknown>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "cal-api-version": VERSION,
    },
  });
  if (!res.ok) throw new Error(`Cal.com ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function fetchAllBookings(apiKey: string): Promise<CalBooking[]> {
  const all: CalBooking[] = [];
  let cursor: string | undefined;

  do {
    const qs = cursor ? `?cursor=${cursor}&limit=100` : "?limit=100";
    const data = await calFetch<{ status: string; data: CalBooking[]; pagination?: { nextCursor?: string } }>(
      `/bookings${qs}`,
      apiKey
    );
    const items = (data.data ?? []).filter(Boolean);
    all.push(...items);
    cursor = data.pagination?.nextCursor;
  } while (cursor);

  return all;
}
