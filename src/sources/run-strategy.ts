/**
 * Strategy runner CLI.
 * Invoked by Claude Code skill as:
 *   npx tsx src/sources/run-strategy.ts --project-id <id> --strategy <name>
 *
 * Each strategy reads the project's ICP from Supabase, then discovers and
 * extracts companies using its specific method (API calls, WebSearch patterns, etc.).
 *
 * This file provides the framework. The actual API call logic is in individual
 * strategy modules. For WebSearch-based strategies, Claude orchestrates the
 * discovery via the skill file — this runner handles the structured API strategies.
 */

import { getActiveICP } from '../icp/challenge.js';
import { batchUpsertCompanies } from '../db/queries/companies.js';
import { STRATEGY_CATALOG } from './catalog.js';
import type { RawCompanyRecord, StrategyName, StrategyResult } from './types.js';

// ─── CLI Argument Parsing ───────────────────────────────────────────────────

function parseArgs(): { projectId: string; strategy: StrategyName; focusIndustry?: string; focusGeography?: string } {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    map.set(args[i].replace(/^--/, ''), args[i + 1]);
  }

  const projectId = map.get('project-id');
  const strategy = map.get('strategy') as StrategyName;

  if (!projectId || !strategy) {
    console.error('Usage: npx tsx src/sources/run-strategy.ts --project-id <id> --strategy <name>');
    process.exit(1);
  }

  return {
    projectId,
    strategy,
    focusIndustry: map.get('focus-industry'),
    focusGeography: map.get('focus-geography'),
  };
}

// ─── Strategy Implementations (API-based) ───────────────────────────────────
// NOTE: Companies House & SEC EDGAR API strategies removed — API keys not available.
// Company discovery now uses Exa (semantic) + Apollo (structured) as primary engines.
// Wikidata SPARQL remains as a free, no-auth source.

async function* runWikidata(
  industries: string[],
  geographies: string[],
): AsyncGenerator<RawCompanyRecord> {
  const endpoint = 'https://query.wikidata.org/sparql';

  for (const country of geographies) {
    for (const industry of industries) {
      const query = `
        SELECT ?company ?companyLabel ?countryLabel ?inception ?website ?employees ?revenue WHERE {
          ?company wdt:P31/wdt:P279* wd:Q4830453.
          ?company wdt:P17 ?country.
          ?country wdt:P297 "${country}".
          OPTIONAL { ?company wdt:P571 ?inception. }
          OPTIONAL { ?company wdt:P856 ?website. }
          OPTIONAL { ?company wdt:P1128 ?employees. }
          OPTIONAL { ?company wdt:P2139 ?revenue. }
          SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
        }
        LIMIT 5000
      `;

      const url = `${endpoint}?query=${encodeURIComponent(query)}&format=json`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'TAMBuilder/1.0', Accept: 'application/json' },
      });

      if (!response.ok) {
        console.error(`Wikidata error for ${country}/${industry}: ${response.status}`);
        continue;
      }

      const data = await response.json() as {
        results: { bindings: Array<Record<string, { value: string }>> };
      };

      for (const binding of data.results.bindings) {
        const name = binding.companyLabel?.value;
        if (!name) continue;

        yield {
          sourceName: 'wikidata',
          sourceStrategy: 'wikidata',
          sourceId: binding.company?.value ?? '',
          name,
          jurisdiction: country,
          website: binding.website?.value,
          industry,
          employeeCount: binding.employees?.value ? parseInt(binding.employees.value, 10) : undefined,
          foundedYear: binding.inception?.value ? new Date(binding.inception.value).getFullYear() : undefined,
          country: binding.countryLabel?.value ?? country,
          rawData: binding,
        };
      }

      // Be polite to Wikidata
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// ─── Main Runner ────────────────────────────────────────────────────────────

async function main() {
  const { projectId, strategy, focusIndustry, focusGeography } = parseArgs();

  console.log(`[${strategy}] Starting for project ${projectId}`);
  const startTime = Date.now();

  // Get ICP
  const icp = await getActiveICP(projectId);
  if (!icp) {
    console.error('No active ICP found for project');
    process.exit(1);
  }

  const industries = focusIndustry ? [focusIndustry] : icp.industries;
  const geographies = focusGeography ? [focusGeography] : icp.geographies;

  let records: RawCompanyRecord[] = [];
  const batchSize = 50;

  const strategyConfig = STRATEGY_CATALOG.find(s => s.name === strategy);
  if (!strategyConfig) {
    console.error(`Unknown strategy: ${strategy}`);
    process.exit(1);
  }

  // Select generator based on strategy
  let generator: AsyncGenerator<RawCompanyRecord> | null = null;

  switch (strategy) {
    case 'wikidata':
      generator = runWikidata(industries, geographies);
      break;
    // Exa + Apollo are now the primary discovery engines (see src/services/search.ts)
    // WebSearch-based strategies are orchestrated by Claude, not this runner
    default:
      console.log(`[${strategy}] This strategy is handled by the search orchestrator or Claude Code skill.`);
      process.exit(0);
  }

  if (!generator) {
    console.log(`[${strategy}] No applicable sources for geographies: ${geographies.join(', ')}`);
    process.exit(0);
  }

  // Stream records in batches
  let totalInserted = 0;
  let totalMerged = 0;
  let totalErrors = 0;

  for await (const record of generator) {
    records.push(record);

    if (records.length >= batchSize) {
      const result = await batchUpsertCompanies(records);
      totalInserted += result.inserted;
      totalMerged += result.merged;
      totalErrors += result.errors;
      console.log(`[${strategy}] Batch: +${result.inserted} new, ${result.merged} merged, ${result.errors} errors`);
      records = [];
    }
  }

  // Final batch
  if (records.length > 0) {
    const result = await batchUpsertCompanies(records);
    totalInserted += result.inserted;
    totalMerged += result.merged;
    totalErrors += result.errors;
  }

  const durationMs = Date.now() - startTime;
  const resultSummary: StrategyResult = {
    strategyName: strategy,
    sourcesQueried: [strategy],
    recordsFound: totalInserted + totalMerged,
    recordsInserted: totalInserted,
    recordsDuplicate: totalMerged,
    errors: totalErrors > 0 ? [{ source: strategy, message: `${totalErrors} records failed`, recoverable: true }] : [],
    durationMs,
  };

  console.log(`[${strategy}] Complete: ${totalInserted} inserted, ${totalMerged} merged, ${totalErrors} errors in ${(durationMs / 1000).toFixed(1)}s`);
  console.log(JSON.stringify(resultSummary));
}

main().catch(err => {
  console.error('Strategy runner failed:', err);
  process.exit(1);
});
