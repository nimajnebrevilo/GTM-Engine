/**
 * Running credit tally + cap enforcement per provider.
 * Prevents overspend by checking caps before each API call.
 */

import { getEnv } from '../config/env.js';
import { PROVIDER_CONFIGS } from '../config/providers.js';

interface ProviderUsage {
  creditsUsed: number;
  monthKey: string; // "2026-03" format
}

class CostTracker {
  private usage: Map<string, ProviderUsage> = new Map();

  private getCurrentMonthKey(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  private getUsage(provider: string): ProviderUsage {
    const monthKey = this.getCurrentMonthKey();
    const existing = this.usage.get(provider);

    if (existing && existing.monthKey === monthKey) {
      return existing;
    }

    // New month — reset
    const fresh: ProviderUsage = { creditsUsed: 0, monthKey };
    this.usage.set(provider, fresh);
    return fresh;
  }

  /**
   * Check if we can still spend credits for this provider.
   */
  canSpend(provider: string): boolean {
    const usage = this.getUsage(provider);
    const cap = this.getCap(provider);
    return usage.creditsUsed < cap;
  }

  /**
   * Record credits spent.
   */
  record(provider: string, credits: number): void {
    const usage = this.getUsage(provider);
    usage.creditsUsed += credits;
  }

  /**
   * Get monthly cap for a provider.
   */
  getCap(provider: string): number {
    const env = getEnv();
    const capMap: Record<string, number> = {
      apollo: env.APOLLO_MONTHLY_CREDIT_CAP,
      prospeo: env.PROSPEO_MONTHLY_CREDIT_CAP,
      freckle: env.FRECKLE_MONTHLY_CREDIT_CAP,
    };
    return capMap[provider] ?? PROVIDER_CONFIGS[provider]?.defaultMonthlyCap ?? Infinity;
  }

  /**
   * Get current usage summary.
   */
  getSummary(): Record<string, { used: number; cap: number; remaining: number }> {
    const summary: Record<string, { used: number; cap: number; remaining: number }> = {};

    for (const provider of ['apollo', 'prospeo', 'freckle']) {
      const usage = this.getUsage(provider);
      const cap = this.getCap(provider);
      summary[provider] = {
        used: usage.creditsUsed,
        cap,
        remaining: Math.max(0, cap - usage.creditsUsed),
      };
    }

    return summary;
  }
}

let _tracker: CostTracker | null = null;

export function getCostTracker(): CostTracker {
  if (!_tracker) {
    _tracker = new CostTracker();
  }
  return _tracker;
}
