/**
 * ICP Definition CRUD — first-class entity for lead scoring.
 *
 * Each client can have multiple ICPs, versioned via parent_id chain.
 * Scoring weights are stored per ICP so different clients can have
 * different scoring priorities.
 */

import { getSupabaseClient } from '../client.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ICPDefinitionRow {
  id: string;
  client_id: string;
  name: string;
  version: number;
  parent_id: string | null;
  status: 'draft' | 'active' | 'archived';

  // Firmographic filters
  company_size_min: number | null;
  company_size_max: number | null;
  revenue_min_usd: number | null;
  revenue_max_usd: number | null;
  geographies: string[];
  industries: string[];
  company_types: string[];

  // Keywords
  keywords: string[];
  exclusion_keywords: string[];
  technology_signals: string[];

  // Scoring weights
  weight_geography: number;
  weight_industry: number;
  weight_size: number;
  weight_keywords: number;
  weight_signals: number;
  weight_website: number;
  exclusion_penalty: number;

  // Challenge metadata
  website_analysis: Record<string, unknown> | null;
  client_base_analysis: Record<string, unknown> | null;
  refinements: Record<string, unknown>[] | null;
  challenge_summary: string | null;

  // Role targeting
  target_titles: string[];
  target_seniorities: string[];
  target_departments: string[];

  created_at: string;
  updated_at: string;
}

export interface CreateICPInput {
  clientId: string;
  name: string;
  parentId?: string;

  companySizeMin?: number;
  companySizeMax?: number;
  revenueMinUsd?: number;
  revenueMaxUsd?: number;
  geographies?: string[];
  industries?: string[];
  companyTypes?: string[];

  keywords?: string[];
  exclusionKeywords?: string[];
  technologySignals?: string[];

  // Scoring weights (defaults from DB if omitted)
  weightGeography?: number;
  weightIndustry?: number;
  weightSize?: number;
  weightKeywords?: number;
  weightSignals?: number;
  weightWebsite?: number;
  exclusionPenalty?: number;

  // Role targeting
  targetTitles?: string[];
  targetSeniorities?: string[];
  targetDepartments?: string[];
}

export interface UpdateICPInput {
  name?: string;
  status?: 'draft' | 'active' | 'archived';

  companySizeMin?: number | null;
  companySizeMax?: number | null;
  revenueMinUsd?: number | null;
  revenueMaxUsd?: number | null;
  geographies?: string[];
  industries?: string[];
  companyTypes?: string[];

  keywords?: string[];
  exclusionKeywords?: string[];
  technologySignals?: string[];

  weightGeography?: number;
  weightIndustry?: number;
  weightSize?: number;
  weightKeywords?: number;
  weightSignals?: number;
  weightWebsite?: number;
  exclusionPenalty?: number;

  websiteAnalysis?: Record<string, unknown>;
  clientBaseAnalysis?: Record<string, unknown>;
  refinements?: Record<string, unknown>[];
  challengeSummary?: string;

