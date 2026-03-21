-- ============================================================================
-- PROSPECTING DATA PLATFORM — AGENCY SCHEMA
-- ============================================================================
-- Merged schema: combines our agency infrastructure with the existing
-- Apollo-integrated prospecting database at dnepejjdqylzkqefnjbt.supabase.co
--
-- Design principles:
--   1. Companies are a SHARED ASSET — independent of any client
--   2. Contacts (people) are linked to companies — the outreach targets
--   3. Suppression is PER-CLIENT — active for one client, blocked for another
--   4. Signals & trigger events track buying intent and timing
--   5. Enrichment log is polymorphic — works for companies AND contacts
--   6. Full campaign history at both company and contact level
-- ============================================================================


-- ---------------------------------------------------------------------------
-- ENUM TYPES (matching existing DB conventions)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE contact_status AS ENUM (
    'discovered',       -- just found, not yet validated
    'enriched',         -- data enriched from external source
    'verified',         -- email/phone verified
    'engaged',          -- has been contacted
    'converted',        -- became a customer/meeting/deal
    'unresponsive',     -- no response after outreach
    'do_not_contact'    -- opted out or suppressed
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE outreach_status AS ENUM (
    'pending',          -- queued, not yet sent
    'sent',             -- message delivered
    'opened',           -- email opened / message viewed
    'clicked',          -- clicked a link
    'replied',          -- responded
    'bounced',          -- delivery failed
    'unsubscribed',     -- opted out
    'converted'         -- meeting booked / deal started
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM (
    'draft',
    'sourcing',
    'enriching',
    'review',
    'active',           -- outreach in progress
    'paused',
    'delivered',
    'archived'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_channel AS ENUM (
    'email',
    'linkedin',
    'phone',
    'multi_channel'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE enrichment_source AS ENUM (
    'apollo',
    'companies_house',
    'opencorporates',
    'builtwith',
    'sec_edgar',
    'sam_gov',
    'epo_patents',
    'linkedin',
    'website_scrape',
    'google_maps',
    'manual',
    'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE signal_type AS ENUM (
    'new_hire',           -- key person hired (e.g. new VP Sales)
    'funding_round',      -- raised capital
    'expansion',          -- new office, new market
    'acquisition',        -- acquired or was acquired
    'product_launch',     -- launched new product/service
    'leadership_change',  -- C-suite change
    'technology_adoption',-- adopted a new tool/platform
    'award_recognition',  -- won award or appeared in ranking
    'regulatory_event',   -- new compliance requirement
    'contract_win',       -- won a public contract
    'earnings_report',    -- financial results
    'job_posting',        -- hiring for relevant roles
    'website_change',     -- significant website update
    'social_engagement',  -- spike in social activity
    'news_mention',       -- appeared in news
    'review_spike',       -- sudden increase in reviews
    'competitor_loss',    -- competitor lost a customer
    'intent_signal',      -- search/content intent data
    'custom'              -- user-defined
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- 1. COMPANIES — the master prospect pool (was "organizations")
-- ---------------------------------------------------------------------------
-- One row per unique business. Shared across all clients and campaigns.

CREATE TABLE IF NOT EXISTS companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name            TEXT NOT NULL,
  name_normalized TEXT NOT NULL,
  domain          TEXT,
  linkedin_url    TEXT,
  registration_number TEXT,
  jurisdiction    TEXT,

  -- External IDs (for dedup with enrichment tools)
  apollo_id       TEXT,

  -- Firmographics
  industry        TEXT,
  sub_industry    TEXT,
  sic_codes       TEXT[],
  employee_count  INT,
  employee_range  TEXT,
  revenue_estimate_usd BIGINT,
  revenue_range   TEXT,
  founded_year    INT,
  company_type    TEXT,

  -- Location
  address_line1   TEXT,
  city            TEXT,
  region          TEXT,
  postal_code     TEXT,
  country         TEXT,

  -- Contact surface
  phone           TEXT,
  general_email   TEXT,
  website         TEXT,

  -- Description
  description     TEXT,
  tags            TEXT[] NOT NULL DEFAULT '{}',

  -- Data provenance
  original_source TEXT NOT NULL,
  source_url      TEXT,
  source_data     JSONB NOT NULL DEFAULT '{}',
  raw_data        JSONB DEFAULT '{}',
  confidence_score REAL NOT NULL DEFAULT 0.5,

  -- Validation
  validation_status TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated', 'valid', 'stale', 'invalid', 'do_not_contact')),
  validated_at    TIMESTAMPTZ,

  -- Enrichment
  enrichment_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'partial', 'complete', 'failed')),
  enriched_at     TIMESTAMPTZ,
  enrichment_sources TEXT[] NOT NULL DEFAULT '{}',

  -- Usage tracking
  times_used      INT NOT NULL DEFAULT 0,
  last_used_at    TIMESTAMPTZ,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Dedup
  dedup_cluster_id UUID,
  is_primary      BOOLEAN NOT NULL DEFAULT true,

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns if the companies table already existed
ALTER TABLE companies ADD COLUMN IF NOT EXISTS name_normalized TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS domain TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS registration_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS jurisdiction TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS apollo_id TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sub_industry TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS sic_codes TEXT[];
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_count INT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_range TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_estimate_usd BIGINT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS revenue_range TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS founded_year INT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS company_type TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS address_line1 TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS region TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS postal_code TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS general_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS original_source TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source_data JSONB DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS confidence_score REAL DEFAULT 0.5;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'unvalidated';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS enrichment_status TEXT DEFAULT 'pending';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS enrichment_sources TEXT[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS times_used INT DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE companies ADD COLUMN IF NOT EXISTS dedup_cluster_id UUID;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_companies_domain        ON companies(domain)          WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_name_norm     ON companies(name_normalized);
CREATE INDEX IF NOT EXISTS idx_companies_industry      ON companies(industry)        WHERE industry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_country       ON companies(country)         WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_validation    ON companies(validation_status);
CREATE INDEX IF NOT EXISTS idx_companies_enrichment    ON companies(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_companies_source        ON companies(original_source);
CREATE INDEX IF NOT EXISTS idx_companies_last_used     ON companies(last_used_at)    WHERE last_used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_dedup         ON companies(dedup_cluster_id) WHERE dedup_cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_primary       ON companies(is_primary)      WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_companies_apollo        ON companies(apollo_id)       WHERE apollo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_reg           ON companies(jurisdiction, registration_number)
                                                                       WHERE registration_number IS NOT NULL;

ALTER TABLE companies ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_companies_fts ON companies USING gin(fts);


-- ---------------------------------------------------------------------------
-- 2. CONTACTS — people at companies (the outreach targets)
-- ---------------------------------------------------------------------------
-- Each contact belongs to one company. This is who you actually email/call.

CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,

  -- Identity
  first_name      TEXT,
  last_name       TEXT,
  email           TEXT,
  email_status    TEXT
    CHECK (email_status IN ('valid', 'invalid', 'catch_all', 'unknown', 'risky', NULL)),
  title           TEXT,                       -- job title
  seniority       TEXT,                       -- e.g. 'C-Suite', 'VP', 'Director', 'Manager'
  department      TEXT,                       -- e.g. 'Sales', 'Marketing', 'Engineering'
  linkedin_url    TEXT,
  phone           TEXT,
  phone_status    TEXT
    CHECK (phone_status IN ('valid', 'invalid', 'unknown', NULL)),

  -- External IDs
  apollo_id       TEXT,

  -- Status
  status          contact_status NOT NULL DEFAULT 'discovered',

  -- Data provenance
  original_source TEXT,
  raw_data        JSONB DEFAULT '{}',

  -- Timestamps
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns if the contacts table already existed
DO $$ BEGIN
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS company_id UUID;
  -- Add FK constraint separately (may already exist)
  BEGIN
    ALTER TABLE contacts ADD CONSTRAINT contacts_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS first_name TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_name TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email_status TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS title TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS seniority TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS department TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_status TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS apollo_id TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS status contact_status DEFAULT 'discovered';
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS original_source TEXT;
  ALTER TABLE contacts ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}';
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_contacts_company    ON contacts(company_id)    WHERE company_id IS NOT NULL;
EXCEPTION WHEN undefined_column THEN
  RAISE NOTICE 'contacts.company_id does not exist, skipping index';
END $$;
CREATE INDEX IF NOT EXISTS idx_contacts_email      ON contacts(email)         WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_linkedin   ON contacts(linkedin_url)  WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_apollo     ON contacts(apollo_id)     WHERE apollo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_status     ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_seniority  ON contacts(seniority)     WHERE seniority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_title      ON contacts(title)         WHERE title IS NOT NULL;

-- Full-text search on contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS fts tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(department, '')
    )
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_contacts_fts ON contacts USING gin(fts);


-- ---------------------------------------------------------------------------
-- 3. CLIENTS — agency client accounts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS clients (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  website         TEXT,
  industry        TEXT,
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'churned')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns if the clients table already existed
ALTER TABLE clients ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';


-- ---------------------------------------------------------------------------
-- 4. CLIENT_SUPPRESSIONS — per-client "do not contact" lists
-- ---------------------------------------------------------------------------
-- A company can be suppressed for one client but active for another.
-- Supports both company-level and contact-level suppression.

CREATE TABLE IF NOT EXISTS client_suppressions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,

  reason          TEXT NOT NULL DEFAULT 'client_request'
    CHECK (reason IN (
      'client_request',
      'existing_customer',
      'competitor',
      'previously_contacted',
      'bounced',
      'unsubscribed',
      'other'
    )),
  notes           TEXT,
  suppressed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  suppressed_by   TEXT,

  -- At least one of company_id or contact_id must be set
  CONSTRAINT suppression_target CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL),
  -- Unique per client+company or client+contact
  UNIQUE NULLS NOT DISTINCT (client_id, company_id, contact_id)
);

-- Backfill columns if the client_suppressions table already existed
DO $$ BEGIN
  ALTER TABLE client_suppressions ADD COLUMN IF NOT EXISTS client_id UUID;
  BEGIN ALTER TABLE client_suppressions ADD CONSTRAINT client_suppressions_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE client_suppressions ADD COLUMN IF NOT EXISTS company_id UUID;
  BEGIN ALTER TABLE client_suppressions ADD CONSTRAINT client_suppressions_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE client_suppressions ADD COLUMN IF NOT EXISTS contact_id UUID;
  BEGIN ALTER TABLE client_suppressions ADD CONSTRAINT client_suppressions_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE client_suppressions ADD COLUMN IF NOT EXISTS reason TEXT DEFAULT 'client_request';
  ALTER TABLE client_suppressions ADD COLUMN IF NOT EXISTS notes TEXT;
  ALTER TABLE client_suppressions ADD COLUMN IF NOT EXISTS suppressed_at TIMESTAMPTZ DEFAULT now();
  ALTER TABLE client_suppressions ADD COLUMN IF NOT EXISTS suppressed_by TEXT;
END $$;

CREATE INDEX IF NOT EXISTS idx_suppressions_client  ON client_suppressions(client_id);
CREATE INDEX IF NOT EXISTS idx_suppressions_company ON client_suppressions(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppressions_contact ON client_suppressions(contact_id) WHERE contact_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 5. CAMPAIGNS — a specific prospecting engagement for a client
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaigns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  brief           TEXT,
  channel         campaign_channel NOT NULL DEFAULT 'email',

  -- ICP filters
  target_geographies  TEXT[] NOT NULL DEFAULT '{}',
  target_industries   TEXT[] NOT NULL DEFAULT '{}',
  target_company_sizes TEXT[] DEFAULT '{}',
  target_keywords     TEXT[] DEFAULT '{}',
  exclusion_keywords  TEXT[] DEFAULT '{}',

  -- External tool integration
  external_id     TEXT,                       -- ID in external system (e.g. Apollo sequence)

  status          campaign_status NOT NULL DEFAULT 'draft',
  metadata        JSONB DEFAULT '{}',

  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns if the campaigns table already existed
DO $$ BEGIN
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS client_id UUID;
  BEGIN ALTER TABLE campaigns ADD CONSTRAINT campaigns_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS name TEXT;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS brief TEXT;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS channel campaign_channel DEFAULT 'email';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_geographies TEXT[] DEFAULT '{}';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_industries TEXT[] DEFAULT '{}';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_company_sizes TEXT[] DEFAULT '{}';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS target_keywords TEXT[] DEFAULT '{}';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS exclusion_keywords TEXT[] DEFAULT '{}';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS external_id TEXT;
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS status campaign_status DEFAULT 'draft';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
  ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;
END $$;

CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);


-- ---------------------------------------------------------------------------
-- 6. CAMPAIGN_COMPANIES — which companies went into which campaign
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  icp_fit_score   REAL,
  segment         TEXT,
  included        BOOLEAN NOT NULL DEFAULT true,

  outcome         TEXT DEFAULT 'pending'
    CHECK (outcome IN ('pending', 'sent', 'opened', 'replied', 'converted', 'bounced', 'unsubscribed', 'no_action')),
  outcome_at      TIMESTAMPTZ,
  outcome_notes   TEXT,

  added_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, company_id)
);

