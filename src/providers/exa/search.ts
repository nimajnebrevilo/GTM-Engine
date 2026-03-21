/**
 * Exa semantic company search.
 * Uses natural language queries to find companies matching an ICP.
 */

import { getExaClient } from './client.js';
import type { CompanySearchResult } from '../types.js';

export interface ExaSearchOptions {
  /** Number of results to return (default 25) */
  numResults?: number;
  /** Filter to specific domains */
  includeDomains?: string[];
  /** Exclude specific domains */
  excludeDomains?: string[];
  /** Only return results after this date (YYYY-MM-DD) */
  startPublishedDate?: string;
}

/**
 * Search for companies using natural language.
 * e.g. "B2B SaaS companies in the UK with 50-200 employees doing marketing automation"
 */
export async function searchCompanies(
  query: string,
  options: ExaSearchOptions = {},
): Promise<CompanySearchResult[]> {
  const exa = getExaClient();

  const response = await exa.searchAndContents(query, {
    type: 'neural',
    useAutoprompt: true,
    numResults: options.numResults ?? 25,
    includeDomains: options.includeDomains,
    excludeDomains: options.excludeDomains,
    startPublishedDate: options.startPublishedDate,
    text: { maxCharacters: 1000 },
    highlights: true,
  });

  return response.results.map(result => ({
    name: result.title ?? extractCompanyName(result.url),
    domain: extractDomain(result.url),
    description: result.text ?? null,
    industry: null, // Exa doesn't return structured industry data
    employeeCount: null,
    hqLocation: null,
    country: null,
    linkedinUrl: null,
    fundingStage: null,
    fundingTotalUsd: null,
    sourceId: result.id,
    sourceUrl: result.url,
    rawData: result as unknown as Record<string, unknown>,
  }));
}

/**
 * Find companies similar to a given URL.
 * e.g. "Find companies similar to stripe.com"
 */
export async function findSimilarCompanies(
  url: string,
  options: ExaSearchOptions = {},
): Promise<CompanySearchResult[]> {
  const exa = getExaClient();

  const response = await exa.findSimilarAndContents(url, {
    numResults: options.numResults ?? 25,
    excludeDomains: options.excludeDomains,
    text: { maxCharacters: 1000 },
    highlights: true,
  });

  return response.results.map(result => ({
    name: result.title ?? extractCompanyName(result.url),
    domain: extractDomain(result.url),
    description: result.text ?? null,
    industry: null,
    employeeCount: null,
    hqLocation: null,
    country: null,
    linkedinUrl: null,
    fundingStage: null,
    fundingTotalUsd: null,
    sourceId: result.id,
    sourceUrl: result.url,
    rawData: result as unknown as Record<string, unknown>,
  }));
}

function extractDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function extractCompanyName(url: string): string {
  const domain = extractDomain(url);
  if (!domain) return 'Unknown';
  return domain.split('.')[0].replace(/-/g, ' ');
}
