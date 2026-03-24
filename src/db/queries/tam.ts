/**
 * Campaign assignment, overlap detection, and export queries.
 *
 * Key safety feature: before adding a company or contact to a campaign,
 * we check for overlaps across OTHER campaigns for the SAME client.
 * This prevents the same prospect being contacted multiple times.
 */

import { getSupabaseClient } from '../client.js';
import { bulkImportCampaignCompanies, bulkImportCampaignContacts } from '../../lib/bulk-import.js';

// ---------------------------------------------------------------------------
// Overlap & recency warnings
// ---------------------------------------------------------------------------

export interface OverlapWarning {
  entityType: 'company' | 'contact';
  entityId: string;
  entityName: string;
  conflictingCampaignId: string;
  conflictingCampaignName: string;
  addedAt: string;
  outcome: string | null;       // null for contacts (they use outreach_status)
  outreachStatus: string | null; // null for companies
  daysSinceAdded: number;
}

/**
 * Check if companies are already in other campaigns for the same client.
 * Returns warnings for any overlaps found.
 */
export async function checkCompanyOverlaps(
  campaignId: string,
  companyIds: string[],
): Promise<OverlapWarning[]> {
  if (companyIds.length === 0) return [];

  const db = getSupabaseClient();

  // Get the client_id for this campaign
  const { data: campaign } = await db
    .from('campaigns')
    .select('client_id')
    .eq('id', campaignId)
    .single();

  if (!campaign) return [];

  // Find all other campaigns for this client
  const { data: otherCampaigns } = await db
    .from('campaigns')
    .select('id, name')
    .eq('client_id', campaign.client_id)
    .neq('id', campaignId);

  if (!otherCampaigns || otherCampaigns.length === 0) return [];

  const otherCampaignIds = otherCampaigns.map(c => c.id);
  const campaignNames = new Map(otherCampaigns.map(c => [c.id, c.name]));

  // Check for overlaps
  const { data: overlaps } = await db
    .from('campaign_companies')
    .select('campaign_id, company_id, added_at, outcome, companies (name)')
    .in('campaign_id', otherCampaignIds)
    .in('company_id', companyIds);

  if (!overlaps || overlaps.length === 0) return [];

  const now = Date.now();
  return overlaps.map(row => {
    const company = (row as Record<string, unknown>).companies as Record<string, unknown> | null;
    const addedAt = new Date(row.added_at).getTime();
    return {
      entityType: 'company' as const,
      entityId: row.company_id,
      entityName: (company?.name as string) ?? 'Unknown',
      conflictingCampaignId: row.campaign_id,
      conflictingCampaignName: campaignNames.get(row.campaign_id) ?? 'Unknown',
      addedAt: row.added_at,
      outcome: row.outcome,
      outreachStatus: null,
      daysSinceAdded: Math.floor((now - addedAt) / (1000 * 60 * 60 * 24)),
    };
  });
}

/**
 * Check if contacts are already in other campaigns for the same client.
 */
export async function checkContactOverlaps(
  campaignId: string,
  contactIds: string[],
): Promise<OverlapWarning[]> {
  if (contactIds.length === 0) return [];

  const db = getSupabaseClient();

  const { data: campaign } = await db
    .from('campaigns')
    .select('client_id')
    .eq('id', campaignId)
    .single();

  if (!campaign) return [];

  const { data: otherCampaigns } = await db
    .from('campaigns')
    .select('id, name')
    .eq('client_id', campaign.client_id)
    .neq('id', campaignId);

  if (!otherCampaigns || otherCampaigns.length === 0) return [];

  const otherCampaignIds = otherCampaigns.map(c => c.id);
  const campaignNames = new Map(otherCampaigns.map(c => [c.id, c.name]));

  const { data: overlaps } = await db
    .from('campaign_contacts')
    .select('campaign_id, contact_id, created_at, status, contacts (first_name, last_name)')
    .in('campaign_id', otherCampaignIds)
    .in('contact_id', contactIds);

  if (!overlaps || overlaps.length === 0) return [];

  const now = Date.now();
  return overlaps.map(row => {
    const contact = (row as Record<string, unknown>).contacts as Record<string, unknown> | null;
    const name = contact
      ? `${contact.first_name ?? ''} ${contact.last_name ?? ''}`.trim()
      : 'Unknown';
    const createdAt = new Date(row.created_at).getTime();
    return {
      entityType: 'contact' as const,
      entityId: row.contact_id,
      entityName: name,
      conflictingCampaignId: row.campaign_id,
      conflictingCampaignName: campaignNames.get(row.campaign_id) ?? 'Unknown',
      addedAt: row.created_at,
      outcome: null,
      outreachStatus: row.status,
      daysSinceAdded: Math.floor((now - createdAt) / (1000 * 60 * 60 * 24)),
    };
  });
}