-- Backfill columns if the campaign_companies table already existed
DO $$ BEGIN
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS campaign_id UUID;
  BEGIN ALTER TABLE campaign_companies ADD CONSTRAINT campaign_companies_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS company_id UUID;
  BEGIN ALTER TABLE campaign_companies ADD CONSTRAINT campaign_companies_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS icp_fit_score REAL;
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS segment TEXT;
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS included BOOLEAN DEFAULT true;
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT 'pending';
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ;
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS outcome_notes TEXT;
  ALTER TABLE campaign_companies ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT now();
END $$;

CREATE INDEX IF NOT EXISTS idx_cc_campaign   ON campaign_companies(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cc_company    ON campaign_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_cc_included   ON campaign_companies(campaign_id) WHERE included = true;


-- ---------------------------------------------------------------------------
-- 7. CAMPAIGN_CONTACTS — contact-level outreach tracking
-- ---------------------------------------------------------------------------
-- The actual people being contacted in each campaign.
-- Tracks individual outreach events (sent, opened, replied, etc.)

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,

  status          outreach_status NOT NULL DEFAULT 'pending',

  -- Outreach event timestamps
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  converted_at    TIMESTAMPTZ,

  -- Sequence tracking
  sequence_step   INT,                        -- which step in the sequence
  sequence_total  INT,                        -- total steps in sequence

  notes           TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, contact_id)
);

