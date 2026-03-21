-- ============================================================================
-- MIGRATION 00002: ICP DEFINITIONS, SEARCH INFRASTRUCTURE, ENRICHMENT CACHE
-- ============================================================================
-- Purely additive migration — safe to run against a live DB that already has:
--   tables:  companies, contacts, clients, client_suppressions, campaigns,
--            campaign_companies, campaign_contacts, signals, enrichment_log,
--            data_imports, exports, postal_codes
--   enums:   contact_status, outreach_status, campaign_status,
--            campaign_channel, enrichment_source, signal_type
--   funcs:   update_updated_at()
--
-- This migration ADDS:
--   1. New values to existing enums
--   2. icp_definitions table
--   3. enrichment_cache table
--   4. searches table
--   5. search_companies junction table
--   6. search_role_filters table
--   7. campaigns.icp_definition_id column + FK
--   8. Indexes for all new tables
--   9. updated_at triggers for icp_definitions and searches
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. NEW ENUM VALUES
-- ---------------------------------------------------------------------------
-- ALTER TYPE ... ADD VALUE IF NOT EXISTS is not transactional in Postgres,
-- so each statement must be its own top-level command (no DO $$ block).
-- ---------------------------------------------------------------------------

-- campaign_channel: add phone, multi_channel
ALTER TYPE campaign_channel ADD VALUE IF NOT EXISTS 'phone';
ALTER TYPE campaign_channel ADD VALUE IF NOT EXISTS 'multi_channel';

-- campaign_status: add sourcing, enriching, review, delivered, archived
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'sourcing';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'enriching';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'review';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'delivered';
ALTER TYPE campaign_status ADD VALUE IF NOT EXISTS 'archived';

-- outreach_status: add converted
ALTER TYPE outreach_status ADD VALUE IF NOT EXISTS 'converted';

-- enrichment_source: add freckle, million_verifier, website_scrape, linkedin, manual, other
ALTER TYPE enrichment_source ADD VALUE IF NOT EXISTS 'freckle';
ALTER TYPE enrichment_source ADD VALUE IF NOT EXISTS 'million_verifier';
ALTER TYPE enrichment_source ADD VALUE IF NOT EXISTS 'website_scrape';
ALTER TYPE enrichment_source ADD VALUE IF NOT EXISTS 'linkedin';
ALTER TYPE enrichment_source ADD VALUE IF NOT EXISTS 'manual';
ALTER TYPE enrichment_source ADD VALUE IF NOT EXISTS 'other';


-- ---------------------------------------------------------------------------
-- 2. ICP DEFINITIONS TABLE
-- ---------------------------------------------------------------------------
-- Each client can have multiple ICPs, versioned via a parent_id chain.
-- Status lifecycle: draft -> active -> archived
-- Scoring weights are per-ICP so each profile can tune its own model.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS icp_definitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  version             INT NOT NULL DEFAULT 1,
  parent_id           UUID REFERENCES icp_definitions(id) ON DELETE SET NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'archived')),

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
  weight_geography    NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  weight_industry     NUMERIC(3,1) NOT NULL DEFAULT 3.0,
  weight_size         NUMERIC(3,1) NOT NULL DEFAULT 2.0,
  weight_keywords     NUMERIC(3,1) NOT NULL DEFAULT 2.0,
  weight_signals      NUMERIC(3,1) NOT NULL DEFAULT 2.0,
  weight_website      NUMERIC(3,1) NOT NULL DEFAULT 1.0,
  exclusion_penalty   NUMERIC(3,1) NOT NULL DEFAULT -2.0,

  -- Analysis metadata
  website_analysis    JSONB,
  client_base_analysis JSONB,
  refinements         JSONB,
  challenge_summary   TEXT,

  -- Role targeting
  target_titles       TEXT[] DEFAULT '{}',
  target_seniorities  TEXT[] DEFAULT '{}',
  target_departments  TEXT[] DEFAULT '{}',

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_icp_definitions_client
  ON icp_definitions(client_id);
CREATE INDEX IF NOT EXISTS idx_icp_definitions_status
  ON icp_definitions(status);
CREATE INDEX IF NOT EXISTS idx_icp_definitions_parent
  ON icp_definitions(parent_id) WHERE parent_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 3. ENRICHMENT CACHE TABLE
-- ---------------------------------------------------------------------------
-- Caches raw provider responses to avoid redundant API calls and credits.
-- Rows expire via expires_at; application code should check before re-fetching.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS enrichment_cache (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      TEXT NOT NULL,
  lookup_key    TEXT NOT NULL,
  lookup_type   TEXT NOT NULL DEFAULT 'person',
  response      JSONB NOT NULL DEFAULT '{}',
  credits_used  INT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  UNIQUE (provider, lookup_key, lookup_type)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_cache_provider_key
  ON enrichment_cache(provider, lookup_key);
CREATE INDEX IF NOT EXISTS idx_enrichment_cache_expires
  ON enrichment_cache(expires_at);


-- ---------------------------------------------------------------------------
-- 4. SEARCHES TABLE
-- ---------------------------------------------------------------------------
-- Tracks search queries issued against providers (Apollo, etc.).
-- Linked to a campaign so results can flow into the pipeline.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS searches (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  query         TEXT NOT NULL,
  parsed_filters JSONB DEFAULT '{}',
  provider      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  result_count  INT DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_searches_campaign
  ON searches(campaign_id);
CREATE INDEX IF NOT EXISTS idx_searches_status
  ON searches(status);


-- ---------------------------------------------------------------------------
-- 5. SEARCH_COMPANIES JUNCTION TABLE
-- ---------------------------------------------------------------------------
-- Links search results to companies with a relevance score.
-- confirmed = true means the user accepted this match for the campaign.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS search_companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id       UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  relevance_score REAL,
  confirmed       BOOLEAN NOT NULL DEFAULT false,
  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (search_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_search_companies_search
  ON search_companies(search_id);
CREATE INDEX IF NOT EXISTS idx_search_companies_company
  ON search_companies(company_id);


-- ---------------------------------------------------------------------------
-- 6. SEARCH_ROLE_FILTERS TABLE
-- ---------------------------------------------------------------------------
-- Per-search role targeting filters (titles, seniorities, departments).
-- Kept separate from searches to allow multiple role filter sets per search.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS search_role_filters (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  search_id     UUID NOT NULL REFERENCES searches(id) ON DELETE CASCADE,
  titles        TEXT[] DEFAULT '{}',
  seniorities   TEXT[] DEFAULT '{}',
  departments   TEXT[] DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_role_filters_search
  ON search_role_filters(search_id);


-- ---------------------------------------------------------------------------
-- 7. LINK CAMPAIGNS -> ICP DEFINITIONS
-- ---------------------------------------------------------------------------

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS icp_definition_id UUID;

DO $$ BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_icp_definition_id_fkey
    FOREIGN KEY (icp_definition_id) REFERENCES icp_definitions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_icp
  ON campaigns(icp_definition_id) WHERE icp_definition_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 8. TRIGGERS: auto-update updated_at
-- ---------------------------------------------------------------------------
-- Uses the existing update_updated_at() function from migration 00001.
-- DROP IF EXISTS + CREATE ensures idempotency.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_icp_definitions_updated_at ON icp_definitions;
CREATE TRIGGER trg_icp_definitions_updated_at
  BEFORE UPDATE ON icp_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_searches_updated_at ON searches;
CREATE TRIGGER trg_searches_updated_at
  BEFORE UPDATE ON searches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
