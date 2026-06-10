import { createClient } from "@supabase/supabase-js";

function makeAdminClient(schema: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Falls back to anon key when service role key is absent.
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { db: { schema }, auth: { persistSession: false } });
}

export function supabaseAdmin() {
  return makeAdminClient(process.env.NEXT_PUBLIC_SUPABASE_SCHEMA || "public");
}

// Always queries public schema — use for N8N-managed tables (documents, groups, participants).
export function supabasePublic() {
  return makeAdminClient("public");
}
