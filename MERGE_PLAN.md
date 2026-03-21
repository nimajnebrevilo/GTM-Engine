# GTM-Engine: Merge & Modernisation Plan

## Executive Summary

The modernised branch (`the-sandpit/claude/tam-company-enrichment-KKKQe`) **supersedes** the current main branch entirely. It contains 50 TypeScript files (~7,300 lines) + 822 lines of SQL — a complete B2B prospecting pipeline proven against Supabase with 13M+ company records.

**Main branch** has a simple CRUD skeleton (10 files, ~700 lines) with basic types and operations. The modernised branch replaces and extends every module with production-grade implementations.

**Merge strategy: Full replacement** — the modernised code becomes the new main, with the Series A seed data from `find-series-a-companies` adapted to fit the new schema.

---

## Branch Comparison

| Dimension | Main (current) | Modernised (tam-enrichment) |
|---|---|---|
| **TypeScript files** | 10 | 50 |
| **Lines of code** | ~700 | ~7,300 |
| **SQL schema** | 5 tables, 154 lines | 11 tables, 822 lines |
| **Provider integrations** | None (config only) | Apollo, Exa, Prospeo, MillionVerifier, Freckle |
| **Database queries** | Basic CRUD (4 modules) | Advanced queries (7 modules) + dedup + FTS |
| **Enrichment** | None | 5-step waterfall with cache + cost tracking |
| **ICP scoring** | None | Full challenge engine + alignment scoring |
| **TAM building** | None | Multi-factor scoring, tier segmentation, export |
| **Data sources** | None | 80+ free sources, 16 strategies, bulk CSV/PG loading |
| **Dedup** | None | 3-pass matching (reg#, domain, fuzzy name) |
| **Utils** | None | Retry, resilience, rate limiter, domain normalizer, Pino logger |
| **Config** | .env.example only | Zod-validated env vars + provider config |
| **Package name** | "the-sandpit" v0.1.0 | "gtm-engine" v0.2.0 |

---

## Architecture: Modernised Codebase

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GTM ENGINE PIPELINE                            │
│                                                                     │
│  1. ICP CHALLENGE          Conversational analysis. Score ICP       │
│     src/icp/               alignment via website + client base.     │
│          │                                                          │
│  2. COMPANY DISCOVERY      Exa semantic + Apollo structured         │
│     src/providers/         + 80 free sources + bulk CSV import      │
│     src/sources/           + WebSearch gap-fill strategies          │
│          │                                                          │
│  3. DEDUP & MERGE          3-pass: reg#, domain, fuzzy name         │
│     src/dedup/             Completeness scoring. Primary pick.      │
│          │                                                          │
│  4. ROLE DEFINITION        Apollo people search per company         │
│     src/providers/apollo/  Store in search_role_filters.            │
│          │                                                          │
│  5. ENRICHMENT WATERFALL   Cache-first. Inline MV validation.       │
│     src/services/          Apollo → MV → Prospeo → MV → Freckle    │
│     src/enrichment/        → bulk MV sweep before export.           │
│          │                                                          │
│  6. TAM BUILD              Score ICP fit (geo, industry, size,      │
│     src/tam/               keywords). Tier 1/2/3. Segment.         │
│          │                                                          │
│  7. EXPORT                 34-field CSV/JSON. Campaign metadata.    │
│     src/tam/export.ts      Filter by tier, phone, trigger.         │
│                                                                     │
│  ── PARALLEL ─── Signal/Trigger Detection (Exa) ─── src/providers/ │
│                  Funding, hiring, exec changes, product launches    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Supabase (PG)    │
                    │  11 tables        │
                    │  6 enums          │
                    │  9 triggers       │
                    │  15+ indexes      │
                    │  FTS on companies │
                    │  + contacts       │
                    └───────────────────┘
```

### Module Map

```
src/
  config/
    env.ts                    # Zod-validated environment variables
    providers.ts              # Waterfall order, cost caps, rate limits

  db/
    client.ts                 # Supabase client singleton
    query.ts                  # CLI SQL runner
    queries/
      companies.ts            # Upsert with 3-way dedup, batch ops, FTS
      contacts.ts             # CRUD, search by seniority/department, batch
      campaigns.ts            # Client/campaign CRUD, suppressions, overlaps
      signals.ts              # Signal CRUD, strength queries
      tam.ts                  # TAM queries
      searches.ts             # Search tracking (NEW — enrichment workflow)
      enrichment-cache.ts     # Cache read/write with TTL (NEW — cost control)

  providers/
    types.ts                  # Provider-agnostic interfaces
    apollo/
      client.ts               # Apollo REST API wrapper
      company-search.ts       # Structured company search
      people-search.ts        # People search by company + role
      enrichment.ts           # Email + phone reveal
    exa/
      client.ts               # Exa SDK wrapper
      search.ts               # NL → company results
      triggers.ts             # Signal/trigger detection
    prospeo/
      client.ts               # Prospeo API wrapper
      email-finder.ts         # Find email by domain + name
      verify.ts               # Email verification
    million-verifier/
      client.ts               # MV API wrapper
      validate.ts             # Single + bulk email validation
    freckle/
      client.ts               # Freckle API wrapper
      enrichment.ts           # Waterfall enrichment fallback

  services/
    search.ts                 # Orchestrates Exa + Apollo search + dedup
    enrichment.ts             # 5-step waterfall orchestrator (core engine)
    cost-tracker.ts           # Running credit tally + cap enforcement

  sources/
    catalog.ts                # 80+ free data sources, 16 strategies
    run-strategy.ts           # Strategy executor
    bulk-csv-loader.ts        # Streaming CSV → Supabase (500/batch)
    pg-bulk-loader.ts         # Direct PG INSERT (2000/batch)
    download-lists.ts         # Seed data downloader
    validate-data.ts          # CSV quality analysis
    setup-and-load.ts         # Entry point for bulk loads
    types.ts                  # Source type definitions

  dedup/
    normalizer.ts             # Name/country/domain/address normalization
    matcher.ts                # 3-pass matching + merge

  enrichment/
    website-analyzer.ts       # HTML parsing, tech stack detection (40+ patterns)
    run.ts                    # Batch enrichment runner (uses waterfall)

  icp/
    types.ts                  # Full ICP type system
    challenge.ts              # Alignment scoring, refinement engine

  tam/
    builder.ts                # Multi-factor ICP fit scoring, segmentation
    export.ts                 # 34-field CSV/JSON export

  utils/
    retry.ts                  # Exponential backoff with jitter
    resilience.ts             # 7-method anti-bot fallback cascade
    rate-limiter.ts           # Token bucket (all providers profiled)
    domain.ts                 # URL → normalised domain
    logger.ts                 # Pino structured logging
```

---

## Database Schema Comparison

### Main branch (current — `001_initial_schema.sql`)

5 tables: `organizations`, `contacts`, `campaigns`, `campaign_contacts`, `enrichment_log`

### Modernised branch (`00001_prospecting_schema.sql`)

11 tables with richer schemas:

| # | Table | Replaces | Key Improvements |
|---|---|---|---|
| 1 | `companies` (62 cols) | `organizations` | FTS, dedup clustering, enrichment tracking, usage counting, validation status, confidence scoring |
| 2 | `contacts` (15+ cols) | `contacts` | Seniority/department fields, FTS, phone_status, richer status enum |
| 3 | `clients` | *new* | Multi-tenant agency support |
| 4 | `client_suppressions` | *new* | Per-client "do not contact" with reason codes |
| 5 | `campaigns` (15 cols) | `campaigns` | ICP filters as arrays, client-linked, richer status machine |
| 6 | `campaign_companies` | *new* | ICP fit score, segment, outcome tracking at company level |
| 7 | `campaign_contacts` (12 cols) | `campaign_contacts` | Sequence tracking, clicked_at/converted_at timestamps |
| 8 | `signals` (13 cols) | *new* | 19 signal types, strength scoring, expiry |
| 9 | `enrichment_log` (9 cols) | `enrichment_log` | fields_updated tracking, richer source enum |
| 10 | `data_imports` | *new* | Bulk load tracking with error counts |
| 11 | `exports` | *new* | Export audit trail |

**Plus 4 new tables** needed for the enrichment workflow (from ARCHITECTURE.md):

| # | Table | Purpose |
|---|---|---|
| 12 | `searches` | Tracks each prospecting query |
| 13 | `search_companies` | Junction: search ↔ company with relevance scoring |
| 14 | `search_role_filters` | Role definitions per search |
| 15 | `enrichment_cache` | Raw provider responses with TTL (cost control engine) |

### Triggers (modernised)

1. `update_updated_at()` — auto timestamps on companies, contacts, clients, campaigns
2. `increment_company_usage()` — bump `times_used` when company added to campaign
3. `auto_suppress_on_outreach_status()` — auto-suppress contact on bounce/unsubscribe
4. `sync_contact_status_from_outreach()` — cascade outreach status to contact status

---

## Enrichment Waterfall (Economic Engine)

```
For each contact:

1. CACHE CHECK (enrichment_cache + contacts table)
   └─ If fresh hit with needed fields → DONE (zero cost)

2. APOLLO ENRICHMENT
   └─ Reveal email + phone → MillionVerifier validate
   └─ If both found + MV pass → DONE

3. PROSPEO
   └─ Email by domain + name → Prospeo verify → MV validate
   └─ Fill gaps Apollo missed

4. FRECKLE FALLBACK
   └─ Waterfall across 40+ underlying providers

5. MILLION VERIFIER BULK SWEEP (pre-export)
   └─ Re-validate ALL emails before delivery
```

**Cost controls:**
- `enrichment_cache` with TTL — never pay twice for the same lookup
- `cost_tracker` — running credit tally per provider with monthly caps
- Waterfall stops at the earliest step that fills needed fields
- MV inline validation prevents paying downstream on dead emails

---

## Merge Execution Plan

### Phase 0: Branch Setup (this PR)
- [x] Explore and document both codebases
- [x] Write this merge plan
- [ ] **Approval checkpoint** — review plan before proceeding

### Phase 1: Replace Main with Modernised Code
**Strategy: Clean replacement, not merge**

The modernised branch is a complete superset. Rather than trying to merge file-by-file, we:

1. **Create a migration branch** from main
2. **Remove** old `src/` directory and `supabase/migrations/001_initial_schema.sql`
3. **Copy in** all files from the modernised branch
4. **Adapt** the Series A seed data (`src/data/series-a-companies.ts`) to use the new `companies` table schema (the modernised branch uses `companies` not `organizations`, with 62 columns vs 10)
5. **Verify** TypeScript compiles, ESLint passes, tests pass

**Files superseded (old → new):**

| Old (main) | New (modernised) | Notes |
|---|---|---|
| `src/db/types.ts` | Inline types in query modules | Modernised uses direct Supabase types |
| `src/db/organizations.ts` | `src/db/queries/companies.ts` | `organizations` renamed to `companies`, 3-way dedup upsert |
| `src/db/contacts.ts` | `src/db/queries/contacts.ts` | Richer schema, seniority/department |
| `src/db/campaigns.ts` | `src/db/queries/campaigns.ts` | Client-linked, suppressions, overlaps |
| `src/db/enrichment.ts` | `src/db/queries/enrichment-cache.ts` + `enrichment_log` | Cache-first + audit trail |
| `src/db/client.ts` | `src/db/client.ts` | Same singleton pattern, enhanced |
| `src/db/index.ts` | `src/db/query.ts` | CLI runner replaces barrel export |
| `src/greet.ts` | *deleted* | Placeholder, not needed |
| `src/index.ts` | *deleted* | Placeholder, not needed |
| `src/index.test.ts` | *deleted* | Placeholder tests |
| `src/db/client.test.ts` | *keep for now* | Client init tests still valid |
| `src/db/types.test.ts` | *deleted* | Types restructured |

**New modules (no equivalent on main):**
- `src/config/*` — Zod env validation
- `src/providers/*` — 5 API integrations (12 files)
- `src/services/*` — Search, enrichment, cost tracking
- `src/sources/*` — 80+ free sources, bulk loaders (8 files)
- `src/dedup/*` — 3-pass matching
- `src/enrichment/*` — Website analyzer, batch runner
- `src/icp/*` — ICP challenge engine
- `src/tam/*` — TAM builder + export
- `src/utils/*` — Retry, resilience, rate limiter, domain, logger

### Phase 2: Adapt Series A Seed Data
The `find-series-a-companies` branch has 20 curated Series A companies. Adapt the seed script to use the new `companies` schema:

```typescript
// Old: OrganizationInsert (10 fields)
{ name, domain, industry, employee_count, raw_data }

// New: CompanyInsert (62 fields)
{ name, name_normalized, domain, industry, employee_count,
  original_source: 'web_research', raw_data: { funding_stage, amount_raised_usd, ... },
  confidence_score: 0.8 }
```

### Phase 3: SQL Migration Strategy (DEFERRED)
> **Note:** SQL updates deferred as Supabase is ingesting large quantities of data.

When ready, the migration path is:

1. **Run `00001_prospecting_schema.sql`** — uses `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ADD COLUMN IF NOT EXISTS` throughout, so it's safe against existing tables
2. **Create `00002_enrichment_cache_and_searches.sql`** — adds the 4 new tables (searches, search_companies, search_role_filters, enrichment_cache) + enum updates
3. **Data migration** — map existing `organizations` records into the new `companies` schema
4. **Verify** — row counts, FK integrity, FTS indexes populated

**Schema changes are additive** (ADD COLUMN IF NOT EXISTS, ADD VALUE IF NOT EXISTS) — no destructive operations.

### Phase 4: Dependency Updates
New dependencies to install:

```json
{
  "dependencies": {
    "@supabase/supabase-js": "^2.99.2",  // already present
    "csv-parse": "^6.2.1",               // NEW
    "csv-stringify": "^6.7.0",           // NEW
    "dotenv": "^17.3.1",                 // NEW
    "exa-js": "^1.10.2",                // NEW
    "p-limit": "^6.2.0",                // NEW
    "pg": "^8.20.0",                     // NEW
    "pino": "^9.14.0",                   // NEW
    "tsx": "^4.21.0",                    // NEW
    "zod": "^3.25.76",                   // NEW
    "@types/pg": "^8.18.0"              // NEW
  },
  "devDependencies": {
    "pino-pretty": "^13.1.3"            // NEW (dev only)
  }
}
```

### Phase 5: Verification Checklist
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run test` passes
- [ ] All 50 TypeScript files present and importable
- [ ] Supabase client connects with env vars
- [ ] Series A seed script adapted and runnable
- [ ] `npm run data:validate` works
- [ ] `npm run enrich` entry point functional
- [ ] `npm run strategy` entry point functional

---

## Environment Variables (Complete)

```bash
# Supabase
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=                    # Direct PG for bulk loads

# Provider API Keys
EXA_API_KEY=
APOLLO_API_KEY=
PROSPEO_API_KEY=
MILLION_VERIFIER_API_KEY=        # was MILLIONVERIFIER_API_KEY
FRECKLE_API_KEY=                 # NEW

# Apollo Endpoints
APOLLO_ORG_SEARCH_URL=https://api.apollo.io/api/v1/mixed_companies/search
APOLLO_CONTACT_SEARCH_URL=https://api.apollo.io/api/v1/mixed_people/api_search
APOLLO_ORG_JOB_POSTINGS_URL=https://api.apollo.io/api/v1/organizations/{organization_id}/job_postings

# Cost Controls
APOLLO_MONTHLY_CREDIT_CAP=10000
PROSPEO_MONTHLY_CREDIT_CAP=5000
FRECKLE_MONTHLY_CREDIT_CAP=3000

# Outreach (retained from main)
HEYREACH_API_KEY=
INSTANTLY_API_KEY=

# Optional
LOG_LEVEL=info
NODE_ENV=development
```

---

## npm Scripts (Modernised)

```json
{
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "data:validate": "tsx src/sources/validate-data.ts ./data",
  "data:load": "tsx src/sources/setup-and-load.ts ./data",
  "data:load:pg": "tsx src/sources/pg-bulk-loader.ts ./data",
  "data:download": "tsx src/sources/download-lists.ts",
  "db:query": "tsx src/db/query.ts",
  "enrich": "tsx src/enrichment/run.ts",
  "strategy": "tsx src/sources/run-strategy.ts"
}
```

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| SQL migration breaks active ingestion | Medium | High | **Deferred** — run during maintenance window |
| Missing env vars cause runtime errors | Low | Medium | Zod validation catches at startup |
| Provider API keys not yet provisioned | Low | Low | Waterfall gracefully skips unavailable providers |
| Package version conflicts | Low | Low | Clean install, lock file regenerated |
| Series A data format mismatch | Low | Low | Simple adapter — map 5 fields → 62 fields with sensible defaults |

---

## Approval Decision

**Recommended approach:** Full replacement merge (Phase 1) with SQL deferred (Phase 3).

This gives you:
- All 50 modernised TypeScript modules on main immediately
- The enrichment waterfall, ICP engine, TAM builder, dedup — all operational
- 80+ free data sources ready to use
- Provider integrations ready to connect
- SQL migration can be scheduled when Supabase ingestion completes

**What I need from you to proceed:**
1. Approval of this plan
2. Confirmation on SQL timing (defer vs. run now)
3. Any modules you want excluded or modified
