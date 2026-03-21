/**
 * Search orchestrator.
 * Runs Exa (semantic) + Apollo (structured) in parallel,
 * deduplicates by domain against Supabase, upserts new companies.
 */

import { searchCompanies as exaSearch, findSimilarCompanies } from '../providers/exa/search.js';
import { searchCompanies as apolloSearch } from '../providers/apollo/company-search.js';
import { upsertCompany } from '../db/queries/companies.js';
import { isProviderConfigured } from '../config/env.js';
import { normalizeDomain } from '../dedup/normalizer.js';
import type { CompanySearchResult } from '../providers/types.js';

export interface SearchOptions {
  /** Natural language ICP description for Exa */
  query: string;
  /** Structured filters for Apollo */
  apolloFilters?: {
    industries?: string[];
    employeeRanges?: string[];
    locations?: string[];
  };
  /** URL to find similar companies (Exa) */
  similarTo?: string;
  /** Max results per provider */
  maxResults?: number;
}

export interface SearchResult {
  companies: CompanySearchResult[];
  sources: { exa: number; apollo: number };
  duplicatesSkipped: number;
}

/**
 * Run parallel search across configured providers, deduplicate, and upsert.
 */
export async function orchestrateSearch(options: SearchOptions): Promise<SearchResult> {
  const maxResults = options.maxResults ?? 25;
  const searches: Promise<CompanySearchResult[]>[] = [];

  // Exa semantic search
  if (isProviderConfigured('exa')) {
    if (options.similarTo) {
      searches.push(findSimilarCompanies(options.similarTo, { numResults: maxResults }));
    } else {
      searches.push(exaSearch(options.query, { numResults: maxResults }));
    }
  }

  // Apollo structured search
  if (isProviderConfigured('apollo') && options.apolloFilters) {
    searches.push(
      apolloSearch({
        industries: options.apolloFilters.industries,
        employeeRanges: options.apolloFilters.employeeRanges,
        locations: options.apolloFilters.locations,
        perPage: maxResults,
      }).then(r => r.results),
    );
  }

  const results = await Promise.allSettled(searches);

  // Merge results
  const allCompanies: CompanySearchResult[] = [];
  let exaCount = 0;
  let apolloCount = 0;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      allCompanies.push(...result.value);
    } else {
      console.warn('Search provider failed:', result.reason);
    }
  }

  // Deduplicate by domain
  const seen = new Set<string>();
  const unique: CompanySearchResult[] = [];
  let duplicatesSkipped = 0;

  for (const company of allCompanies) {
    const domain = company.domain ? normalizeDomain(company.domain) : null;
    const key = domain ?? company.name.toLowerCase();

    if (seen.has(key)) {
      duplicatesSkipped++;
      continue;
    }
    seen.add(key);
    unique.push(company);
  }

  // Count by source (approximate — based on whether sourceId looks like Apollo)
  for (const c of unique) {
    if (c.rawData && 'primary_domain' in c.rawData) {
      apolloCount++;
    } else {
      exaCount++;
    }
  }

  // Upsert to Supabase — map CompanySearchResult → RawCompanyRecord
  for (const company of unique) {
    const source = company.rawData && 'primary_domain' in company.rawData ? 'apollo' : 'exa';
    await upsertCompany({
      sourceName: source,
      sourceStrategy: source,
      sourceId: company.sourceId,
      sourceUrl: company.sourceUrl ?? undefined,
      name: company.name,
      website: company.domain ? `https://${company.domain}` : undefined,
      description: company.description ?? undefined,
      industry: company.industry ?? undefined,
      employeeCount: company.employeeCount ?? undefined,
      country: company.country ?? undefined,
      rawData: company.rawData,
    });
  }

  return {
    companies: unique,
    sources: { exa: exaCount, apollo: apolloCount },
    duplicatesSkipped,
  };
}