/**
 * Format overlap warnings into human-readable messages.
 */
export function formatOverlapWarnings(warnings: OverlapWarning[]): string[] {
  return warnings.map(w => {
    const status = w.outcome ?? w.outreachStatus ?? 'unknown';
    const recency = w.daysSinceAdded === 0
      ? 'today'
      : w.daysSinceAdded === 1
        ? 'yesterday'
        : `${w.daysSinceAdded} days ago`;

    return `⚠ ${w.entityType === 'company' ? 'Company' : 'Contact'} "${w.entityName}" ` +
      `already in campaign "${w.conflictingCampaignName}" ` +
      `(added ${recency}, status: ${status})`;
  });
}

// ---------------------------------------------------------------------------
// Campaign ↔ Company assignment (with overlap checks)
// ---------------------------------------------------------------------------

export interface AssignResult {
  added: number;
  skipped: number;
  warnings: OverlapWarning[];
}

/**
 * Add companies to a campaign with overlap detection.
 * Returns warnings for any companies already in other campaigns for the same client.
 * Does NOT block the assignment — the caller decides whether to proceed.
 */
export async function assignCompaniesToCampaign(input: {
  campaignId: string;
  companies: Array<{
    companyId: string;
    icpFitScore?: number;
    segment?: string;
  }>;
  skipOverlapCheck?: boolean;
}): Promise<AssignResult> {
  const db = getSupabaseClient();
  const companyIds = input.companies.map(c => c.companyId);

  // Check for overlaps unless explicitly skipped
  const warnings = input.skipOverlapCheck
    ? []
    : await checkCompanyOverlaps(input.campaignId, companyIds);

  const records = input.companies.map(company => ({
    campaign_id: input.campaignId,
    company_id: company.companyId,
    icp_fit_score: company.icpFitScore ?? null,
    segment: company.segment ?? null,
  }));

  const result = await bulkImportCampaignCompanies(records);
  return {
    added: result.inserted + result.updated,
    skipped: result.errors,
    warnings,
  };
}

/**
 * Add contacts to a campaign with overlap detection.
 */
export async function assignContactsToCampaign(input: {
  campaignId: string;
  contactIds: string[];
  skipOverlapCheck?: boolean;
}): Promise<AssignResult> {
  const db = getSupabaseClient();

  const warnings = input.skipOverlapCheck
    ? []
    : await checkContactOverlaps(input.campaignId, input.contactIds);

  const records = input.contactIds.map(contactId => ({
    campaign_id: input.campaignId,
    contact_id: contactId,
  }));

  const result = await bulkImportCampaignContacts(records);
  return {
    added: result.inserted + result.updated,
    skipped: result.errors,
    warnings,
  };
}

/**
 * Single-company assignment (backward compat). Checks overlaps and warns.
 */
export async function assignCompanyToCampaign(input: {
  campaignId: string;
  companyId: string;
  icpFitScore?: number;
  segment?: string;
}): Promise<{ warnings: OverlapWarning[] }> {
  const result = await assignCompaniesToCampaign({
    campaignId: input.campaignId,
    companies: [{
      companyId: input.companyId,
      icpFitScore: input.icpFitScore,
      segment: input.segment,
    }],
  });
  return { warnings: result.warnings };
}

// ---------------------------------------------------------------------------
// Campaign queries
// ---------------------------------------------------------------------------

