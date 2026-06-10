// ────────────────────────────────────────────
// AI helper — OpenRouter
// Use em rotas API e Server Components.
// ────────────────────────────────────────────

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

export type AIMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export interface AIOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

/**
 * Chama um modelo via OpenRouter e retorna o texto da resposta.
 * Lança erro se a chamada falhar.
 */
export async function ai(messages: AIMessage[], options: AIOptions = {}): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada");

  const model = options.model ?? process.env.OPENROUTER_DEFAULT_MODEL ?? "anthropic/claude-sonnet-4.5";

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://app.campello.me",
      "X-Title": "Pandora OS",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.max_tokens,
      response_format: options.response_format,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${error}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

/**
 * Chama o modelo esperando uma resposta JSON.
 * Faz parsing e retorna o objeto tipado.
 */
export async function aiJson<T = unknown>(messages: AIMessage[], options: AIOptions = {}): Promise<T> {
  const content = await ai(messages, { ...options, response_format: { type: "json_object" } });
  return JSON.parse(content) as T;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AIWithToolsResult {
  content: string;
  tool_calls?: ToolCall[];
  stop_reason: "end_turn" | "tool_use" | string;
}

/**
 * Chama o modelo com suporte a tool use (formato OpenAI, compatível com todos os modelos do OpenRouter).
 */
export async function aiWithTools(
  messages: AIMessage[],
  tools: ToolDefinition[],
  options: AIOptions = {}
): Promise<AIWithToolsResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY não configurada");

  const model = options.model ?? process.env.OPENROUTER_AGENT_MODEL ?? "nousresearch/hermes-3-llama-3.1-70b";

  // Converte para formato OpenAI (compatível com todos os modelos no OpenRouter)
  const openaiTools = tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    },
  }));

  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://app.campello.me",
      "X-Title": "Pandora OS",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: openaiTools,
      temperature: options.temperature ?? 0.4,
      max_tokens: options.max_tokens,
    }),
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${error}`);
  }

  const data = await res.json();
  const message = data.choices[0].message;
  const toolCalls: ToolCall[] = [];

  // OpenRouter retorna tool calls em formato OpenAI: message.tool_calls[].function
  for (const tc of message.tool_calls ?? []) {
    toolCalls.push({
      id: tc.id ?? tc.function?.name,
      name: tc.function?.name,
      input: typeof tc.function?.arguments === "string"
        ? JSON.parse(tc.function.arguments)
        : (tc.function?.arguments ?? {}),
    });
  }

  const textContent = typeof message.content === "string" ? message.content : "";

  return {
    content: textContent,
    tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
    stop_reason: data.choices[0].finish_reason ?? "end_turn",
  };
}
