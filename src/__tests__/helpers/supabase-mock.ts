import { vi } from "vitest";

export type DbResult = { data: unknown; error: { message: string } | null };

/**
 * Builds a chainable Supabase-like mock.
 *
 * `responses` is a queue consumed in order of `.from()` calls. Each entry is
 * resolved when the chain is awaited (whether via `.single()`, `.maybeSingle()`,
 * or directly). This mirrors how Supabase's PostgREST client works.
 */
export function createSupabaseMock(
  responses: DbResult[],
  user: { id: string } | null = { id: "test-user-id" }
) {
  let callIdx = 0;

  function makeChain(): Record<string, unknown> {
    const idx = callIdx++;
    const result: DbResult = responses[idx] ?? { data: null, error: null };

    const chain: Record<string, unknown> = {
      // Make the chain thenable so `await chain.method()` resolves correctly
      then(
        onFulfilled: (v: DbResult) => unknown,
        onRejected?: (e: unknown) => unknown
      ) {
        return Promise.resolve(result).then(onFulfilled, onRejected);
      },
      catch(onRejected: (e: unknown) => unknown) {
        return Promise.resolve(result).catch(onRejected);
      },
    };

    // All query-builder methods return `chain` so they can be chained freely.
    // Using `vi.fn()` lets tests assert which methods were called.
    for (const m of [
      "select",
      "insert",
      "update",
      "delete",
      "eq",
      "neq",
      "in",
      "order",
      "limit",
      "single",
      "maybeSingle",
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }

    return chain;
  }

  const mock = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation(() => makeChain()),
  };

  return mock;
}

/** Shorthand for a successful DB result */
export const ok = (data: unknown): DbResult => ({ data, error: null });

/** Shorthand for a failed DB result */
export const err = (message: string): DbResult => ({
  data: null,
  error: { message },
});
