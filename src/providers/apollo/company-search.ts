/**
 * Apollo structured company/organization search.
 */

import { apolloFetch } from './client.js';
import type { CompanySearchResult } from '../types.js';

export interface ApolloCompanySearchOptions {
  /** Industry keywords */
  industries?: string[];
  /** Employee count ranges e.g. ["11,50", "51,200"] */
  employeeRanges?: string[];
  /** Country codes */
  locations?: string[];
  /** Funding stage */
  fundingStage?: string;
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page (max 100) */
  perPage?: number;
}

interface ApolloOrg {
  id: string;
  name: string;
  website_url: string | null;
  linkedin_url: string | null;
  primary_domain: string | null;
  industry: string | null;
  estimated_num_employees: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  short_description: string | null;
  founded_year: number | null;
  funding_total: number | null;
  latest_funding_stage: string | null;
  raw_address: string | null;
}

interface ApolloOrgSearchResponse {
  organizations: ApolloOrg[];
  pagination: { total_entries: number; total_pages: number; page: number; per_page: number };
}

/**
 * Search Apollo for companies matching structured filters.
 */
export async function searchCompanies(
  options: ApolloCompanySearchOptions = {},
): Promise<{ results: CompanySearchResult[]; totalEntries: number; page: number }> {
  const body: Record<string, unknown> = {
    page: options.page ?? 1,
    per_page: options.perPage ?? 25,
  };

  if (options.industries?.length) {
    body.q_organization_keyword_tags = options.industries;
  }
  if (options.employeeRanges?.length) {
    body.organization_num_employees_ranges = options.employeeRanges;
  }
  if (options.locations?.length) {
    body.organization_locations = options.locations;
  }

  const response = await apolloFetch<ApolloOrgSearchResponse>(
    '/mixed_companies/search',
    { body },
  );

  const results: CompanySearchResult[] = response.organizations.map(org => ({
    name: org.name,
    domain: org.primary_domain ?? null,
    description: org.short_description ?? null,
    industry: org.industry ?? null,
    employeeCount: org.estimated_num_employees ?? null,
    hqLocation: [org.city, org.state, org.country].filter(Boolean).join(', ') || null,
    country: org.country ?? null,
    linkedinUrl: org.linkedin_url ?? null,
    fundingStage: org.latest_funding_stage ?? null,
    fundingTotalUsd: org.funding_total ?? null,
    sourceId: org.id,
    sourceUrl: org.linkedin_url ?? null,
    rawData: org as unknown as Record<string, unknown>,
  }));

  return {
    results,
    totalEntries: response.pagination.total_entries,
    page: response.pagination.page,
  };
}
