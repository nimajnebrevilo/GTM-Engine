/**
 * Setup script: runs the bulk CSV loader and tracks the import.
 * Usage: npx tsx src/sources/setup-and-load.ts [data-dir]
 */

import 'dotenv/config';
import { getSupabaseClient } from '../db/client.js';
import { runBulkLoad } from './bulk-csv-loader.js';

async function main() {
  const dataDir = process.argv[2] || './data';

  console.log('Connecting to Supabase...');
  const db = getSupabaseClient();

  // Verify connection
  const { error: pingError } = await db.from('companies').select('id', { count: 'exact', head: true });
  if (pingError) {
    console.error('Connection failed:', pingError.message);
    console.error('Full error:', JSON.stringify(pingError, null, 2));
    process.exit(1);
  }
  console.log('Connected successfully.\n');

  console.log('Starting bulk load...\n');
  await runBulkLoad(dataDir);

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
