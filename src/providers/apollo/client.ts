/**
 * Apollo.io REST API client.
 * Typed fetch wrapper with rate limiting.
 * Docs: https://apolloio.github.io/apollo-api-docs/
 */

import { getEnv } from '../../config/env.js';
import { RateLimiter } from '../../utils/rate-limiter.js';

const BASE_URL = 'https://api.apollo.io/v1';
const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1_000 });

export async function apolloFetch<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST';
    body?: Record<string, unknown>;
    params?: Record<string, string>;
  } = {},
): Promise<T> {
  const env = getEnv();
  if (!env.APOLLO_API_KEY) {
    throw new Error('APOLLO_API_KEY not configured');
  }

  await limiter.acquire();

  const method = options.method ?? 'POST';
  const url = new URL(`${BASE_URL}${path}`);

  if (options.params) {
    for (const [key, value] of Object.entries(options.params)) {
      url.searchParams.set(key, value);
    }
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Api-Key': env.APOLLO_API_KEY,
  };

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Apollo API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
