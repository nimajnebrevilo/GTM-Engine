/**
 * Provider configuration: waterfall order, cost caps, rate limits.
 */

export interface ProviderConfig {
  name: string;
  envKey: string;
  /** Position in the enrichment waterfall (lower = earlier) */
  waterfallOrder: number;
  /** Requests per window */
  rateLimit: { maxRequests: number; windowMs: number };
  /** Monthly credit cap (from env or default) */
  defaultMonthlyCap: number;
}

export const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  exa: {
    name: 'Exa',
    envKey: 'EXA_API_KEY',
    waterfallOrder: 0, // Discovery, not enrichment waterfall
    rateLimit: { maxRequests: 10, windowMs: 1_000 },
    defaultMonthlyCap: Infinity,
  },
  apollo: {
    name: 'Apollo',
    envKey: 'APOLLO_API_KEY',
    waterfallOrder: 1,
    rateLimit: { maxRequests: 5, windowMs: 1_000 },
    defaultMonthlyCap: 10_000,
  },
  prospeo: {
    name: 'Prospeo',
    envKey: 'PROSPEO_API_KEY',
    waterfallOrder: 2,
    rateLimit: { maxRequests: 10, windowMs: 1_000 },
    defaultMonthlyCap: 5_000,
  },
  million_verifier: {
    name: 'Million Verifier',
    envKey: 'MILLION_VERIFIER_API_KEY',
    waterfallOrder: 0, // Inline validator, not a waterfall step
    rateLimit: { maxRequests: 20, windowMs: 1_000 },
    defaultMonthlyCap: Infinity,
  },
  freckle: {
    name: 'Freckle',
    envKey: 'FRECKLE_API_KEY',
    waterfallOrder: 3,
    rateLimit: { maxRequests: 5, windowMs: 1_000 },
    defaultMonthlyCap: 3_000,
  },
};

/**
 * Enrichment waterfall order (excluding MV which runs inline).
 */
export const ENRICHMENT_WATERFALL_ORDER = ['apollo', 'prospeo', 'freckle'] as const;
export type EnrichmentProvider = typeof ENRICHMENT_WATERFALL_ORDER[number];
