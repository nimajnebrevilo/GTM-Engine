/**
 * CRUD for searches, search_companies, and search_role_filters tables.
 * Tracks each prospecting query and its results.
 */

import { getSupabaseClient } from '../client.js';

// ─── Searches ─────────────────────────────────────────────────────────────────

export interface Search {
  id: string;
  campaign_id: string | null;
  query: string;
  parsed_filters: Record<string, unknown>;
  provider: string;
  status: string;
  result_count: number;
  created_at: string;
  updated_at: string;
}

export async function createSearch(input: {
  campaignId?: string;
  query: string;
  parsedFilters?: Record<string, unknown>;
  provider: string;
}): Promise<Search> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('searches')
    .insert({
      campaign_id: input.campaignId ?? null,
      query: input.query,
      parsed_filters: input.parsedFilters ?? {},
      provider: input.provider,
      status: 'running',
      result_count: 0,
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create search: ${error.message}`);
  return data as Search;
}

export async function updateSearch(id: string, updates: {
  status?: string;
  resultCount?: number;
}): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('searches')
    .update({
      ...(updates.status && { status: updates.status }),
      ...(updates.resultCount !== undefined && { result_count: updates.resultCount }),
    })
    .eq('id', id);

  if (error) throw new Error(`Failed to update search: ${error.message}`);
}

// ─── Search ↔ Company junction ────────────────────────────────────────────────

export async function linkSearchCompany(
  searchId: string,
  companyId: string,
  relevanceScore?: number,
): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('search_companies')
    .upsert({
      search_id: searchId,
      company_id: companyId,
      relevance_score: relevanceScore ?? null,
      user_confirmed: false,
    }, { onConflict: 'search_id,company_id' });

  if (error) throw new Error(`Failed to link search-company: ${error.message}`);
}

export async function confirmSearchCompanies(
  searchId: string,
  companyIds: string[],
): Promise<void> {
  const db = getSupabaseClient();
  const { error } = await db
    .from('search_companies')
    .update({ user_confirmed: true })
    .eq('search_id', searchId)
    .in('company_id', companyIds);

  if (error) throw new Error(`Failed to confirm companies: ${error.message}`);
}

// ─── Role Filters ─────────────────────────────────────────────────────────────

export interface RoleFilterRecord {
  id: string;
  search_id: string;
  titles: string[];
  seniorities: string[];
  departments: string[];
}

export async function createRoleFilter(input: {
  searchId: string;
  titles: string[];
  seniorities?: string[];
  departments?: string[];
}): Promise<RoleFilterRecord> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('search_role_filters')
    .insert({
      search_id: input.searchId,
      titles: input.titles,
      seniorities: input.seniorities ?? [],
      departments: input.departments ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create role filter: ${error.message}`);
  return data as RoleFilterRecord;
}

export async function getRoleFilters(searchId: string): Promise<RoleFilterRecord[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('search_role_filters')
    .select()
    .eq('search_id', searchId);

  if (error) throw new Error(`Failed to get role filters: ${error.message}`);
  return data as RoleFilterRecord[];
}
