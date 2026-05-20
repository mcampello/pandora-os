import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ai } from "@/lib/ai";

// Simple in-memory rate limiter: 20 requests/hour per user
const rateLimitMap = new Map<string, { count: number; reset: number }>();
function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);
  if (!entry || now > entry.reset) {
    rateLimitMap.set(userId, { count: 1, reset: now + 3_600_000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

async function braveSearch(query: string): Promise<string> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) return "";

  try {
    const res = await fetch(
      `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=5&text_decorations=false`,
      {
        headers: {
          "X-Subscription-Token": apiKey,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) return "";
    const data = await res.json();
    const results = (data.web?.results ?? []) as Array<{
      title: string;
      description?: string;
      url: string;
    }>;
    return results
      .map((r) => `• ${r.title}\n  ${r.description ?? ""}\n  ${r.url}`)
      .join("\n\n");
  } catch {
    return "";
  }
}

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  if (!checkRateLimit(user.id)) {
    return NextResponse.json({ error: "Limite de 20 melhorias por hora atingido." }, { status: 429 });
  }

  const body = await req.json();
  const { document, instruction, useWeb, title } = body;

  if (typeof document !== "string" || typeof instruction !== "string" || !document.trim() || !instruction.trim()) {
    return NextResponse.json({ error: "document e instruction são obrigatórios" }, { status: 400 });
  }
  if (document.length > 60_000) {
    return NextResponse.json({ error: "Documento muito grande para processar." }, { status: 413 });
  }
  if (instruction.length > 2_000) {
    return NextResponse.json({ error: "Instrução muito longa." }, { status: 400 });
  }

  let webContext = "";
  if (useWeb) {
    const searchQuery = `${title ?? ""} ${instruction}`.trim();
    webContext = await braveSearch(searchQuery);
  }

  const systemPrompt = `Você é um assistente especializado em documentos comerciais da Pandora Tech (empresa de software e IA).

Suas tarefas: melhorar propostas comerciais e contratos mantendo o estilo da Pandora — profissional, direto, sem enrolação, em português do Brasil.

Regras:
- Retorne o documento COMPLETO em markdown, com todas as seções originais preservadas
- Aplique apenas as melhorias solicitadas, sem alterar o que não foi pedido
- Mantenha emojis de seção se já existirem (📌 🧭 💰 etc.)
- Não adicione comentários, cabeçalhos ou texto fora do documento
${webContext ? `\nContexto obtido da web:\n${webContext}\n` : ""}`;

  try {
    const content = await ai(
      [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Documento atual:\n\n${document}\n\n---\n\nInstrução: ${instruction}`,
        },
      ],
      { temperature: 0.4, max_tokens: 8000 }
    );

    return NextResponse.json({ content });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
