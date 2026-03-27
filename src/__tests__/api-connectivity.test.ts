/**
 * API Connectivity Tests (Integration)
 *
 * Live integration tests that verify all external provider APIs
 * are reachable and responding correctly. These tests hit real
 * endpoints with minimal-cost calls.
 *
 * Skipped when network is unavailable (e.g. sandboxed environments).
 *
 * Run: npm test
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { getEnv, isProviderConfigured } from '../config/env.js';
import type { Env } from '../config/env.js';

let env: Env;
let networkAvailable = false;

beforeAll(async () => {
  env = getEnv();

  // Probe network availability with a lightweight DNS-level check
  try {
    const resp = await fetch('https://api.apollo.io/v1/auth/health', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': env.APOLLO_API_KEY ?? '' },
      signal: AbortSignal.timeout(5_000),
    });
    networkAvailable = true;
  } catch {
    networkAvailable = false;
  }
});

// ─── Apollo ──────────────────────────────────────────────────────────────────

describe('Apollo API', () => {
  test.skipIf(!isProviderConfigured('apollo'))('health endpoint is reachable', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const resp = await fetch('https://api.apollo.io/v1/auth/health', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': env.APOLLO_API_KEY!,
      },
    });
    expect(resp.ok).toBe(true);
  });

  test.skipIf(!isProviderConfigured('apollo'))('API key is valid (can fetch profile)', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const resp = await fetch('https://api.apollo.io/v1/users/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': env.APOLLO_API_KEY!,
      },
      body: JSON.stringify({}),
    });
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data).toHaveProperty('users');
  });
});

// ─── Prospeo ─────────────────────────────────────────────────────────────────

describe('Prospeo API', () => {
  test.skipIf(!isProviderConfigured('prospeo'))('email-verifier endpoint is reachable', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const resp = await fetch('https://api.prospeo.io/email-verifier', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': env.PROSPEO_API_KEY!,
      },
      body: JSON.stringify({ email: 'healthcheck@example.com' }),
    });
    // Any response that isn't 404 or 401 means the API is reachable and key is valid
    expect(resp.status).not.toBe(404);
    expect(resp.status).not.toBe(401);
  });

  test.skipIf(!isProviderConfigured('prospeo'))('email-finder endpoint is reachable', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const resp = await fetch('https://api.prospeo.io/email-finder', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KEY': env.PROSPEO_API_KEY!,
      },
      body: JSON.stringify({
        first_name: 'Test',
        last_name: 'User',
        company: 'example.com',
      }),
    });
    expect(resp.status).not.toBe(404);
    expect(resp.status).not.toBe(401);
  });
});

// ─── Million Verifier ────────────────────────────────────────────────────────

describe('Million Verifier API', () => {
  test.skipIf(!isProviderConfigured('million_verifier'))('verify endpoint is reachable', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const url = new URL('https://api.millionverifier.com/api/v3/');
    url.searchParams.set('api', env.MILLION_VERIFIER_API_KEY!);
    url.searchParams.set('email', 'healthcheck@example.com');

    const resp = await fetch(url.toString());
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data).toHaveProperty('result');
  });
});

// ─── Exa ─────────────────────────────────────────────────────────────────────

describe('Exa API', () => {
  test.skipIf(!isProviderConfigured('exa'))('search endpoint is reachable', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const resp = await fetch('https://api.exa.ai/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.EXA_API_KEY!,
      },
      body: JSON.stringify({ query: 'healthcheck', numResults: 1 }),
    });
    expect(resp.ok).toBe(true);
    const data = await resp.json();
    expect(data).toHaveProperty('results');
  });
});

// ─── Supabase ────────────────────────────────────────────────────────────────

describe('Supabase Database', () => {
  test('SUPABASE_URL is configured', () => {
    expect(env.SUPABASE_URL).toBeTruthy();
    expect(env.SUPABASE_URL).toMatch(/^https:\/\//);
  });

  test('SUPABASE_SERVICE_ROLE_KEY is configured', () => {
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBeTruthy();
    expect(env.SUPABASE_SERVICE_ROLE_KEY.length).toBeGreaterThan(10);
  });

  test('can connect and query companies table', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { count, error } = await supabase
      .from('companies')
      .select('*', { count: 'exact', head: true });

    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('can connect and query contacts table', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { count, error } = await supabase
      .from('contacts')
      .select('*', { count: 'exact', head: true });

    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('can connect and query campaigns table', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { count, error } = await supabase
      .from('campaigns')
      .select('*', { count: 'exact', head: true });

    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('can connect and query clients table', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { data, error } = await supabase
      .from('clients')
      .select('id, name')
      .limit(5);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBe(true);
  });

  test('can connect and query icp_definitions table', async (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    const { count, error } = await supabase
      .from('icp_definitions')
      .select('*', { count: 'exact', head: true });

    expect(error).toBeNull();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
