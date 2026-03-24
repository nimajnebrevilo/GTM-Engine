/**
 * Direct PostgreSQL bulk loader — bypasses Supabase REST API.
 * Uses multi-row INSERT for fast loading of 13M+ company records.
 *
 * Usage: npx tsx src/sources/pg-bulk-loader.ts [data-dir]
 */

import 'dotenv/config';
import { createReadStream } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { parse } from 'csv-parse';
import pg from 'pg';
import { normalizeName, extractDomain } from '../db/queries/companies.js';
import { categoriseIndustry } from './bulk-csv-loader.js';
import { bulkImportCompanies } from '../lib/bulk-import.js';

const { Pool } = pg;

// ---------------------------------------------------------------------------
// Google Maps category parser (same as bulk-csv-loader)
// ---------------------------------------------------------------------------

function parseGmapsCategories(raw: string): string[] {
  if (!raw) return [];
  try {
    return raw
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(s => s.trim().replace(/^'|'$/g, '').replace(/^"|"$/g, ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------

interface CompanyInsert {
  name: string;
  name_normalized: string;
  domain: string | null;
  linkedin_url: string | null;
  website: string | null;
  description: string | null;
  industry: string;
  sub_industry: string | null;
  employee_count: number | null;
  employee_range: string | null;
  founded_year: number | null;
  company_type: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  country: string;
  original_source: string;
  source_data: Record<string, unknown>;
  confidence_score: number;
  is_primary: boolean;
}

function saasRowToInsert(row: Record<string, string>): CompanyInsert | null {
  const name = row['Company Name'];
  if (!name?.trim()) return null;

  const industry = row['Industry'] || row['JSON Industry'] || row['Derived Industry'] || null;
  const employeeCount = parseInt(row['Employee Headcount'] || row['JSON Employee Headcount'], 10) || null;
  const foundedYear = parseInt(row['Founded'], 10) || null;
  const domain = row['Domain'] ? extractDomain(row['Domain']) : null;
  const category = categoriseIndustry(industry);
  const employeeSizeRange = row['Employee Size Range'] || row['JSON Employee Size Range'] || null;

  return {
    name,
    name_normalized: normalizeName(name),
    domain,
    linkedin_url: row['LinkedIn Company URL'] || null,
    website: domain ? `https://${domain}` : null,
    description: (row['Description'] || row['Derived Description'] || '').slice(0, 2000) || null,
    industry: category,
    sub_industry: row['SubIndustry'] || null,
    employee_count: employeeCount,
    employee_range: employeeSizeRange,
    founded_year: foundedYear,
    company_type: row['Company Type'] || row['Business Type'] || null,
    city: row['Locality'] || null,
    postal_code: null,
    phone: null,
    country: row['Country'] || row['JSON Country'] || 'US',
    original_source: 'saas-companies-list',
    source_data: {
      originalIndustry: industry,
      specialties: row['Specialties'] || null,
      annualRevenueClay: row['Annual Revenue Clay'] || null,
      annualRevenueHubspot: row['Annual Revenue Hubspot'] || null,
      totalFundingRange: row['Total Funding Range'] || null,
      scaleScope: row['Scale Scope'] || null,
      patternTags: row['Pattern Tags'] || null,
      followerCount: row['Follower Count'] || null,
      slug: row['Slug'] || null,
    },
    confidence_score: 0.7,
    is_primary: true,
  };
}

function gmapsRowToInsert(row: Record<string, string>): CompanyInsert | null {
  const name = row['title'];
  if (!name?.trim()) return null;

  const categories = parseGmapsCategories(row['category_titles']);
  const primaryCategory = categories[0] || null;
  const industry = categoriseIndustry(primaryCategory);
  const domain = row['link'] ? extractDomain(row['link']) : null;

  return {
    name,
    name_normalized: normalizeName(name),
    domain,
    linkedin_url: null,
    website: domain ? `https://${domain}` : null,
    description: null,
    industry,
    sub_industry: null,
    employee_count: null,
    employee_range: null,
    founded_year: null,
    company_type: null,
    city: null,
    postal_code: row['zip_code'] || null,
    phone: row['phone'] || null,
    country: 'US',
    original_source: 'google-maps-scrape',
    source_data: {
      categories,
      displayLink: row['normalized_display_link'] || null,
    },
    confidence_score: 0.5,
    is_primary: true,
  };
}

// ---------------------------------------------------------------------------
// Bulk insert via multi-row INSERT
// ---------------------------------------------------------------------------

const COLUMNS = [
  'name', 'name_normalized', 'domain', 'linkedin_url', 'website',
  'description', 'industry', 'sub_industry', 'employee_count', 'employee_range',
  'founded_year', 'company_type', 'city', 'postal_code', 'phone',
  'country', 'original_source', 'source_data', 'confidence_score', 'is_primary',
] as const;

const BATCH_SIZE = 2000;

async function flushBatch(_pool: pg.Pool, batch: CompanyInsert[]): Promise<{ inserted: number; errors: number }> {
  if (batch.length === 0) return { inserted: 0, errors: 0 };

  try {
    const result = await bulkImportCompanies(
      batch.map(row => ({
        ...row,
        source_data: row.source_data,
      })),
      'pg-bulk-loader',
    );
    return { inserted: result.inserted + result.updated, errors: result.errors };
  } catch (err) {
    console.error(`  Bulk import error: ${(err as Error).message?.slice(0, 200)}`);
    return { inserted: 0, errors: batch.length };
  }
}

// ---------------------------------------------------------------------------
// Stream + load a single CSV file
// ---------------------------------------------------------------------------

interface LoadStats {
  totalRows: number;
  inserted: number;
  errors: number;
  skipped: number;
  durationMs: number;
}

async function loadCsvFile(pool: pg.Pool, filePath: string, format: 'saas' | 'gmaps'): Promise<LoadStats> {
  const start = Date.now();
  let totalRows = 0;
  let inserted = 0;
  let errors = 0;
  let skipped = 0;
  let batch: CompanyInsert[] = [];

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      trim: true,
    }),
  );

  for await (const row of parser) {
    totalRows++;
    const record = format === 'saas' ? saasRowToInsert(row) : gmapsRowToInsert(row);
    if (!record) { skipped++; continue; }

    batch.push(record);

    if (batch.length >= BATCH_SIZE) {
      const result = await flushBatch(pool, batch);
      inserted += result.inserted;
      errors += result.errors;
      batch = [];

      if (totalRows % 100_000 === 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(0);
        const rate = Math.round(inserted / ((Date.now() - start) / 1000));
        console.log(
          `  [${format}] ${totalRows.toLocaleString()} rows | ` +
          `${inserted.toLocaleString()} inserted | ${errors} errors | ` +
          `${rate.toLocaleString()}/s | ${elapsed}s`,
        );
      }
    }
  }

  if (batch.length > 0) {
    const result = await flushBatch(pool, batch);
    inserted += result.inserted;
    errors += result.errors;
  }

  return { totalRows, inserted, errors, skipped, durationMs: Date.now() - start };
}

// ---------------------------------------------------------------------------
// Track import in data_imports table
// ---------------------------------------------------------------------------

async function trackImport(pool: pg.Pool, sourceName: string, fileName: string, stats: LoadStats) {
  await pool.query(
    `INSERT INTO data_imports (id, source_name, source_type, file_name, record_count, records_inserted, records_skipped, records_errored)
     VALUES (gen_random_uuid(), $1, 'csv', $2, $3, $4, $5, $6)`,
    [sourceName, fileName, stats.totalRows, stats.inserted, stats.skipped, stats.errors],
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const dataDir = process.argv[2] || './data';
  const connStr = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/prospecting';

  console.log('=== Direct PostgreSQL Bulk Loader ===');
  console.log(`Data directory: ${dataDir}`);
  console.log(`Connecting to: ${connStr.replace(/:[^:@]+@/, ':***@')}\n`);

  const pool = new Pool({ connectionString: connStr, max: 4 });

  // Verify connection
  const res = await pool.query('SELECT count(*) FROM companies');
  console.log(`Current companies count: ${parseInt(res.rows[0].count).toLocaleString()}\n`);

  // Try to disable triggers for speed (requires superuser — won't work on Supabase)
  let triggersDisabled = false;
  try {
    await pool.query('ALTER TABLE companies DISABLE TRIGGER ALL');
    triggersDisabled = true;
    console.log('Triggers disabled for bulk load.');
  } catch {
    console.log('Could not disable triggers (normal for Supabase hosted DB). Continuing...');
  }

  const allStats: Array<{ file: string; stats: LoadStats }> = [];

  // 1. SaaS companies
  const saasDir = join(dataDir, 'saas');
  try {
    const saasFiles = (await readdir(saasDir)).filter(f => f.endsWith('.csv'));
    for (const file of saasFiles) {
      console.log(`\nLoading SaaS: ${file}`);
      const stats = await loadCsvFile(pool, join(saasDir, file), 'saas');
      allStats.push({ file, stats });
      console.log(
        `  Done: ${stats.inserted.toLocaleString()} inserted, ${stats.errors} errors, ` +
        `${stats.skipped} skipped (${(stats.durationMs / 1000).toFixed(1)}s)`,
      );
      await trackImport(pool, 'saas-companies-list', file, stats);
    }
  } catch {
    console.log('No SaaS data directory found, skipping.');
  }

  // 2. Google Maps
  const gmapsDir = join(dataDir, 'gmaps');
  try {
    const gmapsFiles = (await readdir(gmapsDir))
      .filter(f => f.endsWith('.csv'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/part(\d+)/)?.[1] ?? '0', 10);
        const numB = parseInt(b.match(/part(\d+)/)?.[1] ?? '0', 10);
        return numA - numB;
      });

    for (const file of gmapsFiles) {
      console.log(`\nLoading Google Maps: ${file}`);
      const stats = await loadCsvFile(pool, join(gmapsDir, file), 'gmaps');
      allStats.push({ file, stats });
      console.log(
        `  Done: ${stats.inserted.toLocaleString()} inserted, ${stats.errors} errors, ` +
        `${stats.skipped} skipped (${(stats.durationMs / 1000).toFixed(1)}s)`,
      );
      await trackImport(pool, 'google-maps-scrape', file, stats);
    }
  } catch {
    console.log('No Google Maps data directory found, skipping.');
  }

  // Re-enable triggers if we disabled them
  if (triggersDisabled) {
    console.log('\nRe-enabling triggers...');
    await pool.query('ALTER TABLE companies ENABLE TRIGGER ALL');
  }

  // Summary
  console.log('\n=== LOAD SUMMARY ===');
  let grandInserted = 0;
  let grandErrors = 0;
  let grandTotal = 0;
  for (const { file, stats } of allStats) {
    console.log(`  ${file}: ${stats.inserted.toLocaleString()} rows (${stats.errors} errors)`);
    grandInserted += stats.inserted;
    grandErrors += stats.errors;
    grandTotal += stats.totalRows;
  }
  console.log(`\n  TOTAL: ${grandInserted.toLocaleString()} / ${grandTotal.toLocaleString()} rows inserted (${grandErrors} errors)`);

  // Final count
  const finalRes = await pool.query('SELECT count(*) FROM companies');
  console.log(`  Companies in DB: ${parseInt(finalRes.rows[0].count).toLocaleString()}`);

  await pool.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