  targetTitles?: string[];
  targetSeniorities?: string[];
  targetDepartments?: string[];
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createICPDefinition(input: CreateICPInput): Promise<ICPDefinitionRow> {
  const db = getSupabaseClient();

  // If this is a revision, calculate version from parent
  let version = 1;
  if (input.parentId) {
    const { data: parent } = await db
      .from('icp_definitions')
      .select('version')
      .eq('id', input.parentId)
      .single();
    if (parent) version = parent.version + 1;
  }

  const { data, error } = await db
    .from('icp_definitions')
    .insert({
      client_id: input.clientId,
      name: input.name,
      version,
      parent_id: input.parentId ?? null,
      status: 'draft',

      company_size_min: input.companySizeMin ?? null,
      company_size_max: input.companySizeMax ?? null,
      revenue_min_usd: input.revenueMinUsd ?? null,
      revenue_max_usd: input.revenueMaxUsd ?? null,
      geographies: input.geographies ?? [],
      industries: input.industries ?? [],
      company_types: input.companyTypes ?? [],

      keywords: input.keywords ?? [],
      exclusion_keywords: input.exclusionKeywords ?? [],
      technology_signals: input.technologySignals ?? [],

      ...(input.weightGeography != null && { weight_geography: input.weightGeography }),
      ...(input.weightIndustry != null && { weight_industry: input.weightIndustry }),
      ...(input.weightSize != null && { weight_size: input.weightSize }),
      ...(input.weightKeywords != null && { weight_keywords: input.weightKeywords }),
      ...(input.weightSignals != null && { weight_signals: input.weightSignals }),
      ...(input.weightWebsite != null && { weight_website: input.weightWebsite }),
      ...(input.exclusionPenalty != null && { exclusion_penalty: input.exclusionPenalty }),

      target_titles: input.targetTitles ?? [],
      target_seniorities: input.targetSeniorities ?? [],
      target_departments: input.targetDepartments ?? [],
    })
    .select()
    .single();

  if (error) throw new Error(`Failed to create ICP definition: ${error.message}`);
  return data as ICPDefinitionRow;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

export async function getICPDefinition(id: string): Promise<ICPDefinitionRow> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('icp_definitions')
    .select()
    .eq('id', id)
    .single();

  if (error) throw new Error(`Failed to get ICP definition: ${error.message}`);
  return data as ICPDefinitionRow;
}

/**
 * Get the active ICP for a client. Returns null if none is active.
 */
export async function getActiveICP(clientId: string): Promise<ICPDefinitionRow | null> {
  const db = getSupabaseClient();
  const { data } = await db
    .from('icp_definitions')
    .select()
    .eq('client_id', clientId)
    .eq('status', 'active')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();

  return data as ICPDefinitionRow | null;
}

/**
 * List all ICP definitions for a client, newest first.
 */
export async function listClientICPs(clientId: string): Promise<ICPDefinitionRow[]> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('icp_definitions')
    .select()
    .eq('client_id', clientId)
    .order('version', { ascending: false });

  if (error) throw new Error(`Failed to list ICPs: ${error.message}`);
  return data as ICPDefinitionRow[];
}

/**
 * Get the version history of an ICP (follow parent_id chain).
 */
