# GTM-Engine: Merge & Modernisation Plan

## Executive Summary

The modernised branch (`the-sandpit/claude/tam-company-enrichment-KKKQe`) **supersedes** the current main branch entirely. It contains 50 TypeScript files (~7,300 lines) + 822 lines of SQL — a complete B2B prospecting pipeline proven against Supabase with 13M+ company records.

**Main branch** has a simple CRUD skeleton (10 files, ~700 lines) with basic types and operations. The modernised branch replaces and extends every module with production-grade implementations.

**Merge strategy: Full replacement** — the modernised code becomes the new main, with the Series A seed data from `find-series-a-companies` adapted to fit the new schema.

---

## Core Data Philosophy: Supabase-First

**Supabase is the growing data asset.** Every interaction enriches it.

The pipeline follows a strict **local-first** pattern:

1. **Always check Supabase first** — before any external API call, query the local database
2. **Only research what's missing** — external providers fill gaps, not replace local data
3. **Write back everything** — any new data from external sources is upserted into Supabase
4. **Data compounds over time** — each campaign enriches the shared company/contact pool for future campaigns

```
  Request for data
        │
        ▼
  ┌─────────────┐    HIT     ┌──────────────┐
  │  Supabase   │ ─────────→ │  Return data  │
  │  (check DB) │            └──────────────┘
  └──────┬──────┘
         │ MISS or INCOMPLETE
         ▼
  ┌─────────────┐            ┌──────────────┐
  │  External   │ ─────────→ │  Upsert into │
  │  Providers  │   results  │  Supabase    │
  └─────────────┘            └──────┬───────┘
                                    │
                                    ▼
                             ┌──────────────┐
                             │  Return data  │
                             └──────────────┘
```

This means:
- **Campaign 1** pays to enrich a company. **Campaign 2** gets it free from cache.
- Bulk CSV imports, web scrapes, and free sources grow the pool at zero API cost.
- The `enrichment_cache` table with TTL prevents stale data while avoiding duplicate spend.
- Provider credits are only consumed when Supabase genuinely doesn't have what we need.

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

## Architecture: Revised Pipeline

The pipeline follows a **funnel** — broad to narrow — spending money only on accounts that have already passed filters.

```
┌─────────────────────────────────────────────────────────────────────┐
│                      GTM ENGINE PIPELINE                            │
│                                                                     │
│  1. TAM BUILD              Build broad universe of companies.       │
│     src/tam/               Supabase-first: query local DB, then    │
│     src/sources/           discover via Exa + Apollo + 80 free     │
│     src/providers/         sources. Dedup & merge. All results     │
│                            written back to Supabase.               │
│          │                                                          │
│  2. SIGNALS & TRIGGERS     Layer buying intent on TAM.              │
│     src/providers/exa/     Funding, hiring, exec changes, product  │
│     src/db/queries/        launches, expansion. Score strength.     │
│     signals.ts             Narrows TAM to actionable accounts.     │
│          │                                                          │
│  3. ICP SCORING            Score accounts against client's ICP.     │
│     src/icp/               ICPs stored in DB as first-class        │
│     src/tam/builder.ts     entities. Multi-factor scoring: geo,    │
│                            industry, size, keywords, signals.      │
│                            Tier 1/2/3 segmentation.                │
│          │                                                          │
│  4. PEOPLE SEARCH          Find contacts at high-scoring accounts.  │
│     src/providers/apollo/  Supabase-first: check existing contacts │
│     src/db/queries/        before Apollo people search. Role       │
│     contacts.ts            filters (titles, seniorities, depts).   │
│          │                                                          │
│  5. ENRICH & VALIDATE      Spend credits only on qualified leads.   │
│     src/services/          Cache → Apollo → MV → Prospeo → MV →   │
│     enrichment.ts          Freckle → bulk MV sweep. All results    │
│     src/enrichment/        written back to Supabase for reuse.     │
│          │                                                          │
│  6. EXPORT                 34-field CSV/JSON. Campaign metadata.    │
│     src/tam/export.ts      Filter by tier, signal, phone, email.   │
│                            Suppression & overlap checks.           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │  Supabase (PG)    │
                    │  12+ tables       │
                    │  6 enums          │
                    │  9 triggers       │
                    │  15+ indexes      │
                    │  FTS on companies │
                    │  + contacts       │
                    └───────────────────┘
```

