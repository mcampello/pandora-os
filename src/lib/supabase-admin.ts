import { createClient } from "@supabase/supabase-js";

// Bypass de RLS — use apenas em Server Components e API routes de confiança.
// Nunca exponha a service role key no client-side.
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada");
  return createClient(url, key, { auth: { persistSession: false } });
}
