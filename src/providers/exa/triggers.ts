/**
 * Exa-powered trigger/signal detection.
 * Searches for buying intent signals: funding, hiring, new exec, etc.
 */

import { getExaClient } from './client.js';
import type { TriggerEvent } from '../types.js';

const TRIGGER_QUERIES: Record<string, (domain: string) => string> = {
  funding_round: (d) => `"${d}" funding OR raised OR series OR investment`,
  new_hire: (d) => `"${d}" hired OR joins OR appointed OR new hire`,
  leadership_change: (d) => `"${d}" new CEO OR new CTO OR new VP OR promoted`,
  expansion: (d) => `"${d}" expansion OR new office OR new market OR opens`,
  product_launch: (d) => `"${d}" launches OR announces OR new product OR new feature`,
  acquisition: (d) => `"${d}" acquires OR acquired OR merger OR acquisition`,
  news_mention: (d) => `"${d}" news OR press release OR announcement`,
};

export interface TriggerSearchOptions {
  /** Which trigger types to scan for (default: all) */
  triggerTypes?: string[];
  /** Results per trigger type (default 5) */
  numResults?: number;
  /** Only results from the last N days */
  lookbackDays?: number;
}

/**
 * Scan a company domain for trigger events.
 */
export async function detectTriggers(
  companyDomain: string,
  options: TriggerSearchOptions = {},
): Promise<TriggerEvent[]> {
  const exa = getExaClient();
  const types = options.triggerTypes ?? Object.keys(TRIGGER_QUERIES);
  const numResults = options.numResults ?? 5;
  const triggers: TriggerEvent[] = [];

  const startDate = options.lookbackDays
    ? new Date(Date.now() - options.lookbackDays * 86_400_000).toISOString().split('T')[0]
    : undefined;

  for (const type of types) {
    const queryFn = TRIGGER_QUERIES[type];
    if (!queryFn) continue;

    const query = queryFn(companyDomain);

    try {
      const response = await exa.searchAndContents(query, {
        type: 'neural',
        numResults,
        startPublishedDate: startDate,
        text: { maxCharacters: 500 },
      });

      for (const result of response.results) {
        triggers.push({
          companyDomain,
          type,
          headline: result.title ?? query,
          sourceUrl: result.url,
          detectedAt: new Date().toISOString(),
          rawData: result as unknown as Record<string, unknown>,
        });
      }
    } catch (err) {
      // Log but don't fail — other trigger types may still work
      console.warn(`Trigger scan failed for ${type}@${companyDomain}:`, err);
    }
  }

  return triggers;
}
