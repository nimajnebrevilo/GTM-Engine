/**
 * Bulk CSV loader for company data from external lists.
 * Handles two formats:
 *   1. SaaS companies CSV (27 columns, rich data)
 *   2. Google Maps scrape CSV (6 columns, thin data)
 *
 * Uses streaming CSV parsing + batch Supabase inserts for efficiency.
 */

import { createReadStream } from 'fs';
import { readdir } from 'fs/promises';
import { join } from 'path';
import { parse } from 'csv-parse';
import { getSupabaseClient } from '../db/client.js';
import { normalizeName, extractDomain } from '../db/queries/companies.js';
import { bulkImportCompanies } from '../lib/bulk-import.js';

// ---------------------------------------------------------------------------
// Industry categorisation
// ---------------------------------------------------------------------------

const INDUSTRY_CATEGORY_MAP: Record<string, string> = {
  // Technology & Software
  'software development': 'Technology & Software',
  'information technology & services': 'Technology & Software',
  'computer software': 'Technology & Software',
  'internet': 'Technology & Software',
  'computer & network security': 'Technology & Software',
  'computer networking': 'Technology & Software',
  'computer hardware': 'Technology & Software',
  'semiconductors': 'Technology & Software',
  'information technology': 'Technology & Software',
  'it services and it consulting': 'Technology & Software',
  'technology, information and internet': 'Technology & Software',
  'software as a service (saas)': 'Technology & Software',
  'artificial intelligence': 'Technology & Software',
  'data analytics': 'Technology & Software',
  'cloud computing': 'Technology & Software',
  'cybersecurity': 'Technology & Software',

  // Financial Services
  'financial services': 'Financial Services',
  'banking': 'Financial Services',
  'insurance': 'Financial Services',
  'venture capital & private equity': 'Financial Services',
  'investment management': 'Financial Services',
  'capital markets': 'Financial Services',
  'accounting': 'Financial Services',
  'fintech': 'Financial Services',

  // Healthcare & Life Sciences
  'hospital & health care': 'Healthcare & Life Sciences',
  'health, wellness and fitness': 'Healthcare & Life Sciences',
  'medical devices': 'Healthcare & Life Sciences',
  'pharmaceuticals': 'Healthcare & Life Sciences',
  'biotechnology': 'Healthcare & Life Sciences',
  'health care': 'Healthcare & Life Sciences',
  'mental health care': 'Healthcare & Life Sciences',
  'hospitals and health care': 'Healthcare & Life Sciences',

  // Professional Services
  'management consulting': 'Professional Services',
  'staffing and recruiting': 'Professional Services',
  'human resources': 'Professional Services',
  'legal services': 'Professional Services',
  'marketing and advertising': 'Professional Services',
  'marketing & advertising': 'Professional Services',
  'public relations and communications': 'Professional Services',
  'design': 'Professional Services',
  'graphic design': 'Professional Services',

  // Education
  'education management': 'Education',
  'e-learning': 'Education',
  'higher education': 'Education',
  'education': 'Education',
  'education administration programs': 'Education',

  // Real Estate & Construction
  'real estate': 'Real Estate & Construction',
  'construction': 'Real Estate & Construction',
  'architecture & planning': 'Real Estate & Construction',
  'building materials': 'Real Estate & Construction',
  'civil engineering': 'Real Estate & Construction',

  // Manufacturing
  'mechanical or industrial engineering': 'Manufacturing',
  'industrial automation': 'Manufacturing',
  'electrical/electronic manufacturing': 'Manufacturing',
  'machinery': 'Manufacturing',
  'manufacturing': 'Manufacturing',
  'automotive': 'Manufacturing',
  'plastics': 'Manufacturing',

  // Retail & E-commerce
  'retail': 'Retail & E-commerce',
  'e-commerce': 'Retail & E-commerce',
  'consumer goods': 'Retail & E-commerce',
  'apparel & fashion': 'Retail & E-commerce',
  'food & beverages': 'Retail & E-commerce',
  'luxury goods & jewelry': 'Retail & E-commerce',

  // Media & Entertainment
  'media production': 'Media & Entertainment',
  'entertainment': 'Media & Entertainment',
  'music': 'Media & Entertainment',
  'online media': 'Media & Entertainment',
  'broadcast media': 'Media & Entertainment',
  'gaming': 'Media & Entertainment',

  // Telecommunications
  'telecommunications': 'Telecommunications',
  'wireless': 'Telecommunications',

  // Energy & Utilities
  'oil & energy': 'Energy & Utilities',
  'renewables & environment': 'Energy & Utilities',
  'utilities': 'Energy & Utilities',
  'mining & metals': 'Energy & Utilities',

  // Transportation & Logistics
  'logistics and supply chain': 'Transportation & Logistics',
  'transportation/trucking/railroad': 'Transportation & Logistics',
  'aviation & aerospace': 'Transportation & Logistics',
  'maritime': 'Transportation & Logistics',

  // Government
  'government administration': 'Government & Public Sector',
  'government relations': 'Government & Public Sector',
  'public safety': 'Government & Public Sector',
  'military': 'Government & Public Sector',
  'government office': 'Government & Public Sector',
  'city government office': 'Government & Public Sector',

  // Nonprofit
  'nonprofit organization management': 'Nonprofit & NGO',
  'philanthropy': 'Nonprofit & NGO',
  'civic & social organization': 'Nonprofit & NGO',
  'religious institutions': 'Nonprofit & NGO',

  // Agriculture & Food
  'farming': 'Agriculture & Food',
  'food production': 'Agriculture & Food',
  'agriculture': 'Agriculture & Food',
  'dairy': 'Agriculture & Food',

  // Hospitality & Travel
  'hospitality': 'Hospitality & Travel',
  'restaurants': 'Hospitality & Travel',
  'leisure, travel & tourism': 'Hospitality & Travel',
  'food & beverage service': 'Hospitality & Travel',

  // Local Services (Google Maps categories)
  'plumber': 'Home & Local Services',
  'electrician': 'Home & Local Services',
  'hvac contractor': 'Home & Local Services',
  'roofing contractor': 'Home & Local Services',
  'general contractor': 'Home & Local Services',
  'painter': 'Home & Local Services',
  'landscaper': 'Home & Local Services',
  'cleaning service': 'Home & Local Services',
  'moving company': 'Home & Local Services',
  'locksmith': 'Home & Local Services',
  'pest control service': 'Home & Local Services',
  'garage door supplier': 'Home & Local Services',
  'tree service': 'Home & Local Services',
  'fencing contractor': 'Home & Local Services',
  'home builder': 'Home & Local Services',

  // Automotive Services
  'auto repair shop': 'Automotive Services',
  'car dealer': 'Automotive Services',
  'auto body shop': 'Automotive Services',
  'tire shop': 'Automotive Services',
  'car wash': 'Automotive Services',
  'auto parts store': 'Automotive Services',
  'used car dealer': 'Automotive Services',

  // Beauty & Personal Care
  'beauty salon': 'Beauty & Personal Care',
  'hair salon': 'Beauty & Personal Care',
  'barber shop': 'Beauty & Personal Care',
  'nail salon': 'Beauty & Personal Care',
  'spa': 'Beauty & Personal Care',
  'tattoo shop': 'Beauty & Personal Care',

  // Medical/Health Services (local)
  'dentist': 'Healthcare & Life Sciences',
  'doctor': 'Healthcare & Life Sciences',
  'chiropractor': 'Healthcare & Life Sciences',
  'veterinarian': 'Healthcare & Life Sciences',
  'physical therapist': 'Healthcare & Life Sciences',
  'optometrist': 'Healthcare & Life Sciences',
  'pharmacy': 'Healthcare & Life Sciences',

  // Legal (local)
  'lawyer': 'Professional Services',
  'law firm': 'Professional Services',
  'attorney': 'Professional Services',

  // Fitness
  'gym': 'Fitness & Recreation',
  'yoga studio': 'Fitness & Recreation',
  'martial arts school': 'Fitness & Recreation',
  'swimming pool': 'Fitness & Recreation',

  // Restaurant categories
  'restaurant': 'Hospitality & Travel',
  'pizza restaurant': 'Hospitality & Travel',
  'mexican restaurant': 'Hospitality & Travel',
  'chinese restaurant': 'Hospitality & Travel',
  'italian restaurant': 'Hospitality & Travel',
  'bar': 'Hospitality & Travel',
  'cafe': 'Hospitality & Travel',
  'bakery': 'Hospitality & Travel',
  'fast food restaurant': 'Hospitality & Travel',

  // Religious
  'church': 'Nonprofit & NGO',
  'mosque': 'Nonprofit & NGO',
  'synagogue': 'Nonprofit & NGO',

  // Storage
  'self-storage facility': 'Real Estate & Construction',
  'storage facility': 'Real Estate & Construction',

  // Hotels & Accommodation
  '2-star hotel': 'Hospitality & Travel',
  '3-star hotel': 'Hospitality & Travel',
  '4-star hotel': 'Hospitality & Travel',
  '5-star hotel': 'Hospitality & Travel',
  'hotel': 'Hospitality & Travel',
  'motel': 'Hospitality & Travel',
  'bed & breakfast': 'Hospitality & Travel',
  'resort hotel': 'Hospitality & Travel',
  'inn': 'Hospitality & Travel',

  // More restaurants
  'sandwich shop': 'Hospitality & Travel',
  'steak house': 'Hospitality & Travel',
  'pizza delivery': 'Hospitality & Travel',
  'coffee shop': 'Hospitality & Travel',
  'diner': 'Hospitality & Travel',
  'sushi restaurant': 'Hospitality & Travel',
  'thai restaurant': 'Hospitality & Travel',
  'seafood restaurant': 'Hospitality & Travel',
  'indian restaurant': 'Hospitality & Travel',
  'vietnamese restaurant': 'Hospitality & Travel',
  'japanese restaurant': 'Hospitality & Travel',
  'korean restaurant': 'Hospitality & Travel',
  'buffet restaurant': 'Hospitality & Travel',
  'breakfast restaurant': 'Hospitality & Travel',
  'brunch restaurant': 'Hospitality & Travel',
  'ice cream shop': 'Hospitality & Travel',
  'donut shop': 'Hospitality & Travel',
  'food truck': 'Hospitality & Travel',
  'catering food and drink supplier': 'Hospitality & Travel',

  // Medical/Health (more)
  'medical clinic': 'Healthcare & Life Sciences',
  'medical center': 'Healthcare & Life Sciences',
  'medical group': 'Healthcare & Life Sciences',
  'urgent care center': 'Healthcare & Life Sciences',
  'medical diagnostic imaging center': 'Healthcare & Life Sciences',
  'surgical center': 'Healthcare & Life Sciences',
  'community health centre': 'Healthcare & Life Sciences',
  'mental health service': 'Healthcare & Life Sciences',
  'mental health clinic': 'Healthcare & Life Sciences',
  'psychologist': 'Healthcare & Life Sciences',
  'psychiatrist': 'Healthcare & Life Sciences',
  'skin care clinic': 'Healthcare & Life Sciences',
  'medical laboratory': 'Healthcare & Life Sciences',
  'medical school': 'Healthcare & Life Sciences',
  'hospital': 'Healthcare & Life Sciences',
  'nursing home': 'Healthcare & Life Sciences',
  'rehabilitation center': 'Healthcare & Life Sciences',
  'podiatrist': 'Healthcare & Life Sciences',
  'dermatologist': 'Healthcare & Life Sciences',
  'cardiologist': 'Healthcare & Life Sciences',
  'pediatrician': 'Healthcare & Life Sciences',
  'orthopedic surgeon': 'Healthcare & Life Sciences',

  // Education (more)
  'elementary school': 'Education',
  'high school': 'Education',
  'middle school': 'Education',
  'preschool': 'Education',
  'university': 'Education',
  'college': 'Education',
  'community college': 'Education',
  'charter school': 'Education',
  'catholic school': 'Education',
  'montessori school': 'Education',
  'private school': 'Education',
  'public school': 'Education',
  'day care center': 'Education',
  'driving school': 'Education',
  'school district office': 'Education',
  'tutoring service': 'Education',
  'art school': 'Education',
  'beauty school': 'Education',
  'trade school': 'Education',
  'religious school': 'Education',
  'learning center': 'Education',
  'academic department': 'Education',

  // Nonprofit (more)
  'non-profit organization': 'Nonprofit & NGO',
  'association / organization': 'Nonprofit & NGO',
  'community center': 'Nonprofit & NGO',
  'social services organization': 'Nonprofit & NGO',

  // More Retail
  'cell phone store': 'Retail & E-commerce',
  'car rental agency': 'Transportation & Logistics',
  'business center': 'Professional Services',

  // Shopping
  'shopping mall': 'Retail & E-commerce',
  'department store': 'Retail & E-commerce',
  'grocery store': 'Retail & E-commerce',
  'supermarket': 'Retail & E-commerce',
  'convenience store': 'Retail & E-commerce',
  'clothing store': 'Retail & E-commerce',
  'furniture store': 'Retail & E-commerce',
  'hardware store': 'Retail & E-commerce',
  'pet store': 'Retail & E-commerce',
  'electronics store': 'Retail & E-commerce',
  'jewelry store': 'Retail & E-commerce',
  'florist': 'Retail & E-commerce',
  'liquor store': 'Retail & E-commerce',
  'book store': 'Retail & E-commerce',
};

