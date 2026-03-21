/**
 * Enrichment pipeline runner.
 * Invoked as: npx tsx src/enrichment/run.ts --batch-size 20 --concurrency 5
 *
 * Enrichment status and timestamps live on the companies row.
 * Each enrichment attempt is logged to enrichment_log for audit.
 */

import { getSupabaseClient } from '../db/client.js';
import { analyzeWebsite } from './website-analyzer.js';

function parseArgs(): { batchSize: number; concurrency: number } {
  const args = process.argv.slice(2);
  const map = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    map.set(args[i].replace(/^--/, ''), args[i + 1]);
  }
  return {
    batchSize: parseInt(map.get('batch-size') ?? '20', 10),
    concurrency: parseInt(map.get('concurrency') ?? '5', 10),
  };
}

async function enrichCompany(companyId: string, website: string | null): Promise<void> {
  const db = getSupabaseClient();

  await db
    .from('companies')
    .update({ enrichment_status: 'in_progress' })
    .eq('id', companyId);

  try {
    const enrichmentSources: string[] = [];
    const fieldsUpdated: string[] = [];

    // Step 1: Website analysis
    if (website) {
      const analysis = await analyzeWebsite(website);
      const companyUpdates: Record<string, unknown> = {};

      if (analysis.description) {
        companyUpdates.description = analysis.description;
        fieldsUpdated.push('description');
      }
      if (analysis.socialLinks.linkedin) {
        companyUpdates.linkedin_url = analysis.socialLinks.linkedin;
        fieldsUpdated.push('linkedin_url');
      }

      if (Object.keys(companyUpdates).length > 0) {
        await db.from('companies').update(companyUpdates).eq('id', companyId);
        enrichmentSources.push('website');
      }

      // Log the enrichment attempt
      await db.from('enrichment_log').insert({
        source: 'website_scrape',
        entity_type: 'company',
        entity_id: companyId,
        fields_updated: fieldsUpdated,
        success: fieldsUpdated.length > 0,
        response: {
          title: analysis.title,
          techStack: analysis.techStack,
          socialLinks: analysis.socialLinks,
          ogData: analysis.ogData,
        },
      });
    }

    // Update company enrichment status
    await db
      .from('companies')
      .update({
        enrichment_status: enrichmentSources.length > 0 ? 'complete' : 'partial',
        enriched_at: new Date().toISOString(),
        enrichment_sources: enrichmentSources,
      })
      .eq('id', companyId);

  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await db
      .from('companies')
      .update({ enrichment_status: 'failed' })
      .eq('id', companyId);

    await db.from('enrichment_log').insert({
      source: 'website_scrape',
      entity_type: 'company',
      entity_id: companyId,
      fields_updated: [],
      success: false,
      error_message: errorMsg,
    });
  }
}

async function main() {
  const { batchSize, concurrency } = parseArgs();

  const db = getSupabaseClient();
  let offset = 0;
  let totalProcessed = 0;

  while (true) {
    // Fetch batch of companies needing enrichment
    const { data: companies } = await db
      .from('companies')
      .select('id, website')
      .eq('is_primary', true)
      .neq('validation_status', 'do_not_contact')
      .in('enrichment_status', ['pending', 'partial'])
      .range(offset, offset + batchSize - 1);

    if (!companies || companies.length === 0) break;

    // Process with concurrency limit
    for (let i = 0; i < companies.length; i += concurrency) {
      const batch = companies.slice(i, i + concurrency);
      await Promise.all(
        batch.map(company => enrichCompany(company.id, company.website)),
      );
      totalProcessed += batch.length;
      console.log(`Enriched ${totalProcessed} companies...`);
    }

    offset += batchSize;
    if (companies.length < batchSize) break;
  }

  console.log(`Enrichment complete: ${totalProcessed} companies processed`);
}

main().catch(err => {
  console.error('Enrichment runner failed:', err);
  process.exit(1);
});