### Why This Order Matters

| Old Order (code as-is) | New Order (revised) | Savings |
|---|---|---|
| ICP Challenge first → discover companies → enrich all → then score TAM | TAM first → signals filter → ICP score → only then find people → enrich qualified | Credits spent only on accounts that passed 2 filters |
| Enrichment happens before scoring | Enrichment happens after scoring | ~60-80% fewer enrichment credits |
| TAM built from enriched data | TAM built from discovery data, enrichment is final step | Faster time-to-TAM |

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
      icp-definitions.ts      # ICP CRUD, versioning, lead scoring queries (NEW)
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

**Plus 5 new tables** needed for the enrichment workflow and ICP scoring:

| # | Table | Purpose |
|---|---|---|
| 12 | `icp_definitions` | **First-class ICP entity** — stored per client, versioned, used for lead scoring |
| 13 | `searches` | Tracks each prospecting query |
| 14 | `search_companies` | Junction: search ↔ company with relevance scoring |
| 15 | `search_role_filters` | Role definitions per search |
| 16 | `enrichment_cache` | Raw provider responses with TTL (cost control engine) |

### ICP Definitions Table (NEW — first-class entity)

```sql
CREATE TABLE IF NOT EXISTS icp_definitions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id),
  name          TEXT NOT NULL,                    -- e.g. "Series A SaaS — Q1 2026"
  version       INT NOT NULL DEFAULT 1,           -- increment on refinement
  parent_id     UUID REFERENCES icp_definitions(id), -- previous version
  status        TEXT NOT NULL DEFAULT 'draft',    -- draft | active | archived

  -- Firmographic filters
  company_size_min    INT,
  company_size_max    INT,
  revenue_min_usd     BIGINT,
  revenue_max_usd     BIGINT,
  geographies         TEXT[] NOT NULL DEFAULT '{}',
  industries          TEXT[] NOT NULL DEFAULT '{}',
  company_types       TEXT[] DEFAULT '{}',

  -- Keyword matching
  keywords            TEXT[] NOT NULL DEFAULT '{}',
  exclusion_keywords  TEXT[] DEFAULT '{}',
  technology_signals  TEXT[] DEFAULT '{}',

  -- Scoring weights (overridable per ICP)
  weight_geography    NUMERIC(3,1) DEFAULT 3.0,
  weight_industry     NUMERIC(3,1) DEFAULT 3.0,
  weight_size         NUMERIC(3,1) DEFAULT 2.0,
  weight_keywords     NUMERIC(3,1) DEFAULT 2.0,
  weight_signals      NUMERIC(3,1) DEFAULT 2.0,
  weight_website      NUMERIC(3,1) DEFAULT 1.0,
  exclusion_penalty   NUMERIC(3,1) DEFAULT -2.0,

  -- Challenge/refinement metadata
  website_analysis    JSONB,          -- cached analysis of client's own site
  client_base_analysis JSONB,         -- patterns observed from client's customers
  refinements         JSONB,          -- array of ICPRefinement objects
  challenge_summary   TEXT,

  -- Role targeting (who to find at matching companies)
  target_titles       TEXT[] DEFAULT '{}',   -- e.g. ['VP Sales', 'CRO']
  target_seniorities  TEXT[] DEFAULT '{}',   -- e.g. ['vp', 'c_suite', 'director']
  target_departments  TEXT[] DEFAULT '{}',   -- e.g. ['sales', 'marketing']

  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Each campaign links to an ICP definition for scoring
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS icp_definition_id UUID REFERENCES icp_definitions(id);
```

**Why ICP in the database matters:**
- **Reuse**: Same ICP across multiple campaigns for one client
- **Versioning**: Refine ICP over time, compare results between versions
- **Lead scoring in SQL**: `WHERE employee_count BETWEEN icp.size_min AND icp.size_max`
- **Stored weights**: Different clients can have different scoring priorities
- **Role targeting built in**: Titles/seniorities/departments live with the ICP, not as separate config
- **Audit trail**: `parent_id` chains show how the ICP evolved through challenge iterations

