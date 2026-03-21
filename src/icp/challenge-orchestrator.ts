/**
 * ICP Challenge Orchestrator.
 *
 * End-to-end flow that:
 * 1. Loads a draft ICP from the database
 * 2. Deep-scrapes the client website
 * 3. Optionally builds ClientBaseAnalysis from existing companies in DB
 * 4. Runs generateRefinements() to challenge assumptions
 * 5. Generates a human-readable challenge summary
 * 6. Persists everything back to the ICP record
 * 7. Returns the full ICPChallengeResult
 */

import { getICPDefinition, updateICPDefinition } from '../db/queries/icp-definitions.js';
import { getSupabaseClient } from '../db/client.js';
import { analyzeWebsiteDeep } from './website-deep-analyzer.js';
import { generateRefinements, applyRefinements } from './challenge.js';
import type {
  ICPDefinition,
  WebsiteAnalysis,
  ClientBaseAnalysis,
  ICPChallengeResult,
  ICPRefinement,
} from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert a DB row to the ICPDefinition interface used by challenge logic. */
function rowToICPDefinition(row: {
  geographies: string[];
  industries: string[];
  company_types: string[];
  keywords: string[];
  exclusion_keywords: string[];
  company_size_min: number | null;
  company_size_max: number | null;
  technology_signals: string[];
}): ICPDefinition {
  return {
    geographies: row.geographies ?? [],
    industries: row.industries ?? [],
    companyTypes: row.company_types ?? [],
    keywords: row.keywords ?? [],
    exclusionKeywords: row.exclusion_keywords ?? [],
    companySizeMin: row.company_size_min ?? undefined,
    companySizeMax: row.company_size_max ?? undefined,
    technologySignals: row.technology_signals ?? [],
  };
}

/**
 * Build a ClientBaseAnalysis from companies already linked to this client
 * through campaigns + campaign_companies.
 */
async function buildClientBaseAnalysis(clientId: string): Promise<ClientBaseAnalysis> {
  const db = getSupabaseClient();

  // Get all companies linked to this client via campaigns
  const { data: campaigns } = await db
    .from('campaigns')
    .select('id')
    .eq('client_id', clientId);

  if (!campaigns || campaigns.length === 0) {
    return emptyClientBase();
  }

  const campaignIds = campaigns.map((c: { id: string }) => c.id);

  const { data: companyLinks } = await db
    .from('campaign_companies')
    .select('company_id')
    .in('campaign_id', campaignIds);

  if (!companyLinks || companyLinks.length === 0) {
    return emptyClientBase();
  }

  const companyIds = [...new Set(companyLinks.map((c: { company_id: string }) => c.company_id))];

  const { data: companies } = await db
    .from('companies')
    .select('industry, employee_count, country, description')
    .in('id', companyIds.slice(0, 500)); // Cap to avoid huge queries

  if (!companies || companies.length === 0) {
    return emptyClientBase();
  }

  // Aggregate industries
  const industryCounts = new Map<string, number>();
  for (const c of companies) {
    if (c.industry) {
      industryCounts.set(c.industry, (industryCounts.get(c.industry) ?? 0) + 1);
    }
  }

  // Aggregate size bands
  const sizeBands = new Map<string, number>();
  for (const c of companies) {
    const band = getSizeBand(c.employee_count);
    sizeBands.set(band, (sizeBands.get(band) ?? 0) + 1);
  }

  // Aggregate geographies
  const geoCounts = new Map<string, number>();
  for (const c of companies) {
    if (c.country) {
      geoCounts.set(c.country, (geoCounts.get(c.country) ?? 0) + 1);
    }
  }

  // Extract common keywords from descriptions
  const techKeywords = extractCommonTerms(
    companies.map((c: { description: string | null }) => c.description).filter(Boolean) as string[],
  );

  return {
    commonIndustries: Array.from(industryCounts.entries())
      .map(([industry, frequency]) => ({ industry, frequency }))
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10),
    sizeDistribution: Array.from(sizeBands.entries())
      .map(([band, count]) => ({ band, count }))
      .sort((a, b) => b.count - a.count),
    geographicConcentration: Array.from(geoCounts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    technologyCommonalities: techKeywords,
    patterns: generatePatternInsights(industryCounts, sizeBands, geoCounts),
  };
}

function emptyClientBase(): ClientBaseAnalysis {
  return {
    commonIndustries: [],
    sizeDistribution: [],
    geographicConcentration: [],
    technologyCommonalities: [],
    patterns: ['No existing client base data available — challenge based on website analysis only'],
  };
}

