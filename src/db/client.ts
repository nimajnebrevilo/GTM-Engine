import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let instance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (instance) return instance;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
  }

  instance = createClient(url, key, {
    auth: { persistSession: false },
  });

  return instance;
}

export function resetClient(): void {
  instance = null;
}