-- Backfill columns if the campaign_contacts table already existed
DO $$ BEGIN
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS campaign_id UUID;
  BEGIN ALTER TABLE campaign_contacts ADD CONSTRAINT campaign_contacts_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS contact_id UUID;
  BEGIN ALTER TABLE campaign_contacts ADD CONSTRAINT campaign_contacts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS status outreach_status DEFAULT 'pending';
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS replied_at TIMESTAMPTZ;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS sequence_step INT;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS sequence_total INT;
  ALTER TABLE campaign_contacts ADD COLUMN IF NOT EXISTS notes TEXT;
END $$;

CREATE INDEX IF NOT EXISTS idx_ccon_campaign ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ccon_contact  ON campaign_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_ccon_status   ON campaign_contacts(status);


-- ---------------------------------------------------------------------------
-- 8. SIGNALS — buying intent & trigger events
-- ---------------------------------------------------------------------------
-- Tracks events that indicate a company or contact is a good prospect NOW.
-- Examples: new hire, funding round, job posting, tech adoption, etc.

CREATE TABLE IF NOT EXISTS signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,

  signal_type     signal_type NOT NULL,
  title           TEXT NOT NULL,              -- human-readable summary
  description     TEXT,                       -- detail / context
  source          TEXT,                       -- where we found this signal
  source_url      TEXT,                       -- link to original

  -- Signal strength & timing
  strength        REAL NOT NULL DEFAULT 0.5
    CHECK (strength >= 0 AND strength <= 1),  -- 0 = weak, 1 = very strong
  signal_date     TIMESTAMPTZ NOT NULL DEFAULT now(), -- when the event happened
  expires_at      TIMESTAMPTZ,                -- when this signal becomes stale

  -- Raw data
  raw_data        JSONB DEFAULT '{}',

  -- Metadata
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by     TEXT,                       -- 'system', 'manual', source name

  CONSTRAINT signal_target CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL)
);