function getSizeBand(employeeCount: number | null): string {
  if (!employeeCount) return 'Unknown';
  if (employeeCount <= 10) return 'Micro (1-10)';
  if (employeeCount <= 50) return 'Small (11-50)';
  if (employeeCount <= 250) return 'Medium (51-250)';
  if (employeeCount <= 1000) return 'Large (251-1000)';
  return 'Enterprise (1000+)';
}

/** Extract the most common meaningful terms from company descriptions. */
function extractCommonTerms(descriptions: string[]): string[] {
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be',
    'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall', 'to', 'of',
    'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through',
    'that', 'this', 'these', 'those', 'it', 'its', 'their', 'our', 'your',
    'we', 'they', 'them', 'us', 'he', 'she', 'his', 'her', 'who', 'which',
    'what', 'when', 'where', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'also', 'just', 'about', 'up',
    'out', 'new', 'one', 'two', 'way', 'use', 'make', 'like', 'get',
    'company', 'companies', 'business', 'businesses', 'service', 'services',
    'solution', 'solutions', 'provide', 'provides', 'help', 'helps',
    'leading', 'global', 'world', 'based', 'founded', 'inc', 'ltd', 'llc',
  ]);

  const wordCounts = new Map<string, number>();
  for (const desc of descriptions) {
    const words = desc.toLowerCase().replace(/[^a-z0-9\s-]/g, '').split(/\s+/);
    const seen = new Set<string>();
    for (const word of words) {
      if (word.length < 3 || STOP_WORDS.has(word) || seen.has(word)) continue;
      seen.add(word);
      wordCounts.set(word, (wordCounts.get(word) ?? 0) + 1);
    }
  }

  // Return terms that appear in >20% of descriptions
  const threshold = Math.max(2, descriptions.length * 0.2);
  return Array.from(wordCounts.entries())
    .filter(([, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word]) => word);
}

function generatePatternInsights(
  industries: Map<string, number>,
  sizes: Map<string, number>,
  geos: Map<string, number>,
): string[] {
  const patterns: string[] = [];

  // Industry concentration
  const topIndustry = [...industries.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topIndustry) {
    const total = [...industries.values()].reduce((a, b) => a + b, 0);
    const pct = Math.round((topIndustry[1] / total) * 100);
    if (pct > 40) {
      patterns.push(`${pct}% of existing clients are in ${topIndustry[0]} — strong vertical concentration`);
    }
  }

  // Size concentration
  const topSize = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topSize) {
    const total = [...sizes.values()].reduce((a, b) => a + b, 0);
    const pct = Math.round((topSize[1] / total) * 100);
    if (pct > 50) {
      patterns.push(`${pct}% of clients are in the ${topSize[0]} band`);
    }
  }

  // Geographic concentration
  const topGeo = [...geos.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topGeo) {
    const total = [...geos.values()].reduce((a, b) => a + b, 0);
    const pct = Math.round((topGeo[1] / total) * 100);
    if (pct > 50) {
      patterns.push(`${pct}% of clients are in ${topGeo[0]}`);
    }
  }

  if (patterns.length === 0) {
    patterns.push('Client base is diversified — no strong concentration in any single dimension');
  }

  return patterns;
}

// ---------------------------------------------------------------------------
// Challenge summary generation
// ---------------------------------------------------------------------------

