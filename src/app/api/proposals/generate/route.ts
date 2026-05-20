import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ai } from "@/lib/ai";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { title, context } = await req.json();
  if (!title) return NextResponse.json({ error: "title é obrigatório" }, { status: 400 });

  const systemPrompt = `Você é um assistente especializado em redigir propostas comerciais para a Pandora Tech LTDA (Mario Campello, mario@campello.me, CNPJ 65.344.242/0001-48). Escreva propostas profissionais em Markdown, em português do Brasil. Use emojis para destacar seções principais (📌 Objeto, 🧭 Modelo de trabalho, 📦 Entregáveis, 💰 Investimento, ✅ Premissas, ⊘ Não incluso, ✍️ Aceite). Inclua tabelas para investimento. Use linguagem direta e profissional. Ao final, inclua uma seção de identificação das partes. Substitua dados desconhecidos por [PREENCHER].`;

  const userMsg = `Crie uma proposta comercial completa para: "${title}"${context ? `\n\nContexto adicional:\n${context}` : ""}`;

  try {
    const content_md = await ai(
      [{ role: "system", content: systemPrompt }, { role: "user", content: userMsg }],
      { temperature: 0.5, max_tokens: 4096 }
    );
    return NextResponse.json({ content_md });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao chamar AI";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
