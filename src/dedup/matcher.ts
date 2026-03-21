/**
 * Deduplication matching and merging logic.
 *
 * Match hierarchy (strongest → weakest):
 * 1. Exact: same (jurisdiction, registration_number) → confidence 1.0
 * 2. Domain: same website domain → confidence 0.8
 * 3. Fuzzy: Levenshtein similarity ≥ 0.90 within jurisdiction → confidence 0.7-0.9
 */

import { getSupabaseClient } from '../db/client.js';
import { normalizeDomain } from './normalizer.js';

export interface DedupResult {
  totalRecords: number;
  clustersFormed: number;
  recordsMerged: number;
  dedupRatio: number;
}

/**
 * Simple Levenshtein distance (no external dependency needed).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity ratio between two strings (0-1).
 */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

interface CompanyRecord {
  id: string;
  name_normalized: string;
  jurisdiction: string | null;
  registration_number: string | null;
  website: string | null;
  source_data: Record<string, unknown>;
  description: string | null;
  industry: string | null;
  employee_count: number | null;
  founded_year: number | null;
  city: string | null;
  country: string | null;
}

/**
 * Score how "complete" a record is (more fields = better primary candidate).
 */
function completenessScore(record: CompanyRecord): number {
  let score = 0;
  if (record.description) score += 2;
  if (record.industry) score += 1;
  if (record.employee_count) score += 2;
  if (record.founded_year) score += 1;
  if (record.website) score += 2;
  if (record.city) score += 1;
  if (record.registration_number) score += 2;
  score += Object.keys(record.source_data).length; // more sources = more trustworthy
  return score;
}

/**
 * Run full deduplication on all companies in a project.
 * Groups by jurisdiction, then matches within each group.
 */
export async function runDedup(): Promise<DedupResult> {
  const db = getSupabaseClient();

  // Fetch all primary companies from the shared pool
  const { data: companies, error } = await db
    .from('companies')
    .select('id, name_normalized, jurisdiction, registration_number, website, source_data, description, industry, employee_count, founded_year, city, country')
    .eq('is_primary', true)
    .neq('validation_status', 'do_not_contact')
    .order('created_at');

  if (error) throw new Error(`Failed to fetch companies: ${error.message}`);
  if (!companies || companies.length === 0) return { totalRecords: 0, clustersFormed: 0, recordsMerged: 0, dedupRatio: 0 };

  const records = companies as CompanyRecord[];
  const totalRecords = records.length;

  // Build clusters
  const clusters = new Map<string, CompanyRecord[]>(); // clusterId → records
  const assigned = new Set<string>(); // record IDs already in a cluster

  // Pass 1: Exact match on (jurisdiction, registration_number)
  const regIndex = new Map<string, CompanyRecord>();
  for (const record of records) {
    if (record.registration_number && record.jurisdiction) {
      const key = `${record.jurisdiction}|${record.registration_number}`;
      const existing = regIndex.get(key);
      if (existing) {
        // Same cluster
        const clusterId = existing.id;
        const cluster = clusters.get(clusterId) ?? [existing];
        cluster.push(record);
        clusters.set(clusterId, cluster);
        assigned.add(existing.id);
        assigned.add(record.id);
      } else {
        regIndex.set(key, record);
      }
    }
  }

  // Pass 2: Domain match
  const domainIndex = new Map<string, CompanyRecord>();
  for (const record of records) {
    if (assigned.has(record.id) || !record.website) continue;
    const domain = normalizeDomain(record.website);
    if (!domain) continue;

    const existing = domainIndex.get(domain);
    if (existing) {
      const clusterId = existing.id;
      const cluster = clusters.get(clusterId) ?? [existing];
      cluster.push(record);
      clusters.set(clusterId, cluster);
      assigned.add(existing.id);
      assigned.add(record.id);
    } else {
      domainIndex.set(domain, record);
    }
  }

  // Pass 3: Fuzzy name match within jurisdiction
  const byJurisdiction = new Map<string, CompanyRecord[]>();
  for (const record of records) {
    if (assigned.has(record.id)) continue;
    const jur = record.jurisdiction ?? record.country ?? 'unknown';
    const list = byJurisdiction.get(jur) ?? [];
    list.push(record);
    byJurisdiction.set(jur, list);
  }

  for (const [, jurRecords] of byJurisdiction) {
    for (let i = 0; i < jurRecords.length; i++) {
      if (assigned.has(jurRecords[i].id)) continue;
      for (let j = i + 1; j < jurRecords.length; j++) {
        if (assigned.has(jurRecords[j].id)) continue;
        const sim = similarity(jurRecords[i].name_normalized, jurRecords[j].name_normalized);
        if (sim >= 0.90) {
          const clusterId = jurRecords[i].id;
          const cluster = clusters.get(clusterId) ?? [jurRecords[i]];
          cluster.push(jurRecords[j]);
          clusters.set(clusterId, cluster);
          assigned.add(jurRecords[i].id);
          assigned.add(jurRecords[j].id);
        }
      }
    }
  }

  // Merge clusters: pick primary, update DB
  let recordsMerged = 0;
  for (const [clusterId, cluster] of clusters) {
    if (cluster.length < 2) continue;

    // Pick the most complete record as primary
    cluster.sort((a, b) => completenessScore(b) - completenessScore(a));
    const primary = cluster[0];
    const secondaries = cluster.slice(1);

    // Merge source data from secondaries into primary
    const mergedSourceData: Record<string, unknown> = {};
    for (const record of cluster) {
      Object.assign(mergedSourceData, record.source_data);
    }

    // Fill missing fields from secondaries
    const updates: Record<string, unknown> = {
      source_data: mergedSourceData,
      dedup_cluster_id: clusterId,
      is_primary: true,
      confidence_score: 1.0,
      updated_at: new Date().toISOString(),
    };

    for (const secondary of secondaries) {
      if (!primary.description && secondary.description) updates.description = secondary.description;
      if (!primary.industry && secondary.industry) updates.industry = secondary.industry;
      if (!primary.employee_count && secondary.employee_count) updates.employee_count = secondary.employee_count;
      if (!primary.founded_year && secondary.founded_year) updates.founded_year = secondary.founded_year;
      if (!primary.website && secondary.website) updates.website = secondary.website;
      if (!primary.city && secondary.city) updates.city = secondary.city;
    }

    // Update primary
    await db.from('companies').update(updates).eq('id', primary.id);

    // Mark secondaries as non-primary
    for (const secondary of secondaries) {
      await db.from('companies').update({
        dedup_cluster_id: clusterId,
        is_primary: false,
        updated_at: new Date().toISOString(),
      }).eq('id', secondary.id);
      recordsMerged++;
    }
  }

  return {
    totalRecords,
    clustersFormed: clusters.size,
    recordsMerged,
    dedupRatio: totalRecords > 0 ? recordsMerged / totalRecords : 0,
  };
}
