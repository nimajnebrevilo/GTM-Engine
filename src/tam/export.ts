/**
 * Campaign export to CSV and JSON.
 */

import { getSupabaseClient } from '../db/client.js';

export interface ExportRow {
  company_name: string;
  domain: string;
  website: string;
  country: string;
  city: string;
  industry: string;
  sub_industry: string;
  employee_count: string;
  employee_range: string;
  revenue_estimate_usd: string;
  founded_year: string;
  company_type: string;
  registration_number: string;
  description: string;
  linkedin_url: string;
  phone: string;
  original_source: string;
  validation_status: string;
  enrichment_status: string;
  enriched_at: string;
  times_used: string;
  last_used_at: string;
  icp_fit_score: string;
  segment: string;
  outcome: string;
  tags: string;
}

/**
 * Fetch all export data for a campaign.
 */
export async function getExportData(
  campaignId: string,
): Promise<ExportRow[]> {
  const db = getSupabaseClient();

  const { data, error } = await db
    .from('campaign_companies')
    .select(`
      icp_fit_score,
      segment,
      outcome,
      companies (
        name, domain, website, country, city, industry, sub_industry,
        employee_count, employee_range, revenue_estimate_usd,
        founded_year, company_type, registration_number, description,
        linkedin_url, phone, original_source, validation_status,
        enrichment_status, enriched_at, times_used, last_used_at, tags
      )
    `)
    .eq('campaign_id', campaignId)
    .eq('included', true)
    .order('icp_fit_score', { ascending: false });

  if (error) throw new Error(`Failed to fetch export data: ${error.message}`);

  return (data ?? []).map(row => {
    const c = (row as Record<string, unknown>).companies as Record<string, unknown> | null;

    return {
      company_name: (c?.name as string) ?? '',
      domain: (c?.domain as string) ?? '',
      website: (c?.website as string) ?? '',
      country: (c?.country as string) ?? '',
      city: (c?.city as string) ?? '',
      industry: (c?.industry as string) ?? '',
      sub_industry: (c?.sub_industry as string) ?? '',
      employee_count: (c?.employee_count as number)?.toString() ?? '',
      employee_range: (c?.employee_range as string) ?? '',
      revenue_estimate_usd: (c?.revenue_estimate_usd as number)?.toString() ?? '',
      founded_year: (c?.founded_year as number)?.toString() ?? '',
      company_type: (c?.company_type as string) ?? '',
      registration_number: (c?.registration_number as string) ?? '',
      description: (c?.description as string) ?? '',
      linkedin_url: (c?.linkedin_url as string) ?? '',
      phone: (c?.phone as string) ?? '',
      original_source: (c?.original_source as string) ?? '',
      validation_status: (c?.validation_status as string) ?? '',
      enrichment_status: (c?.enrichment_status as string) ?? '',
      enriched_at: (c?.enriched_at as string) ?? '',
      times_used: (c?.times_used as number)?.toString() ?? '',
      last_used_at: (c?.last_used_at as string) ?? '',
      icp_fit_score: row.icp_fit_score?.toFixed(2) ?? '',
      segment: row.segment ?? '',
      outcome: row.outcome ?? '',
      tags: ((c?.tags as string[]) ?? []).join('; '),
    };
  });
}

/**
 * Convert export rows to CSV string.
 */
export function toCSV(rows: ExportRow[]): string {
  if (rows.length === 0) return '';

  const headers = Object.keys(rows[0]) as (keyof ExportRow)[];
  const escape = (val: string) => {
    if (val.includes(',') || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const headerLine = headers.map(h => escape(h)).join(',');
  const dataLines = rows.map(row =>
    headers.map(h => escape(row[h] ?? '')).join(','),
  );

  return [headerLine, ...dataLines].join('\n');
}

/**
 * Convert export rows to JSON string.
 */
export function toJSON(rows: ExportRow[]): string {
  return JSON.stringify(rows, null, 2);
}