function generateChallengeSummary(
  websiteAnalysis: WebsiteAnalysis,
  clientBase: ClientBaseAnalysis,
  refinements: ICPRefinement[],
): string {
  const lines: string[] = [];

  lines.push('## ICP Challenge Summary\n');

  // Website findings
  lines.push('### Website Analysis');
  lines.push(`**Value Proposition:** ${websiteAnalysis.valueProposition}`);
  if (websiteAnalysis.targetPersonas.length > 0) {
    lines.push(`**Target Personas:** ${websiteAnalysis.targetPersonas.join(', ')}`);
  }
  lines.push(`**Pricing Signal:** ${websiteAnalysis.pricingSignals}`);
  if (websiteAnalysis.customerLogos.length > 0) {
    lines.push(`**Customer Logos Found:** ${websiteAnalysis.customerLogos.slice(0, 10).join(', ')}${websiteAnalysis.customerLogos.length > 10 ? ` (+${websiteAnalysis.customerLogos.length - 10} more)` : ''}`);
  }
  if (websiteAnalysis.technologyIndicators.length > 0) {
    lines.push(`**Tech Stack:** ${websiteAnalysis.technologyIndicators.join(', ')}`);
  }
  lines.push('');

  // Client base findings
  if (clientBase.commonIndustries.length > 0) {
    lines.push('### Existing Client Base');
    lines.push(`**Top Industries:** ${clientBase.commonIndustries.slice(0, 5).map(i => `${i.industry} (${i.frequency})`).join(', ')}`);
    if (clientBase.geographicConcentration.length > 0) {
      lines.push(`**Geography:** ${clientBase.geographicConcentration.slice(0, 5).map(g => `${g.country} (${g.count})`).join(', ')}`);
    }
    for (const pattern of clientBase.patterns) {
      lines.push(`- ${pattern}`);
    }
    lines.push('');
  }

  // Refinements
  if (refinements.length > 0) {
    lines.push('### Challenges & Recommendations');
    const byType = {
      contradict: refinements.filter(r => r.type === 'contradict'),
      expand: refinements.filter(r => r.type === 'expand'),
      narrow: refinements.filter(r => r.type === 'narrow'),
      confirm: refinements.filter(r => r.type === 'confirm'),
    };

    if (byType.contradict.length > 0) {
      lines.push('\n**Contradictions Found:**');
      for (const r of byType.contradict) {
        lines.push(`- [${r.dimension}] ${r.observation}`);
        lines.push(`  → ${r.recommendation} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
    }
    if (byType.expand.length > 0) {
      lines.push('\n**Expansion Opportunities:**');
      for (const r of byType.expand) {
        lines.push(`- [${r.dimension}] ${r.observation}`);
        lines.push(`  → ${r.recommendation} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
    }
    if (byType.narrow.length > 0) {
      lines.push('\n**Narrowing Suggestions:**');
      for (const r of byType.narrow) {
        lines.push(`- [${r.dimension}] ${r.observation}`);
        lines.push(`  → ${r.recommendation} (confidence: ${Math.round(r.confidence * 100)}%)`);
      }
    }
    if (byType.confirm.length > 0) {
      lines.push('\n**Confirmed:**');
      for (const r of byType.confirm) {
        lines.push(`- [${r.dimension}] ${r.observation}`);
      }
    }
  } else {
    lines.push('### No major challenges found — ICP appears well-aligned with website and client base.');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ChallengeICPInput {
  /** ICP definition ID to challenge. */
  icpId: string;
  /** Client website URL (required if not already stored on client). */
  websiteUrl: string;
  /** Skip client-base analysis (faster, website-only challenge). */
  skipClientBase?: boolean;
  /** Only analyse homepage (faster). */
  homepageOnly?: boolean;
}

/**
 * Run the full ICP challenge flow.
 *
 * 1. Load ICP from DB
 * 2. Deep-scrape client website
 * 3. Build client-base analysis (if data exists)
 * 4. Generate refinements that challenge the stated ICP
 * 5. Persist analysis + refinements back to ICP record
 * 6. Return the complete ICPChallengeResult
 */
export async function challengeICP(input: ChallengeICPInput): Promise<ICPChallengeResult> {
  // 1. Load ICP
  const icpRow = await getICPDefinition(input.icpId);
  const originalICP = rowToICPDefinition(icpRow);

  // 2. Deep website analysis
  const websiteAnalysis = await analyzeWebsiteDeep(input.websiteUrl, {
    homepageOnly: input.homepageOnly,
  });

  // 3. Client base analysis
  let clientBaseAnalysis: ClientBaseAnalysis;
  if (input.skipClientBase) {
    clientBaseAnalysis = emptyClientBase();
  } else {
    clientBaseAnalysis = await buildClientBaseAnalysis(icpRow.client_id);
  }

  // 4. Generate refinements
  const refinements = generateRefinements(originalICP, websiteAnalysis, clientBaseAnalysis);

  // 5. Apply auto-refinements to produce suggested ICP
  const refinedICP = applyRefinements(originalICP, refinements);

  // 6. Generate human-readable summary
  const challengeSummary = generateChallengeSummary(websiteAnalysis, clientBaseAnalysis, refinements);

  // 7. Persist to DB
  await updateICPDefinition(icpRow.id, {
    websiteAnalysis: websiteAnalysis as unknown as Record<string, unknown>,
    clientBaseAnalysis: clientBaseAnalysis as unknown as Record<string, unknown>,
    refinements: refinements as unknown as Record<string, unknown>[],
    challengeSummary,
  });

  return {
    originalICP,
    websiteAnalysis,
    clientBaseAnalysis,
    refinements,
    refinedICP,
    challengeSummary,
  };
}
