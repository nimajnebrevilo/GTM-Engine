/**
 * Preflight Service Tests
 *
 * Tests the preflight check module — both its structure (always testable)
 * and live provider reachability (requires network).
 */

import { describe, test, expect, beforeAll } from 'vitest';
import { pingProviders } from '../services/preflight.js';
import type { PreflightResult } from '../services/preflight.js';

let result: PreflightResult;
let networkAvailable = false;

beforeAll(async () => {
  result = await pingProviders();
  // If any provider is reachable, network is available
  networkAvailable = result.providers.some(p => p.configured && p.reachable);
});

describe('Preflight Check — Structure', () => {
  test('pingProviders returns results for all configured providers', () => {
    expect(result).toHaveProperty('providers');
    expect(result).toHaveProperty('allReachable');
    expect(result).toHaveProperty('unreachable');
    expect(Array.isArray(result.providers)).toBe(true);
    expect(result.providers.length).toBeGreaterThanOrEqual(1);

    for (const p of result.providers) {
      expect(p).toHaveProperty('provider');
      expect(p).toHaveProperty('configured');
      expect(p).toHaveProperty('reachable');
      expect(p).toHaveProperty('latencyMs');
      expect(p).toHaveProperty('error');
    }
  });

  test('configured providers report latency', () => {
    const configured = result.providers.filter(p => p.configured);
    for (const p of configured) {
      expect(p.latencyMs).toBeTypeOf('number');
      expect(p.latencyMs!).toBeGreaterThan(0);
    }
  });

  test('allReachable reflects actual provider status', () => {
    const configured = result.providers.filter(p => p.configured);
    const allUp = configured.every(p => p.reachable);
    expect(result.allReachable).toBe(allUp);
  });

  test('unreachable list contains only failed configured providers', () => {
    for (const entry of result.unreachable) {
      expect(entry).toMatch(/^.+: .+$/);
    }

    const failedCount = result.providers.filter(p => p.configured && !p.reachable).length;
    expect(result.unreachable.length).toBe(failedCount);
  });

  test('Apollo provider entry exists', () => {
    const apollo = result.providers.find(p => p.provider === 'apollo');
    expect(apollo).toBeDefined();
    expect(apollo!.configured).toBe(true);
  });

  test('Prospeo provider entry exists', () => {
    const prospeo = result.providers.find(p => p.provider === 'prospeo');
    expect(prospeo).toBeDefined();
    expect(prospeo!.configured).toBe(true);
  });

  test('Million Verifier provider entry exists', () => {
    const mv = result.providers.find(p => p.provider === 'million_verifier');
    expect(mv).toBeDefined();
    expect(mv!.configured).toBe(true);
  });

  test('Exa provider entry exists', () => {
    const exa = result.providers.find(p => p.provider === 'exa');
    expect(exa).toBeDefined();
    expect(exa!.configured).toBe(true);
  });
});

describe('Preflight Check — Live Reachability', () => {
  test('Apollo is reachable', (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }
    const apollo = result.providers.find(p => p.provider === 'apollo');
    expect(apollo!.reachable).toBe(true);
    expect(apollo!.error).toBeNull();
  });

  test('Prospeo is reachable (fixed endpoint)', (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }
    const prospeo = result.providers.find(p => p.provider === 'prospeo');
    expect(prospeo!.reachable).toBe(true);
    expect(prospeo!.error).toBeNull();
  });

  test('Million Verifier is reachable', (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }
    const mv = result.providers.find(p => p.provider === 'million_verifier');
    expect(mv!.reachable).toBe(true);
    expect(mv!.error).toBeNull();
  });

  test('Exa is reachable', (ctx) => {
    if (!networkAvailable) { ctx.skip(); return; }
    const exa = result.providers.find(p => p.provider === 'exa');
    expect(exa!.reachable).toBe(true);
    expect(exa!.error).toBeNull();
  });
});
