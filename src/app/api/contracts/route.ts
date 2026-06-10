import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { contractViewerUrl } from "@/lib/docs";

const SELECT = "*, client:clients(id,company_name,status), opportunity:opportunities(id,title,status)";

export async function GET(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const clientId = searchParams.get("client_id");
  const opportunityId = searchParams.get("opportunity_id");
  const statusParam = searchParams.get("status");
  const groupId = searchParams.get("group_id");
  const q = searchParams.get("q");

  let query = supabase
    .from("contracts")
    .select(SELECT)
    .order("created_at", { ascending: false });

  if (clientId) query = query.eq("client_id", clientId);
  if (opportunityId) query = query.eq("opportunity_id", opportunityId);
  if (groupId) query = query.eq("contract_group_id", groupId);
  if (q) query = query.ilike("title", `%${q}%`);
  if (statusParam) {
    const statuses = statusParam.split(",").filter(Boolean);
    if (statuses.length === 1) query = query.eq("status", statuses[0]);
    else query = query.in("status", statuses);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const {
    title, content_md, client_id, opportunity_id, company_id,
    value, status, starts_at, ends_at,
    contract_group_id, version,
  } = body;

  if (!title) return NextResponse.json({ error: "title é obrigatório" }, { status: 400 });

  const insert: Record<string, unknown> = {
    title,
    content_md: content_md ?? null,
    client_id: client_id ?? null,
    opportunity_id: opportunity_id ?? null,
    company_id: company_id ?? null,
    value: value ?? null,
    status: status ?? "draft",
    starts_at: starts_at ?? null,
    ends_at: ends_at ?? null,
  };

  if (contract_group_id) insert.contract_group_id = contract_group_id;
  if (version != null) insert.version = version;

  const { data, error } = await supabase
    .from("contracts")
    .insert(insert)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const viewerUrl = contractViewerUrl(data.id);
  await supabase.from("contracts").update({ viewer_url: viewerUrl }).eq("id", data.id);
  data.viewer_url = viewerUrl;

  return NextResponse.json(data, { status: 201 });
}
