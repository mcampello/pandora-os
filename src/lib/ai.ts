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
