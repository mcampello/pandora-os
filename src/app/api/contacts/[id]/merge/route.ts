import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

// POST /api/contacts/[id]/merge  { targetId: string }
// Merges [id] INTO targetId: copies missing fields, transfers interactions/snapshots, deletes [id]
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceId } = await params;
  const { targetId } = await req.json();

  if (!targetId || targetId === sourceId) {
    return NextResponse.json({ error: "targetId inválido" }, { status: 400 });
  }

  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const [{ data: source }, { data: target }] = await Promise.all([
    supabase.from("contacts").select("*").eq("id", sourceId).single(),
    supabase.from("contacts").select("*").eq("id", targetId).single(),
  ]);

  if (!source || !target) return NextResponse.json({ error: "Contato não encontrado" }, { status: 404 });

  // Merge missing fields from source → target
  const patch: Record<string, unknown> = {};
  const fields = ["email", "phone", "company", "role", "linkedin_url", "website", "notes"] as const;
  for (const f of fields) {
    if (!target[f] && source[f]) patch[f] = source[f];
  }
  // Merge tags
  if (source.tags?.length) {
    const combined = Array.from(new Set([...(target.tags ?? []), ...(source.tags ?? [])]));
    if (combined.length > (target.tags ?? []).length) patch.tags = combined;
  }
  // Keep category if target is still "desconhecido"
  if ((!target.category || target.category === "desconhecido") && source.category && source.category !== "desconhecido") {
    patch.category = source.category;
  }

  if (Object.keys(patch).length > 0) {
    await supabase.from("contacts").update(patch).eq("id", targetId);
  }

  // Transfer interactions, snapshots, opportunities
  await Promise.all([
    supabase.from("interactions").update({ contact_id: targetId }).eq("contact_id", sourceId),
    supabase.from("contact_analysis_snapshots").update({ contact_id: targetId }).eq("contact_id", sourceId),
    supabase.from("opportunities").update({ contact_id: targetId }).eq("contact_id", sourceId),
  ]);

  // Delete source contact
  await supabase.from("contacts").delete().eq("id", sourceId);

  return NextResponse.json({ ok: true, merged_into: targetId, fields_copied: Object.keys(patch) });
}
