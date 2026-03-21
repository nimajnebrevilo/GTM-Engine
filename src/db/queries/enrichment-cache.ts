/**
 * Enrichment cache — read/write with TTL.
 * The cost control engine: never pay twice for the same lookup.
 */

import { getSupabaseClient } from '../client.js';

export interface CacheEntry {
  id: string;
  provider: string;
  lookup_key: string;
  lookup_type: string;
  response: Record<string, unknown>;
  credits_used: number;
  created_at: string;
  expires_at: string;
}

/**
 * Look up a cached enrichment result.
 * Returns null if not cached or expired.
 */
export async function getCachedEnrichment(
  provider: string,
  lookupKey: string,
  lookupType: string = 'person',
): Promise<CacheEntry | null> {
  const db = getSupabaseClient();
  const { data } = await db
    .from('enrichment_cache')
    .select()
    .eq('provider', provider)
    .eq('lookup_key', lookupKey)
    .eq('lookup_type', lookupType)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  return data as CacheEntry | null;
}

/**
 * Look up across all providers for a given key.
 * Returns the freshest non-expired entry.
 */
export async function getAnyCachedEnrichment(
  lookupKey: string,
  lookupType: string = 'person',
): Promise<CacheEntry | null> {
  const db = getSupabaseClient();
  const { data } = await db
    .from('enrichment_cache')
    .select()
    .eq('lookup_key', lookupKey)
    .eq('lookup_type', lookupType)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as CacheEntry | null;
}

/**
 * Write or update a cache entry.
 */
export async function setCachedEnrichment(input: {
  provider: string;
  lookupKey: string;
  lookupType?: string;
  response: Record<string, unknown>;
  creditsUsed?: number;
  ttlDays?: number;
}): Promise<void> {
  const db = getSupabaseClient();
  const ttlMs = (input.ttlDays ?? 30) * 86_400_000;
  const expiresAt = new Date(Date.now() + ttlMs).toISOString();

  const { error } = await db
    .from('enrichment_cache')
    .upsert({
      provider: input.provider,
      lookup_key: input.lookupKey,
      lookup_type: input.lookupType ?? 'person',
      response: input.response,
      credits_used: input.creditsUsed ?? 0,
      expires_at: expiresAt,
    }, { onConflict: 'provider,lookup_key,lookup_type' });

  if (error) throw new Error(`Failed to cache enrichment: ${error.message}`);
}

/**
 * Purge expired cache entries.
 */
export async function purgeExpiredCache(): Promise<number> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('enrichment_cache')
    .delete()
    .lt('expires_at', new Date().toISOString())
    .select('id');

  if (error) throw new Error(`Failed to purge cache: ${error.message}`);
  return data?.length ?? 0;
}
