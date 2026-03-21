/**
 * Validate and preview CSV data before loading to Supabase.
 * Shows sample records, category distribution, and data quality stats.
 * Usage: npx tsx src/sources/validate-data.ts [data-dir]
 */

import { createReadStream } from 'fs';
import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { parse } from 'csv-parse';
import { categoriseIndustry } from './bulk-csv-loader.js';

async function validateSaas(filePath: string) {
  console.log(`\n--- Validating SaaS file: ${filePath} ---`);
  const categories = new Map<string, number>();
  let total = 0;
  let noName = 0;
  let noDomain = 0;
  let noIndustry = 0;
  let sample: Record<string, string>[] = [];

  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true }),
  );

  for await (const row of parser) {
    total++;
    if (!row['Company Name']?.trim()) noName++;
    if (!row['Domain']?.trim()) noDomain++;
    const rawIndustry = row['Industry'] || row['JSON Industry'] || row['Derived Industry'];
    if (!rawIndustry) noIndustry++;
    const cat = categoriseIndustry(rawIndustry);
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
    if (sample.length < 3) sample.push(row);
    if (total >= 100_000) break; // Sample first 100k for speed
  }

  console.log(`  Total rows sampled: ${total.toLocaleString()}`);
  console.log(`  Missing name: ${noName} | Missing domain: ${noDomain} | Missing industry: ${noIndustry}`);
  console.log(`\n  Category distribution (sampled):`);
  const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`    ${cat}: ${count.toLocaleString()} (${((count / total) * 100).toFixed(1)}%)`);
  }
  console.log(`\n  Sample record:`);
  console.log(`    Name: ${sample[0]?.['Company Name']}`);
  console.log(`    Domain: ${sample[0]?.['Domain']}`);
  console.log(`    Industry: ${sample[0]?.['Industry']}`);
  console.log(`    Employees: ${sample[0]?.['Employee Headcount']}`);
  console.log(`    Country: ${sample[0]?.['Country']}`);
}

async function validateGmaps(filePath: string) {
  console.log(`\n--- Validating Google Maps file: ${filePath} ---`);
  const categories = new Map<string, number>();
  let total = 0;
  let noTitle = 0;
  let noLink = 0;
  let noCategory = 0;
  let sample: Record<string, string>[] = [];

  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, relax_column_count: true, relax_quotes: true, trim: true }),
  );

  for await (const row of parser) {
    total++;
    if (!row['title']?.trim()) noTitle++;
    if (!row['link']?.trim()) noLink++;
    const rawCats = row['category_titles'] || '';
    if (!rawCats.trim() || rawCats === '[]') noCategory++;

    // Extract primary category
    const match = rawCats.match(/'([^']+)'/);
    const primary = match ? match[1] : null;
    const cat = categoriseIndustry(primary);
    categories.set(cat, (categories.get(cat) ?? 0) + 1);
    if (sample.length < 3) sample.push(row);
    if (total >= 100_000) break;
  }

  console.log(`  Total rows sampled: ${total.toLocaleString()}`);
  console.log(`  Missing title: ${noTitle} | Missing link: ${noLink} | Missing category: ${noCategory}`);
  console.log(`\n  Category distribution (sampled):`);
  const sorted = [...categories.entries()].sort((a, b) => b[1] - a[1]);
  for (const [cat, count] of sorted) {
    console.log(`    ${cat}: ${count.toLocaleString()} (${((count / total) * 100).toFixed(1)}%)`);
  }
  console.log(`\n  Sample record:`);
  console.log(`    Title: ${sample[0]?.['title']}`);
  console.log(`    Link: ${sample[0]?.['link']}`);
  console.log(`    Categories: ${sample[0]?.['category_titles']}`);
  console.log(`    Zip: ${sample[0]?.['zip_code']}`);
}

async function main() {
  const dataDir = process.argv[2] || './data';
  console.log('=== Data Validation ===');
  console.log(`Data directory: ${dataDir}`);

  // SaaS
  const saasDir = join(dataDir, 'saas');
  try {
    const files = (await readdir(saasDir)).filter(f => f.endsWith('.csv'));
    for (const f of files) await validateSaas(join(saasDir, f));
  } catch {
    console.log('No SaaS directory found.');
  }

  // Google Maps (just part 1 for speed)
  const gmapsDir = join(dataDir, 'gmaps');
  try {
    const files = (await readdir(gmapsDir)).filter(f => f.endsWith('.csv')).slice(0, 1);
    for (const f of files) await validateGmaps(join(gmapsDir, f));
  } catch {
    console.log('No Google Maps directory found.');
  }

  // File sizes
  console.log('\n=== File Sizes ===');
  try {
    const saasFiles = await readdir(saasDir);
    for (const f of saasFiles) {
      const s = await stat(join(saasDir, f));
      console.log(`  saas/${f}: ${(s.size / 1024 / 1024).toFixed(1)} MB`);
    }
  } catch { /* skip */ }
  try {
    const gmapsFiles = (await readdir(gmapsDir)).sort();
    for (const f of gmapsFiles) {
      const s = await stat(join(gmapsDir, f));
      console.log(`  gmaps/${f}: ${(s.size / 1024 / 1024).toFixed(1)} MB`);
    }
  } catch { /* skip */ }
}

main();
