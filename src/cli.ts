#!/usr/bin/env npx tsx
/**
 * Unified CLI for GTM Engine — all pipeline stages as JSON-outputting subcommands.
 * Designed to be called from the Python orchestration layer.
 *
 * Usage:
 *   npx tsx src/cli.ts <command> [--json-args '{ ... }']
 *
 * Commands:
 *   client:create          Create a new client
 *   client:list            List all clients
 *   client:get             Get a client by ID
 *   campaign:create        Create a campaign for a client
 *   campaign:list          List campaigns (optionally by client)
 *   campaign:get           Get a campaign by ID
 *   campaign:status        Update campaign status
 *   icp:create             Create an ICP definition
 *   icp:get-active         Get active ICP for a client
 *   icp:list               List ICPs for a client
 *   icp:activate           Activate an ICP
 *   icp:refine             Refine an ICP (create new version)
 *   icp:update             Update an ICP definition
 *   icp:challenge          Challenge an ICP against website + client base
 *   search                 Run company discovery (Exa + Apollo)
 *   signals                Detect trigger events for a company
 *   tam:build              Build TAM summary from ICP
 *   people:search          Search for people at a company
 *   enrich                 Enrich a single contact
 *   enrich:bulk-verify     Bulk verify emails
 *   export                 Export campaign data
 *   cost:summary           Get cost tracker summary
 *   db:query               Run a raw SQL query
 *   status                 Show engine status (providers, DB)
 */

import 'dotenv/config';

// ---------------------------------------------------------------------------
// Imports (lazy — only loaded when needed)
// ---------------------------------------------------------------------------

const command = process.argv[2];
const jsonArgsRaw = process.argv.indexOf('--json-args');
const jsonArgs = jsonArgsRaw !== -1 ? JSON.parse(process.argv[jsonArgsRaw + 1]) : {};

// Also support positional args for simple cases
const positionalArgs = process.argv.slice(3).filter(a => a !== '--json-args' && (jsonArgsRaw === -1 || process.argv.indexOf(a) < jsonArgsRaw));

function output(data: unknown): void {
  console.log(JSON.stringify(data, null, 2));
}

