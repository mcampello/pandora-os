import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { aiWithTools } from "@/lib/ai";
import type { AIMessage, ToolDefinition } from "@/lib/ai";

const TOOL: ToolDefinition = {
  name: "get_weather",
  description: "Get the current weather for a city",
  input_schema: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
};

const MESSAGES: AIMessage[] = [{ role: "user", content: "What is the weather in São Paulo?" }];

function makeResponse(body: unknown, ok = true, status = 200) {
  return Promise.resolve({
    ok,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  } as Response);
}

beforeEach(() => {
  process.env.OPENROUTER_API_KEY = "test-key";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPENROUTER_API_KEY;
});

// ── Tool use response (OpenAI tool_calls format via OpenRouter) ──────────────
// aiWithTools fala o formato OpenAI: choices[0].message.tool_calls[].function,
// com arguments como string JSON. Os mocks abaixo refletem esse formato.

describe("aiWithTools — tool_use response", () => {
  it("parses tool_calls and returns them", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "",
              tool_calls: [
                { id: "tool_1", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "São Paulo" }) } },
              ],
            },
          },
        ],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);

    expect(result.stop_reason).toBe("tool_calls");
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0]).toEqual({ id: "tool_1", name: "get_weather", input: { city: "São Paulo" } });
    expect(result.content).toBe("");
  });

  it("captures text content alongside tool_calls", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "Let me check the weather.",
              tool_calls: [
                { id: "tool_2", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Rio" }) } },
              ],
            },
          },
        ],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);

    expect(result.content).toBe("Let me check the weather.");
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0].name).toBe("get_weather");
  });

  it("parses tool_call arguments already provided as an object", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "",
              tool_calls: [
                { id: "t3", type: "function", function: { name: "get_weather", arguments: { city: "Recife" } } },
              ],
            },
          },
        ],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);
    expect(result.tool_calls![0].input).toEqual({ city: "Recife" });
  });

  it("returns multiple tool_calls when model calls more than one tool", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: "",
              tool_calls: [
                { id: "t4a", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Brasília" }) } },
                { id: "t4b", type: "function", function: { name: "get_weather", arguments: JSON.stringify({ city: "Salvador" }) } },
              ],
            },
          },
        ],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);
    expect(result.tool_calls).toHaveLength(2);
    expect(result.tool_calls![0].id).toBe("t4a");
    expect(result.tool_calls![1].id).toBe("t4b");
  });
});

// ── Plain text response (no tool use) ───────────────────────────────────────

describe("aiWithTools — plain text response", () => {
  it("returns content and no tool_calls when model answers directly (string content)", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [{ finish_reason: "end_turn", message: { content: "It is sunny in São Paulo." } }],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);

    expect(result.content).toBe("It is sunny in São Paulo.");
    expect(result.tool_calls).toBeUndefined();
    expect(result.stop_reason).toBe("end_turn");
  });

  it("returns empty content when message.content is not a string (e.g. array)", async () => {
    // O formato OpenAI usa content como string; se vier um array (não-string),
    // aiWithTools normaliza para "" em vez de tentar parsear blocos.
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "end_turn",
            message: { content: [{ type: "text", text: "No tools needed." }] },
          },
        ],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);

    expect(result.content).toBe("");
    expect(result.tool_calls).toBeUndefined();
  });

  it("handles null/missing content gracefully", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [{ finish_reason: "end_turn", message: { content: null } }],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);
    expect(result.content).toBe("");
    expect(result.tool_calls).toBeUndefined();
  });

  it("falls back to 'end_turn' when finish_reason is missing", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [{ message: { content: "ok" } }],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);
    expect(result.stop_reason).toBe("end_turn");
  });
});

// ── Request shape ────────────────────────────────────────────────────────────

describe("aiWithTools — request shape", () => {
  it("sends tools array in the request body", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({ choices: [{ finish_reason: "end_turn", message: { content: "ok" } }] })
    );

    await aiWithTools(MESSAGES, [TOOL]);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    // aiWithTools converte as ToolDefinition para o formato OpenAI antes de enviar.
    expect(body.tools).toEqual([
      {
        type: "function",
        function: { name: TOOL.name, description: TOOL.description, parameters: TOOL.input_schema },
      },
    ]);
    expect(body.messages).toEqual(MESSAGES);
  });

  it("does not include response_format in the request body", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({ choices: [{ finish_reason: "end_turn", message: { content: "ok" } }] })
    );

    await aiWithTools(MESSAGES, [TOOL]);

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.response_format).toBeUndefined();
  });

  it("respects model override from options", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({ choices: [{ finish_reason: "end_turn", message: { content: "ok" } }] })
    );

    await aiWithTools(MESSAGES, [TOOL], { model: "openai/gpt-4o" });

    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("openai/gpt-4o");
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe("aiWithTools — error handling", () => {
  it("throws when OPENROUTER_API_KEY is not set", async () => {
    delete process.env.OPENROUTER_API_KEY;

    await expect(aiWithTools(MESSAGES, [TOOL])).rejects.toThrow("OPENROUTER_API_KEY não configurada");
  });

  it("throws on non-ok HTTP response", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse("Unauthorized", false, 401)
    );

    await expect(aiWithTools(MESSAGES, [TOOL])).rejects.toThrow("OpenRouter 401");
  });
});
