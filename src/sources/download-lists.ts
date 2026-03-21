/**
 * Download company lists from the coldoutboundskills GitHub repo.
 * Downloads and unzips all files into the data/ directory.
 *
 * Usage: npm run data:download
 */

import { execSync } from 'child_process';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const BASE_URL = 'https://github.com/growthenginenowoslawski/coldoutboundskills/raw/main/Common%20Outbound%20Lists';

const FILES = {
  saas: [
    { url: `${BASE_URL}/us-software-saas-companies-cleaned.zip`, name: 'us-software-saas-companies-cleaned.zip' },
  ],
  gmaps: Array.from({ length: 13 }, (_, i) => ({
    url: `${BASE_URL}/Google%20Maps%20Scrape%20-%2012M%20US%20Businesses/google-maps-scrape-part${i + 1}.zip`,
    name: `google-maps-scrape-part${i + 1}.zip`,
  })),
};

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function download(url: string, dest: string) {
  console.log(`  Downloading ${dest}...`);
  execSync(`curl -L -s -o "${dest}" "${url}"`, { stdio: 'inherit' });
}

function unzip(zipPath: string, destDir: string) {
  execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
}

async function main() {
  const dataDir = process.argv[2] || './data';
  const rawDir = join(dataDir, 'raw');
  const saasDir = join(dataDir, 'saas');
  const gmapsDir = join(dataDir, 'gmaps');

  ensureDir(rawDir);
  ensureDir(saasDir);
  ensureDir(gmapsDir);

  console.log('=== Downloading Company Lists ===\n');

  // SaaS
  console.log('SaaS Companies:');
  for (const file of FILES.saas) {
    const zipPath = join(rawDir, file.name);
    download(file.url, zipPath);
    unzip(zipPath, saasDir);
    console.log(`  Unzipped to ${saasDir}/`);
  }

  // Google Maps
  console.log('\nGoogle Maps (12M US Businesses):');
  for (const file of FILES.gmaps) {
    const zipPath = join(rawDir, file.name);
    download(file.url, zipPath);
    unzip(zipPath, gmapsDir);
    console.log(`  Unzipped ${file.name}`);
  }

  console.log('\nDone! Run `npm run data:validate` to verify, then `npm run data:load` to push to Supabase.');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
