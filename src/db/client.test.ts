import { describe, it, expect, beforeEach, vi } from "vitest";
import { getSupabaseClient, resetClient } from "./client.js";

describe("getSupabaseClient", () => {
  beforeEach(() => {
    resetClient();
    vi.unstubAllEnvs();
  });

  it("throws when SUPABASE_URL is missing", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    expect(() => getSupabaseClient()).toThrow("Missing SUPABASE_URL");
  });

  it("throws when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(() => getSupabaseClient()).toThrow(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  });

  it("returns a client when both env vars are set", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const client = getSupabaseClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe("function");
  });

  it("returns the same instance on repeated calls", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const a = getSupabaseClient();
    const b = getSupabaseClient();
    expect(a).toBe(b);
  });

  it("returns a fresh instance after resetClient", () => {
    vi.stubEnv("SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-key");
    const a = getSupabaseClient();
    resetClient();
    const b = getSupabaseClient();
    expect(a).not.toBe(b);
  });
});
