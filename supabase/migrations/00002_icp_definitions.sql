-- ============================================================================
-- ICP DEFINITIONS — IDEAL CUSTOMER PROFILE SCORING ENGINE
-- ============================================================================
-- Adds the icp_definitions table as a first-class entity for lead scoring.
-- Each client can have multiple ICPs, versioned via a parent_id chain.
--
-- Design principles:
--   1. ICPs belong to a client — CASCADE delete when the client is removed
--   2. Versioning via parent_id lets clients evolve criteria without losing history
--   3. Status lifecycle: draft → active → archived
--   4. Scoring weights are per-ICP so each profile can tune its own model
--   5. Campaigns link to an ICP to inherit scoring context
-- ============================================================================


-- ---------------------------------------------------------------------------
-- ICP DEFINITIONS TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS icp_definitions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id           UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,                    -- e.g. "Series A SaaS — Q1 2026"
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

  -- Challenge/refinement metadata
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

CREATE INDEX IF NOT EXISTS idx_icp_definitions_client ON icp_definitions(client_id);
CREATE INDEX IF NOT EXISTS idx_icp_definitions_status ON icp_definitions(status);
CREATE INDEX IF NOT EXISTS idx_icp_definitions_parent ON icp_definitions(parent_id) WHERE parent_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- LINK CAMPAIGNS → ICP DEFINITIONS
-- ---------------------------------------------------------------------------

ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS icp_definition_id UUID;

-- Add FK separately (safe pattern from existing schema)
DO $$ BEGIN
  ALTER TABLE campaigns ADD CONSTRAINT campaigns_icp_definition_id_fkey
    FOREIGN KEY (icp_definition_id) REFERENCES icp_definitions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_icp ON campaigns(icp_definition_id) WHERE icp_definition_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- AUTO-UPDATE updated_at TRIGGER
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_icp_definitions_updated_at ON icp_definitions;
CREATE TRIGGER trg_icp_definitions_updated_at
  BEFORE UPDATE ON icp_definitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
