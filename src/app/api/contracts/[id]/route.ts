import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { createClient } from "@supabase/supabase-js";

const SELECT = "*, client:clients(id,company_name,status), opportunity:opportunities(id,title,status)";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("contracts")
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(data);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();

  const { id } = await params;
  const body = await req.json();

  const isMarkView = Object.keys(body).length === 1 && "viewed_at" in body;
  if (!user && !isMarkView) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { data: existing } = await supabase
    .from("contracts")
    .select("id, status, signed_at, viewed_at, opportunity_id, client_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const patch: Record<string, unknown> = {};

  if (body.title !== undefined) patch.title = body.title;
  if (body.content_md !== undefined) patch.content_md = body.content_md || null;
  if (body.value !== undefined) patch.value = body.value ?? null;
  if (body.client_id !== undefined) patch.client_id = body.client_id || null;
  if (body.opportunity_id !== undefined) patch.opportunity_id = body.opportunity_id || null;
  if (body.starts_at !== undefined) patch.starts_at = body.starts_at || null;
  if (body.ends_at !== undefined) patch.ends_at = body.ends_at || null;
  if (body.signature_provider !== undefined) patch.signature_provider = body.signature_provider || null;

  if (body.status !== undefined) {
    patch.status = body.status;
    if (body.status === "signed" && !existing.signed_at) {
      patch.signed_at = new Date().toISOString();

      // Auto-convert linked opportunity when contract is signed
      const oppId = existing.opportunity_id ?? body.opportunity_id;
      if (oppId) {
        const { data: opp } = await supabase
          .from("opportunities")
          .select("id, title, status, contact_id, converted_to_client_id, contact:contacts(id, name, company, company_id)")
          .eq("id", oppId)
          .maybeSingle();

        if (opp && opp.status !== "converted") {
          let clientId = opp.converted_to_client_id as string | null;

          if (!clientId) {
            const contact = opp.contact as { id: string; name: string; company?: string; company_id?: string } | null;
            const { data: client } = await supabase
              .from("clients")
              .insert({
                contact_id: opp.contact_id,
                company_id: contact?.company_id ?? null,
                company_name: contact?.company ?? opp.title,
                status: "active",
                renewal_auto: true,
              })
              .select("id")
              .single();
            if (client) clientId = client.id;
          }

          if (clientId) {
            await supabase
              .from("opportunities")
              .update({ status: "converted", converted_to_client_id: clientId })
              .eq("id", opp.id);
            if (!existing.client_id) patch.client_id = clientId;
          }
        }
      }
    }
  }

  if (body.viewed_at !== undefined && !existing.viewed_at) {
    patch.viewed_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "nenhum campo para atualizar" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("contracts")
    .update(patch)
    .eq("id", id)
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await supabase.from("contracts").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}
