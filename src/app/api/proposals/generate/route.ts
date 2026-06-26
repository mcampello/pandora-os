import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateProposalMarkdown } from "@/lib/doc-generation";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, context } = await req.json();
  if (!title) return NextResponse.json({ error: "title é obrigatório" }, { status: 400 });

  try {
    const content_md = await generateProposalMarkdown(title, context);
    return NextResponse.json({ content_md });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao chamar AI";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
