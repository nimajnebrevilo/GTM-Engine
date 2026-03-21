/**
 * Company CRUD, upsert, and dedup-aware queries.
 *
 * Companies are a SHARED ASSET — they exist independently of any client/campaign.
 */

import { getSupabaseClient } from '../client.js';
import type { RawCompanyRecord } from '../../sources/types.js';

export interface CompanyRow {
  id: string;
  name: string;
  name_normalized: string;
  domain: string | null;
  linkedin_url: string | null;
  registration_number: string | null;
  jurisdiction: string | null;
  apollo_id: string | null;
  industry: string | null;
  sub_industry: string | null;
  sic_codes: string[] | null;
  employee_count: number | null;
  employee_range: string | null;
  revenue_estimate_usd: number | null;
  revenue_range: string | null;
  founded_year: number | null;
  company_type: string | null;
  address_line1: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  general_email: string | null;
  website: string | null;
  description: string | null;
  tags: string[];
  original_source: string;
  source_url: string | null;
  source_data: Record<string, unknown>;
  confidence_score: number;
  validation_status: string;
  validated_at: string | null;
  enrichment_status: string;
  enriched_at: string | null;
  enrichment_sources: string[];
  times_used: number;
  last_used_at: string | null;
  first_seen_at: string;
  dedup_cluster_id: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Normalize a company name for dedup matching.
 * Strips legal suffixes, lowercases, removes punctuation.
 */
export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')  // strip diacritics
    .toLowerCase()
    .replace(/\b(ltd|limited|inc|incorporated|corp|corporation|llc|llp|plc|gmbh|ag|sa|bv|nv|pty|co|company|group|holdings)\b\.?/gi, '')
    .replace(/[^\w\s]/g, '')          // strip punctuation
    .replace(/\s+/g, ' ')            // collapse whitespace
    .trim();
}

/**
 * Extract the root domain from a URL.
 */
export function extractDomain(url: string): string | null {
  try {
    const hostname = new URL(url.startsWith('http') ? url : `https://${url}`).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * Insert a raw company record from a source.
 * Deduplicates against the shared company pool (not scoped to a project).
 */
export async function upsertCompany(
  record: RawCompanyRecord,
): Promise<{ id: string; isNew: boolean }> {
  const db = getSupabaseClient();
  const nameNormalized = normalizeName(record.name);
  const domain = record.website ? extractDomain(record.website) : null;

  // Check for existing record by registration number + jurisdiction
  if (record.registrationNumber && record.jurisdiction) {
    const { data: existing } = await db
      .from('companies')
      .select('id, source_data')
      .eq('jurisdiction', record.jurisdiction)
      .eq('registration_number', record.registrationNumber)
      .maybeSingle();

    if (existing) {
      const sourceData = { ...(existing.source_data as Record<string, unknown>), [record.sourceName]: record.rawData };
      await db
        .from('companies')
        .update({ source_data: sourceData })
        .eq('id', existing.id);

      return { id: existing.id, isNew: false };
    }
  }

  // Check for existing record by domain
  if (domain) {
    const { data: domainMatch } = await db
      .from('companies')
      .select('id, source_data')
      .eq('domain', domain)
      .maybeSingle();

    if (domainMatch) {
      const sourceData = { ...(domainMatch.source_data as Record<string, unknown>), [record.sourceName]: record.rawData };
      const updates: Record<string, unknown> = { source_data: sourceData };
      if (record.description) updates.description = record.description;
      if (record.employeeCount) updates.employee_count = record.employeeCount;
      if (record.foundedYear) updates.founded_year = record.foundedYear;
      if (record.registrationNumber) updates.registration_number = record.registrationNumber;

      await db.from('companies').update(updates).eq('id', domainMatch.id);
      return { id: domainMatch.id, isNew: false };
    }
  }

  // Check for existing record by normalized name + jurisdiction
  const { data: nameMatch } = await db
    .from('companies')
    .select('id, source_data')
    .eq('name_normalized', nameNormalized)
    .eq('jurisdiction', record.jurisdiction ?? record.country ?? '')
    .maybeSingle();

  if (nameMatch) {
    const sourceData = { ...(nameMatch.source_data as Record<string, unknown>), [record.sourceName]: record.rawData };
    const updates: Record<string, unknown> = { source_data: sourceData };
    if (record.website) updates.website = record.website;
    if (record.website) updates.domain = domain;
    if (record.description) updates.description = record.description;
    if (record.employeeCount) updates.employee_count = record.employeeCount;
    if (record.foundedYear) updates.founded_year = record.foundedYear;
    if (record.registrationNumber) updates.registration_number = record.registrationNumber;

    await db.from('companies').update(updates).eq('id', nameMatch.id);
    return { id: nameMatch.id, isNew: false };
  }

  // Insert new record
  const { data, error } = await db
    .from('companies')
    .insert({
      name: record.name,
      name_normalized: nameNormalized,
      domain,
      jurisdiction: record.jurisdiction ?? record.country ?? null,
      registration_number: record.registrationNumber ?? null,
      website: record.website ? (domain ? `https://${domain}` : record.website) : null,
      description: record.description ?? null,
      industry: record.industry ?? null,
      sic_codes: record.sicCodes ?? null,
      employee_count: record.employeeCount ?? null,
      founded_year: record.foundedYear ?? null,
      company_type: record.companyType ?? null,
      address_line1: record.addressLine1 ?? null,
      city: record.city ?? null,
      region: record.region ?? null,
      postal_code: record.postalCode ?? null,
      country: record.country ?? null,
      original_source: record.sourceName,
      source_url: record.sourceUrl ?? null,
      source_data: { [record.sourceName]: record.rawData },
      confidence_score: 0.5,
      is_primary: true,
    })
    .select('id')
    .single();

  if (error) throw new Error(`Failed to insert company: ${error.message}`);
  return { id: data.id, isNew: true };
}

/**
 * Batch upsert companies.
 */
export async function batchUpsertCompanies(
  records: RawCompanyRecord[],
): Promise<{ inserted: number; merged: number; errors: number }> {
  let inserted = 0;
  let merged = 0;
  let errors = 0;

  for (const record of records) {
    try {
      const result = await upsertCompany(record);
      if (result.isNew) inserted++;
      else merged++;
    } catch {
      errors++;
    }
  }

  return { inserted, merged, errors };
}

/**
 * Get company counts by industry and country for gap analysis.
 */
export async function getCompanyCoverage(): Promise<Array<{
  industry: string;
  country: string;
  count: number;
}>> {
  const db = getSupabaseClient();

  const { data: companies, error } = await db
    .from('companies')
    .select('industry, country')
    .eq('is_primary', true)
    .neq('validation_status', 'do_not_contact');

  if (error) throw new Error(`Failed to get coverage: ${error.message}`);

  const counts = new Map<string, number>();
  for (const c of companies ?? []) {
    const key = `${c.industry ?? 'unknown'}|${c.country ?? 'unknown'}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([key, count]) => {
    const [industry, country] = key.split('|');
    return { industry, country, count };
  });
}

/**
 * Get total company count (shared pool).
 */
export async function getCompanyCount(): Promise<number> {
  const db = getSupabaseClient();
  const { count, error } = await db
    .from('companies')
    .select('*', { count: 'exact', head: true })
    .eq('is_primary', true)
    .neq('validation_status', 'do_not_contact');

  if (error) throw new Error(`Failed to count companies: ${error.message}`);
  return count ?? 0;
}