-- Backfill columns if the signals table already existed
DO $$ BEGIN
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS company_id UUID;
  BEGIN ALTER TABLE signals ADD CONSTRAINT signals_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS contact_id UUID;
  BEGIN ALTER TABLE signals ADD CONSTRAINT signals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_type signal_type;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS title TEXT;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS description TEXT;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS source TEXT;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS source_url TEXT;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS strength REAL DEFAULT 0.5;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS signal_date TIMESTAMPTZ DEFAULT now();
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS raw_data JSONB DEFAULT '{}';
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ DEFAULT now();
  ALTER TABLE signals ADD COLUMN IF NOT EXISTS detected_by TEXT;
END $$;

CREATE INDEX IF NOT EXISTS idx_signals_company    ON signals(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_contact    ON signals(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_type       ON signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_date       ON signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_signals_strength   ON signals(strength)   WHERE strength >= 0.7;
CREATE INDEX IF NOT EXISTS idx_signals_active     ON signals(signal_date, expires_at);


-- ---------------------------------------------------------------------------
-- 9. ENRICHMENT_LOG — polymorphic audit trail
-- ---------------------------------------------------------------------------
-- Works for both companies AND contacts (entity_type + entity_id).
-- Matches existing DB convention.

CREATE TABLE IF NOT EXISTS enrichment_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          enrichment_source NOT NULL,
  entity_type     TEXT NOT NULL
    CHECK (entity_type IN ('company', 'contact')),
  entity_id       UUID NOT NULL,

  -- What happened
  request         JSONB DEFAULT '{}',         -- what we asked for
  response        JSONB DEFAULT '{}',         -- what came back
  fields_updated  TEXT[] NOT NULL DEFAULT '{}',
  success         BOOLEAN NOT NULL DEFAULT true,
  error_message   TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns if the enrichment_log table already existed
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS source enrichment_source;
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS request JSONB DEFAULT '{}';
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS response JSONB DEFAULT '{}';
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS fields_updated TEXT[] DEFAULT '{}';
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS success BOOLEAN DEFAULT true;
ALTER TABLE enrichment_log ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_enrichlog_entity ON enrichment_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_enrichlog_source ON enrichment_log(source);
CREATE INDEX IF NOT EXISTS idx_enrichlog_date   ON enrichment_log(created_at);


-- ---------------------------------------------------------------------------
-- 10. DATA_IMPORTS — track every bulk data load
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_imports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name     TEXT NOT NULL,
  source_type     TEXT NOT NULL DEFAULT 'csv'
    CHECK (source_type IN ('csv', 'api', 'scrape', 'manual')),
  file_name       TEXT,
  record_count    INT NOT NULL DEFAULT 0,
  records_inserted INT NOT NULL DEFAULT 0,
  records_skipped INT NOT NULL DEFAULT 0,
  records_errored INT NOT NULL DEFAULT 0,
  notes           TEXT,
  imported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns if the data_imports table already existed
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS source_name TEXT;
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'csv';
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS file_name TEXT;
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS record_count INT DEFAULT 0;
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS records_inserted INT DEFAULT 0;
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS records_skipped INT DEFAULT 0;
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS records_errored INT DEFAULT 0;
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE data_imports ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_imports_source ON data_imports(source_name);


-- ---------------------------------------------------------------------------
-- 11. EXPORTS — track what was delivered and when
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS exports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  format          TEXT NOT NULL CHECK (format IN ('csv', 'json', 'xlsx')),
  file_url        TEXT,
  row_count       INT,
  filters_applied JSONB,
  exported_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Backfill columns if the exports table already existed
DO $$ BEGIN
  ALTER TABLE exports ADD COLUMN IF NOT EXISTS campaign_id UUID;
  BEGIN ALTER TABLE exports ADD CONSTRAINT exports_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN NULL; END;
  ALTER TABLE exports ADD COLUMN IF NOT EXISTS format TEXT;
  ALTER TABLE exports ADD COLUMN IF NOT EXISTS file_url TEXT;
  ALTER TABLE exports ADD COLUMN IF NOT EXISTS row_count INT;
  ALTER TABLE exports ADD COLUMN IF NOT EXISTS filters_applied JSONB;
  ALTER TABLE exports ADD COLUMN IF NOT EXISTS exported_at TIMESTAMPTZ DEFAULT now();
END $$;

CREATE INDEX IF NOT EXISTS idx_exports_campaign ON exports(campaign_id);


-- ===========================================================================
-- TRIGGERS
-- ===========================================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_contacts_updated_at ON contacts;
CREATE TRIGGER trg_contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_clients_updated_at ON clients;
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- Auto-increment companies.times_used when added to a campaign
CREATE OR REPLACE FUNCTION increment_company_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE companies
  SET times_used = times_used + 1,
      last_used_at = now()
  WHERE id = NEW.company_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_campaign_company_usage ON campaign_companies;
CREATE TRIGGER trg_campaign_company_usage
  AFTER INSERT ON campaign_companies
  FOR EACH ROW EXECUTE FUNCTION increment_company_usage();


-- Auto-suppress contact for client after bounce/unsubscribe
CREATE OR REPLACE FUNCTION auto_suppress_on_outreach_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('bounced', 'unsubscribed') AND
     (OLD IS NULL OR OLD.status NOT IN ('bounced', 'unsubscribed')) THEN
    INSERT INTO client_suppressions (client_id, contact_id, reason, suppressed_by)
    SELECT c.client_id, NEW.contact_id,
           CASE NEW.status WHEN 'bounced' THEN 'bounced' ELSE 'unsubscribed' END,
           'system'
    FROM campaigns c WHERE c.id = NEW.campaign_id
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_suppress_contact ON campaign_contacts;
CREATE TRIGGER trg_auto_suppress_contact
  AFTER UPDATE ON campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION auto_suppress_on_outreach_status();


-- Auto-update contact status when outreach status changes
CREATE OR REPLACE FUNCTION sync_contact_status_from_outreach()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'sent' OR NEW.status = 'opened' OR NEW.status = 'clicked' THEN
    UPDATE contacts SET status = 'engaged' WHERE id = NEW.contact_id AND status IN ('discovered', 'enriched', 'verified');
  ELSIF NEW.status = 'converted' THEN
    UPDATE contacts SET status = 'converted' WHERE id = NEW.contact_id;
  ELSIF NEW.status = 'bounced' THEN
    UPDATE contacts SET email_status = 'invalid' WHERE id = NEW.contact_id;
  ELSIF NEW.status = 'unsubscribed' THEN
    UPDATE contacts SET status = 'do_not_contact' WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contact_status ON campaign_contacts;
CREATE TRIGGER trg_sync_contact_status
  AFTER UPDATE ON campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION sync_contact_status_from_outreach();