/**
 * Categorise an industry string into a high-level sector.
 * Falls back to "Other" if no match found.
 */
export function categoriseIndustry(raw: string | null | undefined): string {
  if (!raw) return 'Other';
  const key = raw.toLowerCase().trim();
  if (INDUSTRY_CATEGORY_MAP[key]) return INDUSTRY_CATEGORY_MAP[key];

  // Fuzzy partial match
  for (const [pattern, category] of Object.entries(INDUSTRY_CATEGORY_MAP)) {
    if (key.includes(pattern) || pattern.includes(key)) return category;
  }
  return 'Other';
}

/**
 * Parse Google Maps category_titles field, e.g. "['Government office', 'City government office']"
 */
function parseGmapsCategories(raw: string): string[] {
  if (!raw) return [];
  try {
    // It's Python list syntax: ['foo', 'bar']
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
// CSV → RawCompanyRecord mappers
// ---------------------------------------------------------------------------

interface SaasRow {
  'Domain': string;
  'Company Name': string;
  'LinkedIn Company URL': string;
  'Industry': string;
  'JSON Industry': string;
  'Country': string;
  'JSON Country': string;
  'Employee Headcount': string;
  'JSON Employee Headcount': string;
  'Employee Size Range': string;
  'JSON Employee Size Range': string;
  'Description': string;
  'Company Type': string;
  'Business Type': string;
  'Pattern Tags': string;
  'Founded': string;
  'Locality': string;
  'Specialties': string;
  'Annual Revenue Clay': string;
  'Annual Revenue Hubspot': string;
  'Total Funding Range': string;
  'Scale Scope': string;
  'SubIndustry': string;
  'Derived Description': string;
  'Derived Industry': string;
  'Follower Count': string;
  'Slug': string;
}

interface GmapsRow {
  'title': string;
  'link': string;
  'phone': string;
  'category_titles': string;
  'zip_code': string;
  'normalized_display_link': string;
}

function saasRowToInsert(row: SaasRow) {
  const industry = row['Industry'] || row['JSON Industry'] || row['Derived Industry'] || null;
  const employeeCount = parseInt(row['Employee Headcount'] || row['JSON Employee Headcount'], 10) || null;
  const foundedYear = parseInt(row['Founded'], 10) || null;
  const domain = row['Domain'] ? extractDomain(row['Domain']) : null;
  const category = categoriseIndustry(industry);
  const employeeSizeRange = row['Employee Size Range'] || row['JSON Employee Size Range'] || null;

  return {
    name: row['Company Name'],
    name_normalized: normalizeName(row['Company Name']),
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

function gmapsRowToInsert(row: GmapsRow) {
  const categories = parseGmapsCategories(row['category_titles']);
  const primaryCategory = categories[0] || null;
  const industry = categoriseIndustry(primaryCategory);
  const domain = row['link'] ? extractDomain(row['link']) : null;

  return {
    name: row['title'],
    name_normalized: normalizeName(row['title']),
    domain,
    website: domain ? `https://${domain}` : null,
    industry,
    phone: row['phone'] || null,
    postal_code: row['zip_code'] || null,
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
// Streaming bulk loader
// ---------------------------------------------------------------------------

const BATCH_SIZE = 500;

interface LoadStats {
  totalRows: number;
  inserted: number;
  errors: number;
  skipped: number;
  durationMs: number;
}

async function loadCsvFile(
  filePath: string,
  format: 'saas' | 'gmaps',
): Promise<LoadStats> {
  const db = getSupabaseClient();
  const start = Date.now();
  let totalRows = 0;
  let inserted = 0;
  let errors = 0;
  let skipped = 0;
  let batch: Record<string, unknown>[] = [];

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

    // Skip rows without a name
    const name = format === 'saas' ? row['Company Name'] : row['title'];
    if (!name || !name.trim()) {
      skipped++;
      continue;
    }

    const record =
      format === 'saas'
        ? saasRowToInsert(row as SaasRow)
        : gmapsRowToInsert(row as GmapsRow);

    batch.push(record);

    if (batch.length >= BATCH_SIZE) {
      const result = await flushBatch(db, batch);
      inserted += result.inserted;
      errors += result.errors;
      batch = [];

      if (totalRows % 50_000 === 0) {
        console.log(
          `  [${format}] ${totalRows.toLocaleString()} rows processed | ` +
          `${inserted.toLocaleString()} inserted | ${errors} errors`,
        );
      }
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    const result = await flushBatch(db, batch);
    inserted += result.inserted;
    errors += result.errors;
  }

  return { totalRows, inserted, errors, skipped, durationMs: Date.now() - start };
}

async function flushBatch(
  _db: ReturnType<typeof getSupabaseClient>,
  batch: Record<string, unknown>[],
): Promise<{ inserted: number; errors: number }> {
  try {
    const result = await bulkImportCompanies(batch, 'csv-loader');
    return { inserted: result.inserted + result.updated, errors: result.errors };
  } catch (err) {
    console.error(`  Unexpected error during bulk import: ${err}`);
    return { inserted: 0, errors: batch.length };
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export async function runBulkLoad(
  dataDir: string,
): Promise<void> {
  const db = getSupabaseClient();
  console.log('=== Bulk CSV Company Loader ===');
  console.log(`Data directory: ${dataDir}`);

  const allStats: Array<{ file: string; stats: LoadStats }> = [];

  // 1. Load SaaS companies
  const saasDir = join(dataDir, 'saas');
  try {
    const saasFiles = (await readdir(saasDir)).filter(f => f.endsWith('.csv'));
    for (const file of saasFiles) {
      console.log(`\nLoading SaaS file: ${file}`);
      const stats = await loadCsvFile(join(saasDir, file), 'saas');
      allStats.push({ file, stats });
      console.log(
        `  Done: ${stats.inserted.toLocaleString()} inserted, ` +
        `${stats.errors} errors, ${stats.skipped} skipped ` +
        `(${(stats.durationMs / 1000).toFixed(1)}s)`,
      );

      // Track in data_imports
      await db.from('data_imports').insert({
        source_name: 'saas-companies-list',
        source_type: 'csv',
        file_name: file,
        record_count: stats.totalRows,
        records_inserted: stats.inserted,
        records_skipped: stats.skipped,
        records_errored: stats.errors,
      });
    }
  } catch {
    console.log('No SaaS data directory found, skipping.');
  }

  // 2. Load Google Maps scrape files
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
      console.log(`\nLoading Google Maps file: ${file}`);
      const stats = await loadCsvFile(join(gmapsDir, file), 'gmaps');
      allStats.push({ file, stats });
      console.log(
        `  Done: ${stats.inserted.toLocaleString()} inserted, ` +
        `${stats.errors} errors, ${stats.skipped} skipped ` +
        `(${(stats.durationMs / 1000).toFixed(1)}s)`,
      );

      // Track in data_imports
      await db.from('data_imports').insert({
        source_name: 'google-maps-scrape',
        source_type: 'csv',
        file_name: file,
        record_count: stats.totalRows,
        records_inserted: stats.inserted,
        records_skipped: stats.skipped,
        records_errored: stats.errors,
      });
    }
  } catch {
    console.log('No Google Maps data directory found, skipping.');
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
}

// CLI runner
if (process.argv[1]?.endsWith('bulk-csv-loader.ts') || process.argv[1]?.endsWith('bulk-csv-loader.js')) {
  const dataDir = process.argv[2] || './data';

  runBulkLoad(dataDir).catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
