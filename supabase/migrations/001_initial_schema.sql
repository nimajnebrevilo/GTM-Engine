-- GTM-Now database schema
-- Designed around the prospecting pipeline:
--   discover → enrich → verify → campaign → outreach → reply

-- ============================================================
-- Organizations: companies discovered via Apollo / Exa
-- ============================================================
create table organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  domain        text,
  industry      text,
  employee_count int,
  apollo_id     text unique,
  linkedin_url  text,
  raw_data      jsonb default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_organizations_domain on organizations (domain);
create index idx_organizations_apollo_id on organizations (apollo_id);

-- ============================================================
-- Contacts: people at those organizations
-- ============================================================
create type contact_status as enum (
  'discovered',
  'enriched',
  'verified',
  'queued',
  'contacted',
  'replied',
  'bounced',
  'opted_out'
);

create table contacts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  first_name      text,
  last_name       text,
  email           text,
  email_status    text,           -- from MillionVerifier: ok, catch_all, unknown, invalid, disposable
  title           text,
  linkedin_url    text,
  phone           text,
  apollo_id       text unique,
  status          contact_status not null default 'discovered',
  raw_data        jsonb default '{}',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_contacts_email on contacts (email);
create index idx_contacts_org on contacts (organization_id);
create index idx_contacts_status on contacts (status);
create index idx_contacts_apollo_id on contacts (apollo_id);

-- ============================================================
-- Campaigns: outreach sequences (email via Instantly, LinkedIn via HeyReach)
-- ============================================================
create type campaign_channel as enum ('email', 'linkedin');
create type campaign_status  as enum ('draft', 'active', 'paused', 'completed');

create table campaigns (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  channel       campaign_channel not null,
  status        campaign_status not null default 'draft',
  external_id   text,            -- Instantly campaign ID or HeyReach campaign ID
  metadata      jsonb default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ============================================================
-- Campaign ↔ Contact assignments with per-contact outreach status
-- ============================================================
create type outreach_status as enum (
  'pending',
  'sent',
  'opened',
  'clicked',
  'replied',
  'bounced',
  'unsubscribed'
);

create table campaign_contacts (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references campaigns(id) on delete cascade,
  contact_id    uuid not null references contacts(id)  on delete cascade,
  status        outreach_status not null default 'pending',
  sent_at       timestamptz,
  opened_at     timestamptz,
  replied_at    timestamptz,
  created_at    timestamptz not null default now(),
  unique (campaign_id, contact_id)
);

create index idx_cc_campaign on campaign_contacts (campaign_id);
create index idx_cc_contact  on campaign_contacts (contact_id);
create index idx_cc_status   on campaign_contacts (status);

-- ============================================================
-- Enrichment log: audit trail for every external API call
-- ============================================================
create type enrichment_source as enum (
  'apollo',
  'prospeo',
  'exa',
  'millionverifier',
  'heyreach',
  'instantly'
);

create table enrichment_log (
  id            uuid primary key default gen_random_uuid(),
  source        enrichment_source not null,
  entity_type   text not null,   -- 'contact', 'organization', etc.
  entity_id     uuid not null,
  request       jsonb default '{}',
  response      jsonb default '{}',
  success       boolean not null default true,
  error_message text,
  created_at    timestamptz not null default now()
);

create index idx_enrichment_entity on enrichment_log (entity_type, entity_id);
create index idx_enrichment_source on enrichment_log (source);

-- ============================================================
-- Auto-update updated_at on row changes
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_organizations_updated
  before update on organizations
  for each row execute function update_updated_at();

create trigger trg_contacts_updated
  before update on contacts
  for each row execute function update_updated_at();

create trigger trg_campaigns_updated
  before update on campaigns
  for each row execute function update_updated_at();
