/**
 * Shared bulk-import utility.
 *
 * Routes all bulk inserts/upserts for companies, contacts, campaign_companies,
 * and campaign_contacts through the Supabase Edge Function at:
 *   https://dnepejjdqylzkqefnjbt.supabase.co/functions/v1/bulk-import
 *
 * The Edge Function handles dedup, staging, and merge logic server-side.
 * This utility handles chunking (max 2000 records per request) and retries.
 */

export type EntityType = 'company' | 'contact' | 'campaign_company' | 'campaign_contact';

export interface BulkImportRecord {
  entity_type: EntityType;
  [key: string]: unknown;
}

export interface BulkImportOptions {
  /** Source identifier for audit trail. Defaults to 'gtm-engine'. */
  source?: string;
  /** Whether to use the staging table for merge. Defaults to true. */
  useStaging?: boolean;
}

export interface BulkImportResult {
  inserted: number;
  updated: number;
  errors: number;
  details?: unknown;
  /** Batch ID returned by the Edge Function for staging lookups. */
  batch_id?: string;
}

const EDGE_FUNCTION_URL = 'https://dnepejjdqylzkqefnjbt.supabase.co/functions/v1/bulk-import';
const MAX_CHUNK_SIZE = 2000;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 1000;

function getServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY environment variable. ' +
      'Required for bulk-import Edge Function authentication.'
    );
  }
  return key;
}

/**
 * Send a single chunk to the Edge Function.
 */
async function sendChunk(
  records: BulkImportRecord[],
  source: string,
  useStaging: boolean,
): Promise<BulkImportResult> {
  const serviceRoleKey = getServiceRoleKey();

  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * Math.pow(2, attempt - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    try {
      const response = await fetch(EDGE_FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          records,
          source,
          use_staging: useStaging,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Bulk-import Edge Function returned ${response.status}: ${body}`);
      }

      const json = await response.json();
      return json as BulkImportResult;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Only retry on network/5xx errors
      if (err instanceof Error && err.message.includes('returned 4')) {
        throw err; // 4xx = client error, don't retry
      }
    }
  }

  throw lastError ?? new Error('Bulk import failed after retries');
}

/**
 * Bulk import records via the Edge Function.
 *
 * Automatically chunks large payloads into batches of 2000 records.
 * Each record must include an `entity_type` field.
 *
 * @example
 * ```ts
 * await bulkImport(
 *   companies.map(c => ({ entity_type: 'company', ...c })),
 *   { source: 'csv-loader' }
 * );
 * ```
 */
export async function bulkImport(
  records: BulkImportRecord[],
  options: BulkImportOptions = {},
): Promise<BulkImportResult> {
  if (records.length === 0) {
    return { inserted: 0, updated: 0, errors: 0 };
  }

  const source = options.source ?? 'gtm-engine';
  const useStaging = options.useStaging ?? true;

  // Single chunk — no splitting needed
  if (records.length <= MAX_CHUNK_SIZE) {
    return sendChunk(records, source, useStaging);
  }

  // Multiple chunks
  const totals: BulkImportResult = { inserted: 0, updated: 0, errors: 0 };

  for (let i = 0; i < records.length; i += MAX_CHUNK_SIZE) {
    const chunk = records.slice(i, i + MAX_CHUNK_SIZE);
    const result = await sendChunk(chunk, source, useStaging);
    totals.inserted += result.inserted;
    totals.updated += result.updated;
    totals.errors += result.errors;
  }

  return totals;
}

/**
 * Convenience: bulk import companies.
 */
export async function bulkImportCompanies(
  companies: Record<string, unknown>[],
  source = 'gtm-engine',
): Promise<BulkImportResult> {
  return bulkImport(
    companies.map(c => ({ entity_type: 'company' as const, ...c })),
    { source },
  );
}

/**
 * Convenience: bulk import contacts.
 */
export async function bulkImportContacts(
  contacts: Record<string, unknown>[],
  source = 'gtm-engine',
): Promise<BulkImportResult> {
  return bulkImport(
    contacts.map(c => ({ entity_type: 'contact' as const, ...c })),
    { source },
  );
}

/**
 * Convenience: bulk import campaign_companies junction records.
 */
export async function bulkImportCampaignCompanies(
  records: Record<string, unknown>[],
  source = 'gtm-engine',
): Promise<BulkImportResult> {
  return bulkImport(
    records.map(r => ({ entity_type: 'campaign_company' as const, ...r })),
    { source },
  );
}

/**
 * Convenience: bulk import campaign_contacts junction records.
 */
export async function bulkImportCampaignContacts(
  records: Record<string, unknown>[],
  source = 'gtm-engine',
): Promise<BulkImportResult> {
  return bulkImport(
    records.map(r => ({ entity_type: 'campaign_contact' as const, ...r })),
    { source },
  );
}
