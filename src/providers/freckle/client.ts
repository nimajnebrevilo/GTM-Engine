/**
 * Freckle.io API client.
 * NL-driven enrichment from 40+ providers as final fallback.
 * Docs: https://docs.freckle.io
 */

import { getEnv } from '../../config/env.js';
import { RateLimiter } from '../../utils/rate-limiter.js';

const BASE_URL = 'https://api.freckle.io/v1';
const limiter = new RateLimiter({ maxRequests: 5, windowMs: 1_000 });

export async function freckleFetch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const env = getEnv();
  if (!env.FRECKLE_API_KEY) {
    throw new Error('FRECKLE_API_KEY not configured');
  }

  await limiter.acquire();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.FRECKLE_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Freckle API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
