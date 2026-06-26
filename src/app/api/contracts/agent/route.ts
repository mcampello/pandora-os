import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { ai, type AIMessage } from "@/lib/ai";
import { CONTRACT_SYSTEM_PROMPT as SYSTEM_PROMPT, extractContractMd } from "@/lib/doc-generation";

export async function POST(req: NextRequest) {
  console.log("[contracts/agent] POST called, url:", req.url);
  const supabase = await supabaseServer();
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) console.error("[contracts/agent] auth error:", authErr.message);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json() as {
    messages: { role: "user" | "assistant"; content: string }[];
    proposal_content?: string;
    proposal_title?: string;
    source_contract_md?: string;
    source_contract_title?: string;
    source_mode?: "template" | "duplicate";
  };

  const { messages, proposal_content, proposal_title, source_contract_md, source_contract_title, source_mode } = body;
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

  // Inject source contract as context (template or duplicate)
  if (source_contract_md) {
    const label = source_mode === "duplicate" ? "Contrato original (para duplicação)" : "Contrato modelo";
    aiMessages.push({
      role: "user",
      content: `[CONTEXTO — ${label}]\nTítulo: ${source_contract_title ?? "Contrato"}\n\n${source_contract_md}`,
    });
    const ack = source_mode === "duplicate"
      ? "Recebi o contrato original. Posso duplicá-lo adaptando partes, datas e dados do novo cliente/oportunidade conforme precisar."
      : "Recebi o contrato modelo. Posso usá-lo como referência para criar um novo ou adaptá-lo às suas necessidades.";
    aiMessages.push({ role: "assistant", content: ack });
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