### Triggers (modernised)

1. `update_updated_at()` — auto timestamps on companies, contacts, clients, campaigns
2. `increment_company_usage()` — bump `times_used` when company added to campaign
3. `auto_suppress_on_outreach_status()` — auto-suppress contact on bounce/unsubscribe
4. `sync_contact_status_from_outreach()` — cascade outreach status to contact status

---

## Revised Pipeline Detail

### Stage 1: TAM Build (Broad Universe)

```
Supabase-first: Query local companies table for matches
        │
        ├─ HIT → Use existing data (zero cost)
        │
        └─ GAPS → Discover via external sources:
                  ├─ Exa semantic search (NL query)
                  ├─ Apollo structured search (industry, size, geo)
                  ├─ 80+ free sources (Wikidata, gov registries, CSV imports)
                  └─ All results → dedup → upsert back to Supabase
```

Every company discovered is written to Supabase. Future campaigns benefit automatically.

### Stage 2: Signals & Triggers (Narrow the TAM)

```
For each company in TAM:
  1. Check signals table for existing fresh signals
  2. If no fresh signals → Exa trigger detection:
     - funding_round, new_hire, leadership_change
     - expansion, product_launch, acquisition, news_mention
  3. Score signal strength (0-1), set expiry
  4. Write signals back to Supabase
  5. Filter TAM to accounts with active signals → "Signal TAM"
```

Signals reduce a TAM of thousands to hundreds of timely accounts.

### Stage 3: ICP Scoring (Rank Accounts)

```
Load client's ICP definition from icp_definitions table
        │
For each company in Signal TAM:
  ├─ Geography match    (weight from ICP, default 3.0)
  ├─ Industry match     (weight from ICP, default 3.0)
  ├─ Size match         (weight from ICP, default 2.0)
  ├─ Keyword match      (weight from ICP, default 2.0)
  ├─ Signal strength    (weight from ICP, default 2.0)  ← NEW: signals feed scoring
  ├─ Website bonus      (weight from ICP, default 1.0)
  └─ Exclusion penalty  (from ICP, default -2.0)
        │
Segment: Tier 1 (≥0.8) │ Tier 2 (0.5-0.79) │ Tier 3 (<0.5)
        │
Upsert campaign_companies with icp_fit_score + segment
```

**ICP stored in DB** means scoring weights are per-client, versionable, and queryable.

### Stage 4: People Search (Qualified Accounts Only)

```
For Tier 1 + Tier 2 accounts:
  1. Check Supabase contacts table first
     └─ If existing contacts match role filter → use them (zero cost)
  2. For gaps → Apollo people search by company + role filter
     - Titles, seniorities, departments from ICP definition
  3. All new contacts → upsert to Supabase contacts table
```

Credits spent only on companies that scored well. Tier 3 accounts are not enriched.

### Stage 5: Enrich & Validate (Qualified Contacts Only)

```
For each contact at Tier 1/2 companies:

1. SUPABASE CACHE CHECK (enrichment_cache + contacts table)
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

All enrichment results → write back to Supabase (enrichment_cache + contacts)
```

### Stage 6: Export

34-field CSV/JSON with campaign metadata, ICP scores, signal data, contact info.
Filter by tier, signal type, has_phone, has_email. Suppression & overlap checks.

---

### Cost Impact of Revised Pipeline

| Stage | Cost | What it does |
|---|---|---|
| 1. TAM Build | Low (free sources + cached) | Broad discovery, Supabase-first |
| 2. Signals | Low (Exa search credits) | Filters thousands → hundreds |
| 3. ICP Scoring | Zero (local computation) | Filters hundreds → top tiers |
| 4. People Search | Medium (Apollo credits) | Only for Tier 1+2 companies |
| 5. Enrichment | Medium (waterfall credits) | Only for qualified contacts |
| 6. Export | Zero | Local generation |

**Net effect:** Enrichment credits spent on ~20-30% of original TAM instead of 100%.

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
