/**
 * Active provider health checks.
 *
 * Unlike the "status" command which only checks if API keys exist,
 * this module makes a lightweight test call to every configured provider
 * endpoint and reports reachability + latency.
 */

import { getEnv, isProviderConfigured } from '../config/env.js';

export interface ProviderPingResult {
  provider: string;
  configured: boolean;
  reachable: boolean;
  latencyMs: number | null;
  error: string | null;
}

export interface PreflightResult {
  providers: ProviderPingResult[];
  allReachable: boolean;
  unreachable: string[];
}

/**
 * Ping every configured provider with a minimal API call.
 *
 * - Apollo:           GET /v1/auth/health (lightweight, 0 credits)
 * - Prospeo:          POST /email-verifier with a dummy email (returns structured response, confirms key + reachability)
 * - Million Verifier: GET /api/v3/?api=KEY&email=test@example.com (single verify, free tier)
 * - Freckle:          POST /v1/health (lightweight ping)
 * - Exa:              POST /search with 1-result query (minimal credit usage)
 */
export async function pingProviders(): Promise<PreflightResult> {
  const env = getEnv();

  const pings: Promise<ProviderPingResult>[] = [];

  // ── Apollo ──────────────────────────────────────────────────────────
  if (isProviderConfigured('apollo')) {
    pings.push(pingEndpoint('apollo', async () => {
      const resp = await fetch('https://api.apollo.io/v1/auth/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': env.APOLLO_API_KEY!,
        },
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    }));
  } else {
    pings.push(Promise.resolve({ provider: 'apollo', configured: false, reachable: false, latencyMs: null, error: 'Not configured' }));
  }

  // ── Prospeo ─────────────────────────────────────────────────────────
  if (isProviderConfigured('prospeo')) {
    pings.push(pingEndpoint('prospeo', async () => {
      const resp = await fetch('https://api.prospeo.io/email-verifier', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-KEY': env.PROSPEO_API_KEY!,
        },
        body: JSON.stringify({ email: 'healthcheck@example.com' }),
      });
      // A 401 means bad key; a 404 means wrong endpoint.
      // Any 2xx or 4xx (except 401/404) means the API is reachable and the key is accepted.
      if (resp.status === 401) throw new Error('Invalid API key (HTTP 401)');
      if (resp.status === 404) throw new Error('Endpoint not found (HTTP 404)');
    }));
  } else {
    pings.push(Promise.resolve({ provider: 'prospeo', configured: false, reachable: false, latencyMs: null, error: 'Not configured' }));
  }

  // ── Million Verifier ────────────────────────────────────────────────
  if (isProviderConfigured('million_verifier')) {
    pings.push(pingEndpoint('million_verifier', async () => {
      const url = new URL('https://api.millionverifier.com/api/v3/');
      url.searchParams.set('api', env.MILLION_VERIFIER_API_KEY!);
      url.searchParams.set('email', 'healthcheck@example.com');
      const resp = await fetch(url.toString());
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    }));
  } else {
    pings.push(Promise.resolve({ provider: 'million_verifier', configured: false, reachable: false, latencyMs: null, error: 'Not configured' }));
  }

  // Freckle is a manual process, not an API endpoint — skip pinging it.

  // ── Exa ─────────────────────────────────────────────────────────────
  if (isProviderConfigured('exa')) {
    pings.push(pingEndpoint('exa', async () => {
      const resp = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.EXA_API_KEY!,
        },
        body: JSON.stringify({ query: 'healthcheck', numResults: 1 }),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    }));
  } else {
    pings.push(Promise.resolve({ provider: 'exa', configured: false, reachable: false, latencyMs: null, error: 'Not configured' }));
  }

  const results = await Promise.all(pings);

  const unreachable = results
    .filter(r => r.configured && !r.reachable)
    .map(r => `${r.provider}: ${r.error}`);

  return {
    providers: results,
    allReachable: unreachable.length === 0,
    unreachable,
  };
}

async function pingEndpoint(
  provider: string,
  fn: () => Promise<void>,
): Promise<ProviderPingResult> {
  const start = Date.now();
  try {
    await fn();
    return {
      provider,
      configured: true,
      reachable: true,
      latencyMs: Date.now() - start,
      error: null,
    };
  } catch (err) {
    return {
      provider,
      configured: true,
      reachable: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
