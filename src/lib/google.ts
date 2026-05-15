// Helper compartilhado para APIs Google (Gmail + Calendar)
// Lida com refresh de token e chamadas autenticadas.

export interface GoogleCredentials {
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
}

export async function getValidToken(creds: GoogleCredentials): Promise<string> {
  const expired = creds.expires_at
    ? new Date(creds.expires_at).getTime() - Date.now() < 60_000
    : false;

  if (!expired) return creds.access_token;
  if (!creds.refresh_token) throw new Error("Token expirado e sem refresh_token");

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: creds.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(`Token refresh falhou: ${data.error}`);
  return data.access_token as string;
}

export async function gFetch<T = unknown>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
