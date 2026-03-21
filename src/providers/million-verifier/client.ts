/**
 * Million Verifier API client.
 * Bulk and single email validation.
 * Docs: https://developer.millionverifier.com/
 */

import { getEnv } from '../../config/env.js';
import { RateLimiter } from '../../utils/rate-limiter.js';

const BASE_URL = 'https://api.millionverifier.com/api/v3';
const limiter = new RateLimiter({ maxRequests: 20, windowMs: 1_000 });

export async function mvFetch<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const env = getEnv();
  if (!env.MILLION_VERIFIER_API_KEY) {
    throw new Error('MILLION_VERIFIER_API_KEY not configured');
  }

  await limiter.acquire();

  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set('api', env.MILLION_VERIFIER_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString());

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Million Verifier API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