export async function getICPHistory(icpId: string): Promise<ICPDefinitionRow[]> {
  const db = getSupabaseClient();
  const history: ICPDefinitionRow[] = [];
  let currentId: string | null = icpId;

  while (currentId) {
    const { data, error } = await db
      .from('icp_definitions')
      .select()
      .eq('id', currentId)
      .single();

    if (error || !data) break;
    const row = data as ICPDefinitionRow;
    history.push(row);
    currentId = row.parent_id;
  }

  return history;
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateICPDefinition(
  id: string,
  input: UpdateICPInput,
): Promise<ICPDefinitionRow> {
  const db = getSupabaseClient();

  const updates: Record<string, unknown> = {};

  if (input.name !== undefined) updates.name = input.name;
  if (input.status !== undefined) updates.status = input.status;
  if (input.companySizeMin !== undefined) updates.company_size_min = input.companySizeMin;
  if (input.companySizeMax !== undefined) updates.company_size_max = input.companySizeMax;
  if (input.revenueMinUsd !== undefined) updates.revenue_min_usd = input.revenueMinUsd;
  if (input.revenueMaxUsd !== undefined) updates.revenue_max_usd = input.revenueMaxUsd;
  if (input.geographies !== undefined) updates.geographies = input.geographies;
  if (input.industries !== undefined) updates.industries = input.industries;
  if (input.companyTypes !== undefined) updates.company_types = input.companyTypes;
  if (input.keywords !== undefined) updates.keywords = input.keywords;
  if (input.exclusionKeywords !== undefined) updates.exclusion_keywords = input.exclusionKeywords;
  if (input.technologySignals !== undefined) updates.technology_signals = input.technologySignals;
  if (input.weightGeography !== undefined) updates.weight_geography = input.weightGeography;
  if (input.weightIndustry !== undefined) updates.weight_industry = input.weightIndustry;
  if (input.weightSize !== undefined) updates.weight_size = input.weightSize;
  if (input.weightKeywords !== undefined) updates.weight_keywords = input.weightKeywords;
  if (input.weightSignals !== undefined) updates.weight_signals = input.weightSignals;
  if (input.weightWebsite !== undefined) updates.weight_website = input.weightWebsite;
  if (input.exclusionPenalty !== undefined) updates.exclusion_penalty = input.exclusionPenalty;
  if (input.websiteAnalysis !== undefined) updates.website_analysis = input.websiteAnalysis;
  if (input.clientBaseAnalysis !== undefined) updates.client_base_analysis = input.clientBaseAnalysis;
  if (input.refinements !== undefined) updates.refinements = input.refinements;
  if (input.challengeSummary !== undefined) updates.challenge_summary = input.challengeSummary;
  if (input.targetTitles !== undefined) updates.target_titles = input.targetTitles;
  if (input.targetSeniorities !== undefined) updates.target_seniorities = input.targetSeniorities;
  if (input.targetDepartments !== undefined) updates.target_departments = input.targetDepartments;

  const { data, error } = await db
    .from('icp_definitions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Failed to update ICP definition: ${error.message}`);
  return data as ICPDefinitionRow;
}

/**
 * Activate an ICP and archive all other ICPs for the same client.
 */
export async function activateICP(id: string): Promise<ICPDefinitionRow> {
  const db = getSupabaseClient();

  // Get the ICP to find client_id
  const icp = await getICPDefinition(id);

  // Archive all other active ICPs for this client
  await db
    .from('icp_definitions')
    .update({ status: 'archived' })
    .eq('client_id', icp.client_id)
    .eq('status', 'active')
    .neq('id', id);

  // Activate this one
  return updateICPDefinition(id, { status: 'active' });
}

/**
 * Create a new version of an ICP (for refinement).
 * Copies all fields from the parent and sets status to draft.
 */
export async function refineICP(
  parentId: string,
  overrides: Partial<CreateICPInput> = {},
): Promise<ICPDefinitionRow> {
  const parent = await getICPDefinition(parentId);

  return createICPDefinition({
    clientId: parent.client_id,
    name: overrides.name ?? `${parent.name} (v${parent.version + 1})`,
    parentId: parent.id,

    companySizeMin: overrides.companySizeMin ?? parent.company_size_min ?? undefined,
    companySizeMax: overrides.companySizeMax ?? parent.company_size_max ?? undefined,
    revenueMinUsd: overrides.revenueMinUsd ?? parent.revenue_min_usd ?? undefined,
    revenueMaxUsd: overrides.revenueMaxUsd ?? parent.revenue_max_usd ?? undefined,
    geographies: overrides.geographies ?? parent.geographies,
    industries: overrides.industries ?? parent.industries,
    companyTypes: overrides.companyTypes ?? parent.company_types,

    keywords: overrides.keywords ?? parent.keywords,
    exclusionKeywords: overrides.exclusionKeywords ?? parent.exclusion_keywords,
    technologySignals: overrides.technologySignals ?? parent.technology_signals,

    weightGeography: overrides.weightGeography ?? parent.weight_geography,
    weightIndustry: overrides.weightIndustry ?? parent.weight_industry,
    weightSize: overrides.weightSize ?? parent.weight_size,
    weightKeywords: overrides.weightKeywords ?? parent.weight_keywords,
    weightSignals: overrides.weightSignals ?? parent.weight_signals,
    weightWebsite: overrides.weightWebsite ?? parent.weight_website,
    exclusionPenalty: overrides.exclusionPenalty ?? parent.exclusion_penalty,

    targetTitles: overrides.targetTitles ?? parent.target_titles,
    targetSeniorities: overrides.targetSeniorities ?? parent.target_seniorities,
    targetDepartments: overrides.targetDepartments ?? parent.target_departments,
  });
}
