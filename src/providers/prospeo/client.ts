/**
 * Prospeo API client.
 * Email finder and verification.
 * Docs: https://prospeo.io/api
 */

import { getEnv } from '../../config/env.js';
import { RateLimiter } from '../../utils/rate-limiter.js';

const BASE_URL = 'https://api.prospeo.io';
const limiter = new RateLimiter({ maxRequests: 10, windowMs: 1_000 });

export async function prospeoFetch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const env = getEnv();
  if (!env.PROSPEO_API_KEY) {
    throw new Error('PROSPEO_API_KEY not configured');
  }

  await limiter.acquire();

  const response = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-KEY': env.PROSPEO_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Prospeo API error ${response.status}: ${text}`);
  }

  return response.json() as Promise<T>;
}
