/**
 * Zod-validated environment variables.
 * Fails fast on missing required config at startup.
 */

import { z } from 'zod';

const envSchema = z.object({
  // Supabase (required)
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Direct PostgreSQL (optional — for bulk loads)
  DATABASE_URL: z.string().optional(),

  // Providers
  EXA_API_KEY: z.string().min(1).optional(),
  APOLLO_API_KEY: z.string().min(1).optional(),
  PROSPEO_API_KEY: z.string().min(1).optional(),
  MILLION_VERIFIER_API_KEY: z.string().min(1).optional(),
  FRECKLE_API_KEY: z.string().min(1).optional(),

  // Cost controls (defaults)
  APOLLO_MONTHLY_CREDIT_CAP: z.coerce.number().default(10_000),
  PROSPEO_MONTHLY_CREDIT_CAP: z.coerce.number().default(5_000),
  FRECKLE_MONTHLY_CREDIT_CAP: z.coerce.number().default(3_000),

  // Optional
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parse and validate environment variables. Call once at startup.
 * Subsequent calls return the cached result.
 */
export function getEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map(i => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${formatted}`);
  }

  _env = result.data;
  return _env;
}

/**
 * Check if a specific provider is configured (has API key).
 */
export function isProviderConfigured(provider: 'exa' | 'apollo' | 'prospeo' | 'million_verifier' | 'freckle'): boolean {
  const env = getEnv();
  const keyMap = {
    exa: env.EXA_API_KEY,
    apollo: env.APOLLO_API_KEY,
    prospeo: env.PROSPEO_API_KEY,
    million_verifier: env.MILLION_VERIFIER_API_KEY,
    freckle: env.FRECKLE_API_KEY,
  };
  return !!keyMap[provider];
}
