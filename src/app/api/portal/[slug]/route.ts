import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { PORTAL_COOKIE } from "@/lib/portal-auth";

async function resolvePortalSession(supabase: Awaited<ReturnType<typeof supabaseServer>>, req: NextRequest, slug: string) {
  const token = req.cookies.get(PORTAL_COOKIE)?.value;
  if (!token) return null;

  const { data: session } = await supabase
    .from("portal_sessions")
    .select("portal_id, expires_at, portals!inner(id, slug, label, opportunity_id, active)")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (!session) return null;
  const portal = (session as unknown as { portals: { slug: string; active: boolean; id: string; label: string; opportunity_id: string } }).portals;
  if (!portal || portal.slug !== slug || !portal.active) return null;
  return { portalId: portal.id, opportunityId: portal.opportunity_id, label: portal.label };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await supabaseServer();
  const session = await resolvePortalSession(supabase, req, slug);
  if (!session) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { portalId, opportunityId } = session;

  // Buscar oportunidade e cliente vinculado
  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, status, converted_to_client_id, contacts(id, name, company, email)")
    .eq("id", opportunityId)
    .maybeSingle();

  // Propostas e contratos via client vinculado
  const clientId = opportunity?.converted_to_client_id;
  const [proposalsRes, contractsRes, documentsRes, messagesRes] = await Promise.all([
    clientId
      ? supabase.from("proposals").select("id, title, value, status, viewer_url, sent_at, version").eq("client_id", clientId).order("created_at", { ascending: false })
      : { data: [] },
    clientId
      ? supabase.from("contracts").select("id, title, value, status, viewer_url, signed_at, starts_at, ends_at, version").eq("client_id", clientId).order("created_at", { ascending: false })
      : { data: [] },
    supabase.from("portal_documents").select("id, name, file_url, size_bytes, mime_type, uploaded_at").eq("portal_id", portalId).order("uploaded_at", { ascending: false }),
    supabase.from("portal_messages").select("id, content, created_at").eq("portal_id", portalId).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    portal: { id: portalId, label: session.label },
    opportunity,
    proposals:  proposalsRes.data  ?? [],
    contracts:  contractsRes.data  ?? [],
    documents:  documentsRes.data  ?? [],
    messages:   messagesRes.data   ?? [],
  });
}
