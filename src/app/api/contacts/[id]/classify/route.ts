import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { supabasePublic } from "@/lib/supabase-admin";
import { aiJson } from "@/lib/ai";

interface Classification {
  category: "prospect" | "cliente_consultoria" | "cliente_aluno" | "fornecedor" | "parceiro" | "casual" | "desconhecido";
  tags: string[];
  short_summary: string;
  message_count_analyzed: number;
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: contact } = await supabase.from("contacts").select("*").eq("id", id).maybeSingle();
  if (!contact) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!contact.phone) return NextResponse.json({ error: "no_phone" }, { status: 400 });

  const phoneDigits = contact.phone.replace(/\D/g, "");
  const { data: docs } = await supabasePublic()
    .from("documents").select("content, metadata")
    .filter("metadata->>chatId", "ilike", `%${phoneDigits}%`)
    .order("id", { ascending: false }).limit(40);

  if (!docs || docs.length < 1) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 });
  }

  const messagesText = docs.map((d) => (d.content ?? "").slice(0, 300)).filter(Boolean).join("\n---\n");

  const result = await aiJson<Classification>([
    {
      role: "system",
      content: `Você é o assistente do Mario Campello, consultor de AI e professor (Pandora Tech).
Mario presta consultoria de R$8-12k/mês (40-50h, 6 meses mínimo, automações com AI).
Mario também dá aulas de N8N em escolas (echos.cc, somostera.com).

Sua missão: classificar contatos a partir do conteúdo de conversas no WhatsApp.

Categorias possíveis:
- prospect: alguém demonstrando interesse em contratar ou negociando
- cliente_consultoria: cliente ativo de consultoria
- cliente_aluno: aluno em algum curso/aula
- fornecedor: alguém de quem Mario compra serviços
- parceiro: outro profissional, parceiro, indicador
- casual: amigo, conversa pessoal, sem fit comercial
- desconhecido: não dá pra inferir

Tags são livres, em português, lowercase com hífen. Ex: "interesse-em-automação", "n8n", "indicação", "boas-vindas".`,
    },
    {
      role: "user",
      content: `Contato: ${contact.name} (${contact.phone})
${contact.company ? `Empresa: ${contact.company}\n` : ""}${contact.role ? `Cargo: ${contact.role}\n` : ""}
Últimas ${docs.length} mensagens do WhatsApp (mais recente primeiro):

${messagesText}

Retorne JSON com:
- "category": uma das categorias acima
- "tags": array de 2-5 tags relevantes
- "short_summary": frase curta (até 200 chars) descrevendo o relacionamento
- "message_count_analyzed": ${docs.length}`,
    },
  ], { model: "google/gemini-2.5-flash" });

  // Salva no contato
  await supabase.from("contacts").update({
    tags: result.tags,
    ai_summary: result.short_summary,
    ai_summary_updated_at: new Date().toISOString(),
    notes: contact.notes
      ? `[${result.category}] ${result.short_summary}\n\n${contact.notes}`.slice(0, 2000)
      : `[${result.category}] ${result.short_summary}`,
  }).eq("id", id);

  return NextResponse.json(result);
}