export async function getCampaignCompanies(campaignId: string): Promise<Array<{
  companyId: string;
  icpFitScore: number | null;
  segment: string | null;
  outcome: string;
  name: string;
  website: string | null;
  domain: string | null;
  country: string | null;
  industry: string | null;
  employeeCount: number | null;
}>> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('campaign_companies')
    .select(`
      company_id,
      icp_fit_score,
      segment,
      outcome,
      companies (name, website, domain, country, industry, employee_count)
    `)
    .eq('campaign_id', campaignId)
    .eq('included', true)
    .order('icp_fit_score', { ascending: false });

  if (error) throw new Error(`Failed to get campaign companies: ${error.message}`);

  return (data ?? []).map(row => {
    const company = (row as Record<string, unknown>).companies as Record<string, unknown> | null;
    return {
      companyId: row.company_id,
      icpFitScore: row.icp_fit_score,
      segment: row.segment,
      outcome: row.outcome,
      name: (company?.name as string) ?? '',
      website: (company?.website as string) ?? null,
      domain: (company?.domain as string) ?? null,
      country: (company?.country as string) ?? null,
      industry: (company?.industry as string) ?? null,
      employeeCount: (company?.employee_count as number) ?? null,
    };
  });
}

export async function getCampaignContacts(campaignId: string): Promise<Array<{
  contactId: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  repliedAt: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  title: string | null;
  companyName: string | null;
}>> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('campaign_contacts')
    .select(`
      contact_id,
      status,
      sent_at,
      opened_at,
      replied_at,
      contacts (first_name, last_name, email, title, companies (name))
    `)
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to get campaign contacts: ${error.message}`);

  return (data ?? []).map(row => {
    const contact = (row as Record<string, unknown>).contacts as Record<string, unknown> | null;
    const company = contact?.companies as Record<string, unknown> | null;
    return {
      contactId: row.contact_id,
      status: row.status,
      sentAt: row.sent_at,
      openedAt: row.opened_at,
      repliedAt: row.replied_at,
      firstName: (contact?.first_name as string) ?? null,
      lastName: (contact?.last_name as string) ?? null,
      email: (contact?.email as string) ?? null,
      title: (contact?.title as string) ?? null,
      companyName: (company?.name as string) ?? null,
    };
  });
}

export async function getCampaignStats(campaignId: string): Promise<{
  totalCompanies: number;
  includedCompanies: number;
  totalContacts: number;
  byOutcome: Record<string, number>;
  byOutreachStatus: Record<string, number>;
}> {
  const db = getSupabaseClient();

  const { count: totalCompanies } = await db
    .from('campaign_companies')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);

  const { count: includedCompanies } = await db
    .from('campaign_companies')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('included', true);

  const { count: totalContacts } = await db
    .from('campaign_contacts')
    .select('*', { count: 'exact', head: true })
    .eq('campaign_id', campaignId);

  const { data: outcomes } = await db
    .from('campaign_companies')
    .select('outcome')
    .eq('campaign_id', campaignId);

  const byOutcome: Record<string, number> = {};
  for (const row of outcomes ?? []) {
    byOutcome[row.outcome] = (byOutcome[row.outcome] ?? 0) + 1;
  }

  const { data: statuses } = await db
    .from('campaign_contacts')
    .select('status')
    .eq('campaign_id', campaignId);

  const byOutreachStatus: Record<string, number> = {};
  for (const row of statuses ?? []) {
    byOutreachStatus[row.status] = (byOutreachStatus[row.status] ?? 0) + 1;
  }

  return {
    totalCompanies: totalCompanies ?? 0,
    includedCompanies: includedCompanies ?? 0,
    totalContacts: totalContacts ?? 0,
    byOutcome,
    byOutreachStatus,
  };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export async function createExportRecord(input: {
  campaignId: string;
  format: 'csv' | 'json' | 'xlsx';
  fileUrl: string;
  rowCount: number;
  filtersApplied?: Record<string, unknown>;
}): Promise<string> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('exports')
    .insert({
      campaign_id: input.campaignId,
      format: input.format,
      file_url: input.fileUrl,
      row_count: input.rowCount,
      filters_applied: input.filtersApplied ?? null,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to create export record: ${error.message}`);
  return data.id;
}
