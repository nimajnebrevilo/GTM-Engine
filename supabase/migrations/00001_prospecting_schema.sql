-- ============================================================================
-- REFERENCE ONLY — reflects live Supabase state as of 2026-03-21. Do NOT re-run.
-- ============================================================================
-- Prospecting Data Platform — Agency Schema
-- Database: dnepejjdqylzkqefnjbt.supabase.co
--
-- 12 tables, 6 custom enums, ~4.8M company rows
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
-- ENUM TYPES
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE contact_status AS ENUM (
    'discovered',
    'enriched',
    'verified',
    'queued',
    'contacted',
    'replied',
    'bounced',
    'opted_out'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE outreach_status AS ENUM (
    'pending',
    'sent',
    'opened',
    'clicked',
    'replied',
    'bounced',
    'unsubscribed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM (
    'draft',
    'active',
    'paused',
    'completed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE campaign_channel AS ENUM (
    'email',
    'linkedin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE enrichment_source AS ENUM (
    'apollo',
    'prospeo',
    'exa',
    'millionverifier',
    'heyreach',
    'instantly'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE signal_type AS ENUM (
    'new_hire',
    'funding_round',
    'expansion',
    'acquisition',
    'product_launch',
    'leadership_change',
    'technology_adoption',
    'award_recognition',
    'regulatory_event',
    'contract_win',
    'earnings_report',
    'job_posting',
    'website_change',
    'social_engagement',
    'news_mention',
    'review_spike',
    'competitor_loss',
    'intent_signal',
    'custom'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- 1. CLIENTS (8 cols)
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


-- ---------------------------------------------------------------------------
-- 2. COMPANIES (46 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS companies (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  name_normalized      TEXT NOT NULL,
  domain               TEXT,
  linkedin_url         TEXT,
  registration_number  TEXT,
  jurisdiction         TEXT,
  apollo_id            TEXT,
  industry             TEXT,
  sub_industry         TEXT,
  sic_codes            TEXT[],
  employee_count       INT,
  employee_range       TEXT,
  revenue_estimate_usd BIGINT,
  revenue_range        TEXT,
  founded_year         INT,
  company_type         TEXT,
  address_line1        TEXT,
  city                 TEXT,
  region               TEXT,
  postal_code          TEXT,
  country              TEXT,
  phone                TEXT,
  general_email        TEXT,
  website              TEXT,
  description          TEXT,
  tags                 TEXT[] NOT NULL DEFAULT '{}',
  original_source      TEXT NOT NULL,
  source_url           TEXT,
  source_data          JSONB NOT NULL DEFAULT '{}',
  raw_data             JSONB DEFAULT '{}',
  confidence_score     REAL NOT NULL DEFAULT 0.5,
  validation_status    TEXT NOT NULL DEFAULT 'unvalidated'
    CHECK (validation_status IN ('unvalidated', 'valid', 'invalid', 'do_not_contact')),
  validated_at         TIMESTAMPTZ,
  enrichment_status    TEXT NOT NULL DEFAULT 'pending'
    CHECK (enrichment_status IN ('pending', 'partial', 'complete', 'failed', 'not_found')),
  enriched_at          TIMESTAMPTZ,
  enrichment_sources   TEXT[] NOT NULL DEFAULT '{}',
  times_used           INT NOT NULL DEFAULT 0,
  last_used_at         TIMESTAMPTZ,
  first_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  dedup_cluster_id     UUID,
  is_primary           BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  fts                  TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, ''))
  ) STORED,
  client_id            UUID REFERENCES clients(id)
);

CREATE INDEX IF NOT EXISTS idx_companies_domain     ON companies(domain)             WHERE domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_name_norm  ON companies(name_normalized);
CREATE INDEX IF NOT EXISTS idx_companies_industry   ON companies(industry)           WHERE industry IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_country    ON companies(country)            WHERE country IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_validation ON companies(validation_status);
CREATE INDEX IF NOT EXISTS idx_companies_enrichment ON companies(enrichment_status);
CREATE INDEX IF NOT EXISTS idx_companies_source     ON companies(original_source);
CREATE INDEX IF NOT EXISTS idx_companies_last_used  ON companies(last_used_at)       WHERE last_used_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_dedup      ON companies(dedup_cluster_id)   WHERE dedup_cluster_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_primary    ON companies(is_primary)         WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_companies_apollo     ON companies(apollo_id)          WHERE apollo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_reg        ON companies(jurisdiction, registration_number)
                                                                     WHERE registration_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_companies_fts        ON companies USING gin(fts);


-- ---------------------------------------------------------------------------
-- 3. CONTACTS (20 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name      TEXT,
  last_name       TEXT,
  email           TEXT,
  email_status    TEXT,
  title           TEXT,
  linkedin_url    TEXT,
  phone           TEXT,
  apollo_id       TEXT,
  status          contact_status DEFAULT 'discovered',
  raw_data        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  company_id      UUID REFERENCES companies(id) ON DELETE SET NULL,
  seniority       TEXT,
  department      TEXT,
  phone_status    TEXT,
  original_source TEXT,
  fts             TSVECTOR GENERATED ALWAYS AS (
    to_tsvector('english',
      coalesce(first_name, '') || ' ' ||
      coalesce(last_name, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(department, '')
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_contacts_company   ON contacts(company_id)   WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_email     ON contacts(email)        WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_linkedin  ON contacts(linkedin_url) WHERE linkedin_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_apollo    ON contacts(apollo_id)    WHERE apollo_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_status    ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_seniority ON contacts(seniority)    WHERE seniority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_title     ON contacts(title)        WHERE title IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_fts       ON contacts USING gin(fts);


-- ---------------------------------------------------------------------------
-- 4. CLIENT_SUPPRESSIONS (8 cols)
-- ---------------------------------------------------------------------------

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

  CONSTRAINT suppression_target CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL),
  UNIQUE NULLS NOT DISTINCT (client_id, company_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_suppressions_client  ON client_suppressions(client_id);
CREATE INDEX IF NOT EXISTS idx_suppressions_company ON client_suppressions(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_suppressions_contact ON client_suppressions(contact_id) WHERE contact_id IS NOT NULL;


-- ---------------------------------------------------------------------------
-- 5. CAMPAIGNS (16 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaigns (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 TEXT NOT NULL,
  channel              campaign_channel NOT NULL DEFAULT 'email',
  status               campaign_status NOT NULL DEFAULT 'draft',
  external_id          TEXT,
  metadata             JSONB DEFAULT '{}',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  client_id            UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  brief                TEXT,
  target_geographies   TEXT[] NOT NULL DEFAULT '{}',
  target_industries    TEXT[] NOT NULL DEFAULT '{}',
  target_company_sizes TEXT[] DEFAULT '{}',
  target_keywords      TEXT[] DEFAULT '{}',
  exclusion_keywords   TEXT[] DEFAULT '{}',
  delivered_at         TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_campaigns_client ON campaigns(client_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);


-- ---------------------------------------------------------------------------
-- 6. CAMPAIGN_COMPANIES (10 cols)
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

CREATE INDEX IF NOT EXISTS idx_cc_campaign ON campaign_companies(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cc_company  ON campaign_companies(company_id);
CREATE INDEX IF NOT EXISTS idx_cc_included ON campaign_companies(campaign_id) WHERE included = true;


-- ---------------------------------------------------------------------------
-- 7. CAMPAIGN_CONTACTS (14 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id     UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  status          outreach_status NOT NULL DEFAULT 'pending',
  sent_at         TIMESTAMPTZ,
  opened_at       TIMESTAMPTZ,
  clicked_at      TIMESTAMPTZ,
  replied_at      TIMESTAMPTZ,
  bounced_at      TIMESTAMPTZ,
  sequence_step   INT,
  sequence_total  INT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (campaign_id, contact_id)
);

CREATE INDEX IF NOT EXISTS idx_ccon_campaign ON campaign_contacts(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ccon_contact  ON campaign_contacts(contact_id);
CREATE INDEX IF NOT EXISTS idx_ccon_status   ON campaign_contacts(status);


-- ---------------------------------------------------------------------------
-- 8. SIGNALS (14 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS signals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  contact_id      UUID REFERENCES contacts(id) ON DELETE CASCADE,
  signal_type     signal_type NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  source          TEXT,
  source_url      TEXT,
  strength        REAL NOT NULL DEFAULT 0.5
    CHECK (strength >= 0 AND strength <= 1),
  signal_date     TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ,
  raw_data        JSONB DEFAULT '{}',
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  detected_by     TEXT,

  CONSTRAINT signal_target CHECK (company_id IS NOT NULL OR contact_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_signals_company  ON signals(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_contact  ON signals(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_signals_type     ON signals(signal_type);
CREATE INDEX IF NOT EXISTS idx_signals_date     ON signals(signal_date);
CREATE INDEX IF NOT EXISTS idx_signals_strength ON signals(strength)   WHERE strength >= 0.7;
CREATE INDEX IF NOT EXISTS idx_signals_active   ON signals(signal_date, expires_at);


-- ---------------------------------------------------------------------------
-- 9. ENRICHMENT_LOG (10 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS enrichment_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source          enrichment_source NOT NULL,
  entity_type     TEXT NOT NULL
    CHECK (entity_type IN ('company', 'contact')),
  entity_id       UUID NOT NULL,
  request         JSONB DEFAULT '{}',
  response        JSONB DEFAULT '{}',
  fields_updated  TEXT[] NOT NULL DEFAULT '{}',
  success         BOOLEAN NOT NULL DEFAULT true,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enrichlog_entity ON enrichment_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_enrichlog_source ON enrichment_log(source);
CREATE INDEX IF NOT EXISTS idx_enrichlog_date   ON enrichment_log(created_at);


-- ---------------------------------------------------------------------------
-- 10. DATA_IMPORTS (10 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_imports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name       TEXT NOT NULL,
  source_type       TEXT NOT NULL DEFAULT 'csv'
    CHECK (source_type IN ('csv', 'api', 'scrape', 'manual')),
  file_name         TEXT,
  record_count      INT NOT NULL DEFAULT 0,
  records_inserted  INT NOT NULL DEFAULT 0,
  records_skipped   INT NOT NULL DEFAULT 0,
  records_errored   INT NOT NULL DEFAULT 0,
  notes             TEXT,
  imported_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_imports_source ON data_imports(source_name);


-- ---------------------------------------------------------------------------
-- 11. EXPORTS (7 cols)
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

CREATE INDEX IF NOT EXISTS idx_exports_campaign ON exports(campaign_id);


-- ---------------------------------------------------------------------------
-- 12. POSTAL_CODES (13 cols)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS postal_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code    TEXT NOT NULL,
  postal_code     TEXT NOT NULL,
  place_name      TEXT,
  admin_name1     TEXT,
  admin_code1     TEXT,
  admin_name2     TEXT,
  admin_code2     TEXT,
  latitude        DOUBLE PRECISION,
  longitude       DOUBLE PRECISION,
  accuracy        INT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_postal_codes_country ON postal_codes(country_code);
CREATE INDEX IF NOT EXISTS idx_postal_codes_code    ON postal_codes(postal_code);
CREATE INDEX IF NOT EXISTS idx_postal_codes_lookup  ON postal_codes(country_code, postal_code);


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
    UPDATE contacts SET status = 'contacted' WHERE id = NEW.contact_id AND status IN ('discovered', 'enriched', 'verified', 'queued');
  ELSIF NEW.status = 'replied' THEN
    UPDATE contacts SET status = 'replied' WHERE id = NEW.contact_id;
  ELSIF NEW.status = 'bounced' THEN
    UPDATE contacts SET status = 'bounced', email_status = 'invalid' WHERE id = NEW.contact_id;
  ELSIF NEW.status = 'unsubscribed' THEN
    UPDATE contacts SET status = 'opted_out' WHERE id = NEW.contact_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_contact_status ON campaign_contacts;
CREATE TRIGGER trg_sync_contact_status
  AFTER UPDATE ON campaign_contacts
  FOR EACH ROW EXECUTE FUNCTION sync_contact_status_from_outreach();
