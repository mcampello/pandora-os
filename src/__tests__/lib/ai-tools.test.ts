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

// ── Tool use response (Anthropic content array) ──────────────────────────────

describe("aiWithTools — tool_use response", () => {
  it("parses tool_use block and returns tool_calls", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_use",
            message: {
              content: [
                { type: "tool_use", id: "tool_1", name: "get_weather", input: { city: "São Paulo" } },
              ],
            },
          },
        ],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);

    expect(result.stop_reason).toBe("tool_use");
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls![0]).toEqual({ id: "tool_1", name: "get_weather", input: { city: "São Paulo" } });
    expect(result.content).toBe("");
  });

  it("captures text blocks alongside tool_use blocks", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_use",
            message: {
              content: [
                { type: "text", text: "Let me check the weather." },
                { type: "tool_use", id: "tool_2", name: "get_weather", input: { city: "Rio" } },
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

  it("concatenates multiple text blocks", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_use",
            message: {
              content: [
                { type: "text", text: "Hello " },
                { type: "text", text: "World" },
                { type: "tool_use", id: "t3", name: "get_weather", input: { city: "Recife" } },
              ],
            },
          },
        ],
      })
    );

    const result = await aiWithTools(MESSAGES, [TOOL]);
    expect(result.content).toBe("Hello World");
  });

  it("returns multiple tool_calls when model calls more than one tool", async () => {
    vi.mocked(fetch).mockReturnValueOnce(
      makeResponse({
        choices: [
          {
            finish_reason: "tool_use",
            message: {
              content: [
                { type: "tool_use", id: "t4a", name: "get_weather", input: { city: "Brasília" } },
                { type: "tool_use", id: "t4b", name: "get_weather", input: { city: "Salvador" } },
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

  it("returns content when response has only text block in array", async () => {
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

    expect(result.content).toBe("No tools needed.");
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
    expect(body.tools).toEqual([TOOL]);
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
