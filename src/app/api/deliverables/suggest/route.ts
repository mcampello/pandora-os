import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { aiJson } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { client_id, month } = await req.json();
  if (!client_id) return NextResponse.json({ error: "client_id obrigatório" }, { status: 400 });

  // fetch the active/signed contract with content
  const { data: contracts } = await supabase
    .from("contracts")
    .select("title, content_md, value, starts_at, ends_at")
    .eq("client_id", client_id)
    .in("status", ["active", "signed"])
    .not("content_md", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const contract = contracts?.[0];

  // build context for AI
  const monthLabel = month
    ? new Date(month + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    : new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const contractContext = contract
    ? `Contrato: ${contract.title}\n\nEscopo:\n${contract.content_md}`
    : "Sem contrato com escopo definido — sugira entregas genéricas de manutenção e acompanhamento mensal.";

  const suggestions = await aiJson<{ items: string[] }>([
    {
      role: "system",
      content:
        "Você é um gestor de projetos experiente. Analise o escopo do contrato e sugira entregas concretas e mensuráveis para o mês indicado. Cada entrega deve ser uma ação específica, não um tema geral. Responda APENAS com JSON no formato {\"items\": [\"...\",\"...\"]}.",
    },
    {
      role: "user",
      content: `${contractContext}\n\nMês: ${monthLabel}\n\nSugira entre 4 e 8 entregas específicas para este mês, baseadas no escopo contratado.`,
    },
  ]);

  return NextResponse.json({ items: suggestions.items ?? [] });
}
