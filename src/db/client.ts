/**
 * Supabase client initialization.
 * Uses SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from environment.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables. ' +
      'Copy .env.example to .env and fill in your Supabase credentials.'
    );
  }

  client = createClient(url, key);
  return client;
}