function fail(message: string, code = 1): never {
  console.error(JSON.stringify({ error: message }));
  process.exit(code);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    output({
      commands: [
        'client:create', 'client:list', 'client:get',
        'campaign:create', 'campaign:list', 'campaign:get', 'campaign:status',
        'icp:create', 'icp:get-active', 'icp:list', 'icp:activate', 'icp:refine', 'icp:update', 'icp:challenge',
        'search', 'signals', 'tam:build', 'people:search',
        'enrich', 'enrich:bulk-verify', 'export',
        'cost:summary', 'db:query', 'status',
      ],
      usage: 'npx tsx src/cli.ts <command> --json-args \'{ ... }\'',
    });
    return;
  }

  try {
    switch (command) {
      // ── Clients ─────────────────────────────────────────────────────────
      case 'client:create': {
        const { createClient } = await import('./db/queries/campaigns.js');
        const client = await createClient(jsonArgs);
        output(client);
        break;
      }
      case 'client:list': {
        const { listClients } = await import('./db/queries/campaigns.js');
        output(await listClients());
        break;
      }
      case 'client:get': {
        const { getClient } = await import('./db/queries/campaigns.js');
        output(await getClient(jsonArgs.id ?? positionalArgs[0]));
        break;
      }

      // ── Campaigns ───────────────────────────────────────────────────────
      case 'campaign:create': {
        const { createCampaign } = await import('./db/queries/campaigns.js');
        output(await createCampaign(jsonArgs));
        break;
      }
      case 'campaign:list': {
        const { listCampaigns } = await import('./db/queries/campaigns.js');
        output(await listCampaigns(jsonArgs.clientId));
        break;
      }
      case 'campaign:get': {
        const { getCampaign } = await import('./db/queries/campaigns.js');
        output(await getCampaign(jsonArgs.id ?? positionalArgs[0]));
        break;
      }
      case 'campaign:status': {
        const { updateCampaignStatus } = await import('./db/queries/campaigns.js');
        await updateCampaignStatus(jsonArgs.id, jsonArgs.status);
        output({ ok: true, id: jsonArgs.id, status: jsonArgs.status });
        break;
      }

      // ── ICP Definitions ─────────────────────────────────────────────────
      case 'icp:create': {
        const { createICPDefinition } = await import('./db/queries/icp-definitions.js');
        output(await createICPDefinition(jsonArgs));
        break;
      }
      case 'icp:get-active': {
        const { getActiveICP } = await import('./db/queries/icp-definitions.js');
        const icp = await getActiveICP(jsonArgs.clientId ?? positionalArgs[0]);
        output(icp ?? { found: false });
        break;
      }
      case 'icp:list': {
        const { listClientICPs } = await import('./db/queries/icp-definitions.js');
        output(await listClientICPs(jsonArgs.clientId ?? positionalArgs[0]));
        break;
      }
      case 'icp:activate': {
        const { activateICP } = await import('./db/queries/icp-definitions.js');
        output(await activateICP(jsonArgs.id ?? positionalArgs[0]));
        break;
      }
      case 'icp:refine': {
        const { refineICP } = await import('./db/queries/icp-definitions.js');
        const { parentId, ...overrides } = jsonArgs;
        output(await refineICP(parentId, overrides));
        break;
      }
      case 'icp:update': {
        const { updateICPDefinition } = await import('./db/queries/icp-definitions.js');
        const { id, ...updates } = jsonArgs;
        output(await updateICPDefinition(id, updates));
        break;
      }
      case 'icp:challenge': {
        const { challengeICP } = await import('./icp/challenge-orchestrator.js');
        output(await challengeICP(jsonArgs));
        break;
      }

      // ── Search (Company Discovery) ─────────────────────────────────────
      case 'search': {
        const { orchestrateSearch } = await import('./services/search.js');
        output(await orchestrateSearch(jsonArgs));
        break;
      }

      // ── Signals (Trigger Detection) ────────────────────────────────────
      case 'signals': {
        const { detectTriggers } = await import('./providers/exa/triggers.js');
        const domain = jsonArgs.domain ?? positionalArgs[0];
        const options = {
          triggerTypes: jsonArgs.triggerTypes,
          numResults: jsonArgs.numResults,
          lookbackDays: jsonArgs.lookbackDays,
        };
        output(await detectTriggers(domain, options));
        break;
      }

      // ── TAM Build ──────────────────────────────────────────────────────
      case 'tam:build': {
        const { buildTAM } = await import('./tam/builder.js');
        output(await buildTAM(jsonArgs));
        break;
      }

      // ── People Search ──────────────────────────────────────────────────
      case 'people:search': {
        const { searchPeople } = await import('./providers/apollo/people-search.js');
        output(await searchPeople(jsonArgs));
        break;
      }

      // ── Enrichment ─────────────────────────────────────────────────────
      case 'enrich': {
        const { enrichContact } = await import('./services/enrichment.js');
        output(await enrichContact(jsonArgs));
        break;
      }
      case 'enrich:bulk-verify': {
        const { bulkVerifyEmails } = await import('./services/enrichment.js');
        output(await bulkVerifyEmails(jsonArgs.emails ?? []));
        break;
      }

      // ── Export ──────────────────────────────────────────────────────────
      case 'export': {
        const { getExportData, toCSV, toJSON } = await import('./tam/export.js');
        const campaignId = jsonArgs.campaignId ?? positionalArgs[0];
        const format = jsonArgs.format ?? 'json';
        const rows = await getExportData(campaignId);

        if (format === 'csv') {
          // CSV goes to stdout raw (not JSON-wrapped)
          console.log(toCSV(rows));
        } else {
          output(JSON.parse(toJSON(rows)));
        }
        break;
      }

      // ── Cost Summary ───────────────────────────────────────────────────
      case 'cost:summary': {
        const { getCostTracker } = await import('./services/cost-tracker.js');
        output(getCostTracker().getSummary());
        break;
      }

      // ── Raw DB Query ───────────────────────────────────────────────────
      case 'db:query': {
        const sql = jsonArgs.sql ?? positionalArgs[0];
        if (!sql) fail('Missing sql argument');
        const { getSupabaseClient } = await import('./db/client.js');
        const db = getSupabaseClient();
        const { data, error } = await db.rpc('exec_sql', { query: sql });
        if (error) fail(error.message);
        output(data);
        break;
      }

      // ── Status ─────────────────────────────────────────────────────────
      case 'status': {
        const { isProviderConfigured } = await import('./config/env.js');
        output({
          providers: {
            exa: isProviderConfigured('exa'),
            apollo: isProviderConfigured('apollo'),
            prospeo: isProviderConfigured('prospeo'),
            million_verifier: isProviderConfigured('million_verifier'),
            freckle: isProviderConfigured('freckle'),
          },
          node: process.version,
          cwd: process.cwd(),
        });
        break;
      }

      default:
        fail(`Unknown command: ${command}. Run with --help for available commands.`);
    }
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
}

main();
