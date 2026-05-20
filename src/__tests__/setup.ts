import { vi } from "vitest";

// Stub next/headers (used by supabaseServer in API routes)
vi.mock("next/headers", () => ({
  cookies: vi.fn(() => ({
    getAll: () => [],
    set: vi.fn(),
  })),
}));

// Provide env vars required by docs.ts / route handlers
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key-test";
process.env.NEXT_PUBLIC_APP_URL = "https://app.campello.me";
