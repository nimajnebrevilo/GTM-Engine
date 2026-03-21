/**
 * Apollo people/contact search.
 * Find contacts at a company by role, seniority, department.
 */

import { apolloFetch } from './client.js';
import type { ContactSearchResult, RoleFilter } from '../types.js';

interface ApolloPerson {
  id: string;
  first_name: string;
  last_name: string;
  title: string | null;
  seniority: string | null;
  departments: string[] | null;
  linkedin_url: string | null;
  organization: {
    name: string;
    primary_domain: string | null;
  } | null;
}

interface ApolloPeopleSearchResponse {
  people: ApolloPerson[];
  pagination: { total_entries: number; total_pages: number; page: number; per_page: number };
}

export interface PeopleSearchOptions {
  /** Apollo organization ID */
  organizationId?: string;
  /** Company domain to search within */
  companyDomain?: string;
  /** Role filter */
  roles: RoleFilter;
  /** Page (1-indexed) */
  page?: number;
  perPage?: number;
}

/**
 * Search for people at a company matching role criteria.
 */
export async function searchPeople(
  options: PeopleSearchOptions,
): Promise<{ results: ContactSearchResult[]; totalEntries: number }> {
  const body: Record<string, unknown> = {
    page: options.page ?? 1,
    per_page: options.perPage ?? 25,
  };

  if (options.organizationId) {
    body.organization_ids = [options.organizationId];
  }
  if (options.companyDomain) {
    body.q_organization_domains = options.companyDomain;
  }
  if (options.roles.titles.length > 0) {
    body.person_titles = options.roles.titles;
  }
  if (options.roles.seniorities?.length) {
    body.person_seniorities = options.roles.seniorities;
  }
  if (options.roles.departments?.length) {
    body.person_departments = options.roles.departments;
  }

  const response = await apolloFetch<ApolloPeopleSearchResponse>(
    '/mixed_people/search',
    { body },
  );

  const results: ContactSearchResult[] = response.people.map(person => ({
    firstName: person.first_name,
    lastName: person.last_name,
    title: person.title ?? null,
    seniority: person.seniority ?? null,
    department: person.departments?.[0] ?? null,
    linkedinUrl: person.linkedin_url ?? null,
    companyName: person.organization?.name ?? '',
    companyDomain: person.organization?.primary_domain ?? null,
    sourceId: person.id,
    rawData: person as unknown as Record<string, unknown>,
  }));

  return { results, totalEntries: response.pagination.total_entries };
}
