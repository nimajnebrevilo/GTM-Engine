/**
 * TAM builder: scores companies on ICP fit and calculates TAM metrics.
 */

import { getSupabaseClient } from '../db/client.js';
import type { ICPDefinition } from '../icp/types.js';

export interface TAMSummary {
  totalCompanies: number;
  totalRevenueUsd: number;
  byTier: Array<{ tier: string; count: number; revenue: number }>;
  byGeography: Array<{ country: string; count: number }>;
  byIndustry: Array<{ industry: string; count: number }>;
  bySize: Array<{ band: string; count: number }>;
}

/**
 * Score a company's fit against the ICP (0-1).
 */
export function scoreICPFit(
  company: {
    industry: string | null;
    country: string | null;
    employee_count: number | null;
    sic_codes: string[] | null;
    website: string | null;
    description: string | null;
  },
  icp: ICPDefinition,
): number {
  let score = 0;
  let weights = 0;

  // Geography match (weight: 3)
  if (company.country && icp.geographies.length > 0) {
    const geoMatch = icp.geographies.some(
      g => g.toLowerCase() === company.country!.toLowerCase() || g.toLowerCase() === 'global',
    );
    score += geoMatch ? 3 : 0;
    weights += 3;
  }

  // Industry match (weight: 3)
  if (company.industry && icp.industries.length > 0) {
    const industryMatch = icp.industries.some(
      i => company.industry!.toLowerCase().includes(i.toLowerCase()) ||
           i.toLowerCase().includes(company.industry!.toLowerCase()),
    );
    score += industryMatch ? 3 : 0;
    weights += 3;
  }

  // Size match (weight: 2)
  if (company.employee_count != null) {
    const min = icp.companySizeMin ?? 0;
    const max = icp.companySizeMax ?? Infinity;
    const sizeMatch = company.employee_count >= min && company.employee_count <= max;
    score += sizeMatch ? 2 : 0;
    weights += 2;
  }

  // Keyword match in description (weight: 2)
  if (company.description && icp.keywords.length > 0) {
    const descLower = company.description.toLowerCase();
    const keywordMatches = icp.keywords.filter(k => descLower.includes(k.toLowerCase())).length;
    const keywordRatio = keywordMatches / icp.keywords.length;
    score += keywordRatio * 2;
    weights += 2;
  }

  // Exclusion penalty
  if (company.description && icp.exclusionKeywords && icp.exclusionKeywords.length > 0) {
    const descLower = company.description.toLowerCase();
    const excluded = icp.exclusionKeywords.some(k => descLower.includes(k.toLowerCase()));
    if (excluded) score -= 2;
  }

  // Has website bonus (weight: 1)
  if (company.website) {
    score += 1;
    weights += 1;
  }

  return weights > 0 ? Math.max(0, Math.min(1, score / weights)) : 0.5;
}

/**
 * Classify employee count into size band.
 */
export function getSizeBand(employeeCount: number | null): string {
  if (employeeCount == null) return 'Unknown';
  if (employeeCount <= 10) return 'Micro (1-10)';
  if (employeeCount <= 50) return 'Small (11-50)';
  if (employeeCount <= 250) return 'Medium (51-250)';
  if (employeeCount <= 1000) return 'Large (251-1000)';
  return 'Enterprise (1000+)';
}

/**
 * Build TAM: score all companies and generate summary.
 */
export async function buildTAM(
  icp: ICPDefinition,
): Promise<TAMSummary> {
  const db = getSupabaseClient();

  // Fetch all primary, non-suppressed companies from the shared pool
  const { data: companies, error } = await db
    .from('companies')
    .select('id, name, industry, country, employee_count, sic_codes, website, description, revenue_estimate_usd')
    .eq('is_primary', true)
    .neq('validation_status', 'do_not_contact');

  if (error) throw new Error(`Failed to fetch companies: ${error.message}`);
  if (!companies) return { totalCompanies: 0, totalRevenueUsd: 0, byTier: [], byGeography: [], byIndustry: [], bySize: [] };

  const tierCounts = { 'Tier 1 - High Fit': 0, 'Tier 2 - Medium Fit': 0, 'Tier 3 - Low Fit': 0 };
  const geoCounts = new Map<string, number>();
  const industryCounts = new Map<string, number>();
  const sizeCounts = new Map<string, number>();

  // Score each company
  for (const company of companies) {
    const score = scoreICPFit(company, icp);

    // Tier
    if (score >= 0.8) tierCounts['Tier 1 - High Fit']++;
    else if (score >= 0.5) tierCounts['Tier 2 - Medium Fit']++;
    else tierCounts['Tier 3 - Low Fit']++;

    // Geography
    const country = company.country ?? 'Unknown';
    geoCounts.set(country, (geoCounts.get(country) ?? 0) + 1);

    // Industry
    const industry = company.industry ?? 'Unknown';
    industryCounts.set(industry, (industryCounts.get(industry) ?? 0) + 1);

    // Size
    const band = getSizeBand(company.employee_count);
    sizeCounts.set(band, (sizeCounts.get(band) ?? 0) + 1);
  }

  // Sum revenue directly from companies table
  const totalRevenueUsd = companies.reduce(
    (sum, c) => sum + (c.revenue_estimate_usd ?? 0), 0,
  );

  return {
    totalCompanies: companies.length,
    totalRevenueUsd,
    byTier: Object.entries(tierCounts).map(([tier, count]) => ({ tier, count, revenue: 0 })),
    byGeography: Array.from(geoCounts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count),
    byIndustry: Array.from(industryCounts.entries())
      .map(([industry, count]) => ({ industry, count }))
      .sort((a, b) => b.count - a.count),
    bySize: Array.from(sizeCounts.entries())
      .map(([band, count]) => ({ band, count }))
      .sort((a, b) => b.count - a.count),
  };
}
