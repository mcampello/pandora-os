// Fathom Video API v1 helper
// API keys: https://fathom.video/app/api-keys

const BASE = "https://fathom.video/api/v1";

export interface FathomAttendee {
  name: string;
  email: string;
}

export interface FathomCall {
  id: number;           // recording_id (usado como external_id)
  call_id: number;      // id numérico da chamada (usado na URL)
  title: string;
  share_url: string;    // https://fathom.video/calls/{call_id}
  started_at: string;   // ISO datetime UTC
  attendees: FathomAttendee[];
}

export interface FathomSummary {
  purpose?: string;
  key_takeaways?: string[];
  topics?: { title?: string; points?: string[] }[];
  next_steps?: string[];
}

export async function fathomFetch<T = unknown>(path: string, apiKey: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`Fathom ${path} ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export async function fetchCallsSince(apiKey: string, since?: string): Promise<FathomCall[]> {
  const all: FathomCall[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({ limit: "50" });
    if (cursor) params.set("cursor", cursor);
    if (since)  params.set("created_after", since);

    const data = await fathomFetch<{
      calls?: FathomCall[];
      data?: FathomCall[];
      next_cursor?: string;
      meta?: { next_cursor?: string };
    }>(`/calls?${params}`, apiKey);

    const items = data.calls ?? data.data ?? [];
    all.push(...items);
    cursor = data.next_cursor ?? data.meta?.next_cursor;
  } while (cursor);

  return all;
}

export async function fetchCallSummary(apiKey: string, callId: number): Promise<FathomSummary | null> {
  try {
    const data = await fathomFetch<{
      summary?: FathomSummary;
      data?: FathomSummary;
      purpose?: string;
      key_takeaways?: string[];
      next_steps?: string[];
    }>(`/calls/${callId}/summary`, apiKey);

    // Normaliza resposta seja no nível raiz ou em data/summary
    return data.summary ?? data.data ?? {
      purpose: data.purpose,
      key_takeaways: data.key_takeaways,
      next_steps: data.next_steps,
    };
  } catch {
    return null;
  }
}

export function formatSummaryPT(summary: FathomSummary | null): string {
  if (!summary) return "";

  const lines: string[] = [];

  if (summary.purpose) {
    lines.push(`**Propósito:** ${summary.purpose}`);
  }

  if (summary.key_takeaways?.length) {
    lines.push("", "**Principais conclusões:**");
    for (const t of summary.key_takeaways) lines.push(`- ${t}`);
  }

  if (summary.next_steps?.length) {
    lines.push("", "**Próximos passos:**");
    for (const s of summary.next_steps) lines.push(`- ${s}`);
  }

  return lines.join("\n");
}

// Retorna true para reuniões sem valor (sem título real ou sem participantes externos)
export function isSkippable(call: FathomCall, myEmail = "mario@campello.me"): boolean {
  if (!call.title || call.title.toLowerCase().includes("impromptu")) return true;
  const external = (call.attendees ?? []).filter(a => a.email && a.email !== myEmail);
  return external.length === 0;
}
