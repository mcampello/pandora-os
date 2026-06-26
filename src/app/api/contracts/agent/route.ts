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

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OPENROUTER_API_KEY não configurada" }, { status: 500 });

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.campello.me",
        "X-Title": "Pandora OS - Dr. Claudio",
      },
      body: JSON.stringify({
        model: AGENT_MODEL,
        stream: true,
        messages: aiMessages,
        temperature: 0.3,
        max_tokens: 8000,
      }),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erro ao chamar AI";
    console.error("[contracts/agent] fetch error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  if (!upstreamRes.ok) {
    const errText = await upstreamRes.text();
    console.error("[contracts/agent] OpenRouter error", upstreamRes.status, errText);
    return NextResponse.json({ error: `OpenRouter ${upstreamRes.status}: ${errText}` }, { status: 500 });
  }

  const upstream = upstreamRes.body;
  if (!upstream) return NextResponse.json({ error: "Sem stream" }, { status: 500 });

  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      const dec = new TextDecoder();
      let buf = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6).trim();
            if (json === "[DONE]") continue;
            try {
              const parsed = JSON.parse(json) as { choices?: Array<{ delta?: { content?: string } }> };
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(new TextEncoder().encode(delta));
            } catch { /* skip malformed chunks */ }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });

  // Parse contract block from response
  const contractMd = extractContractMd(response);
  const reply = contractMd
    ? response.replace(/<CONTRATO>[\s\S]*?<\/CONTRATO>/, "").trim() || "Contrato atualizado."
    : response;

  return NextResponse.json({ reply, contract_md: contractMd });
}
