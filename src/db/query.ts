/**
 * CLI tool to run SQL queries against the database.
 *
 * Usage:
 *   npx tsx src/db/query.ts "SELECT count(*) FROM companies"
 *   npx tsx src/db/query.ts "SELECT * FROM companies LIMIT 5" --format table
 *   npx tsx src/db/query.ts "SELECT industry, count(*) FROM companies GROUP BY industry ORDER BY count DESC LIMIT 10"
 *
 * Reads DATABASE_URL from .env (falls back to Supabase direct connection).
 */

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

function getConnectionString(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  // Derive from Supabase URL if DATABASE_URL not set
  const supabaseUrl = process.env.SUPABASE_URL;
  if (supabaseUrl) {
    console.error(
      `Warning: DATABASE_URL not set. Set it in .env to your Supabase direct connection string.\n` +
      `  Get it from: Supabase Dashboard → Settings → Database → Connection string (URI)\n` +
      `  It looks like: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres\n`
    );
  }

  throw new Error('DATABASE_URL is required. Set it in .env.');
}

async function main() {
  const sql = process.argv[2];
  if (!sql) {
    console.error('Usage: npx tsx src/db/query.ts "SELECT ..."');
    process.exit(1);
  }

  const format = process.argv.includes('--format')
    ? process.argv[process.argv.indexOf('--format') + 1]
    : 'json';

  const connStr = getConnectionString();
  const pool = new Pool({ connectionString: connStr, max: 1, connectionTimeoutMillis: 10000 });

  try {
    const result = await pool.query(sql);

    if (result.rows.length === 0) {
      console.log('(no rows returned)');
      if (result.command) console.log(`Command: ${result.command}, rows affected: ${result.rowCount}`);
      return;
    }

    if (format === 'table') {
      console.table(result.rows);
    } else {
      console.log(JSON.stringify(result.rows, null, 2));
    }

    console.error(`\n${result.rows.length} row(s)`);
  } catch (err) {
    console.error(`Query error: ${(err as Error).message}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
