import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("client_id");
  if (!clientId) return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });

  // Resolve client + company_id
  const { data: client } = await supabase
    .from("clients")
    .select("contact_id, company_id")
    .eq("id", clientId)
    .maybeSingle();

  if (!client?.contact_id) return NextResponse.json([]);

  // Collect all contact_ids for the company (main contact + all others in same company)
  let contactIds: string[] = [client.contact_id];
  if (client.company_id) {
    const { data: companyContacts } = await supabase
      .from("contacts")
      .select("id")
      .eq("company_id", client.company_id);
    if (companyContacts?.length) {
      contactIds = [...new Set([...contactIds, ...companyContacts.map(c => c.id)])];
    }
  }

  // Fetch all meeting/message interactions from those contacts
  const { data, error } = await supabase
    .from("interactions")
    .select("id, contact_id, subject, content, occurred_at, external_url, metadata, channel, type")
    .in("contact_id", contactIds)
    .in("channel", ["fathom", "whatsapp", "manual"])
    .order("occurred_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
