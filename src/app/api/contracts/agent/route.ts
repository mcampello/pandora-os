import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ai, type AIMessage } from "@/lib/ai";
import { CONTRACT_SYSTEM_PROMPT as SYSTEM_PROMPT, extractContractMd } from "@/lib/doc-generation";

export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
    proposal_content?: string;
    proposal_title?: string;
  };

  const { messages, proposal_content, proposal_title } = body;
  if (!messages?.length) return NextResponse.json({ error: "messages obrigatório" }, { status: 400 });

  const aiMessages: AIMessage[] = [{ role: "system", content: SYSTEM_PROMPT }];

  // Inject proposal as context before the conversation
  if (proposal_content) {
    aiMessages.push({
      role: "user",
      content: `[CONTEXTO — Proposta base]\nTítulo: ${proposal_title ?? "Proposta"}\n\n${proposal_content}`,
    });
    aiMessages.push({
      role: "assistant",
      content: "Recebi a proposta. Pode me pedir para gerar o rascunho do contrato ou fazer perguntas.",
    });
  }

  aiMessages.push(...messages);

  const response = await ai(aiMessages, {
    model: "anthropic/claude-sonnet-4-5",
    temperature: 0.3,
    max_tokens: 8000,
  });

  // Parse contract block from response
  const contractMd = extractContractMd(response);
  const reply = contractMd
    ? response.replace(/<CONTRATO>[\s\S]*?<\/CONTRATO>/, "").trim() || "Contrato atualizado."
    : response;

  return NextResponse.json({ reply, contract_md: contractMd });
}
