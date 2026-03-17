// Database types generated from the migration schema.
// These mirror the Postgres tables exactly so the Supabase client
// gives us full type safety on every query.

export type ContactStatus =
  | "discovered"
  | "enriched"
  | "verified"
  | "queued"
  | "contacted"
  | "replied"
  | "bounced"
  | "opted_out";

export type CampaignChannel = "email" | "linkedin";
export type CampaignStatus = "draft" | "active" | "paused" | "completed";

export type OutreachStatus =
  | "pending"
  | "sent"
  | "opened"
  | "clicked"
  | "replied"
  | "bounced"
  | "unsubscribed";

export type EnrichmentSource =
  | "apollo"
  | "prospeo"
  | "exa"
  | "millionverifier"
  | "heyreach"
  | "instantly";

// ===== Organizations =====

export interface OrganizationRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  employee_count: number | null;
  apollo_id: string | null;
  linkedin_url: string | null;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface OrganizationInsert {
  id?: string;
  name: string;
  domain?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  apollo_id?: string | null;
  linkedin_url?: string | null;
  raw_data?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface OrganizationUpdate {
  name?: string;
  domain?: string | null;
  industry?: string | null;
  employee_count?: number | null;
  apollo_id?: string | null;
  linkedin_url?: string | null;
  raw_data?: Record<string, unknown>;
  updated_at?: string;
}

// ===== Contacts =====

export interface ContactRow {
  id: string;
  organization_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  email_status: string | null;
  title: string | null;
  linkedin_url: string | null;
  phone: string | null;
  apollo_id: string | null;
  status: ContactStatus;
  raw_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ContactInsert {
  id?: string;
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  email_status?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  phone?: string | null;
  apollo_id?: string | null;
  status?: ContactStatus;
  raw_data?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface ContactUpdate {
  organization_id?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  email_status?: string | null;
  title?: string | null;
  linkedin_url?: string | null;
  phone?: string | null;
  apollo_id?: string | null;
  status?: ContactStatus;
  raw_data?: Record<string, unknown>;
  updated_at?: string;
}

// ===== Campaigns =====

export interface CampaignRow {
  id: string;
  name: string;
  channel: CampaignChannel;
  status: CampaignStatus;
  external_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CampaignInsert {
  id?: string;
  name: string;
  channel: CampaignChannel;
  status?: CampaignStatus;
  external_id?: string | null;
  metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignUpdate {
  name?: string;
  channel?: CampaignChannel;
  status?: CampaignStatus;
  external_id?: string | null;
  metadata?: Record<string, unknown>;
  updated_at?: string;
}

// ===== Campaign Contacts =====

export interface CampaignContactRow {
  id: string;
  campaign_id: string;
  contact_id: string;
  status: OutreachStatus;
  sent_at: string | null;
  opened_at: string | null;
  replied_at: string | null;
  created_at: string;
}

export interface CampaignContactInsert {
  id?: string;
  campaign_id: string;
  contact_id: string;
  status?: OutreachStatus;
  sent_at?: string | null;
  opened_at?: string | null;
  replied_at?: string | null;
  created_at?: string;
}

export interface CampaignContactUpdate {
  status?: OutreachStatus;
  sent_at?: string | null;
  opened_at?: string | null;
  replied_at?: string | null;
}

// ===== Enrichment Log =====

export interface EnrichmentLogRow {
  id: string;
  source: EnrichmentSource;
  entity_type: string;
  entity_id: string;
  request: Record<string, unknown>;
  response: Record<string, unknown>;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface EnrichmentLogInsert {
  id?: string;
  source: EnrichmentSource;
  entity_type: string;
  entity_id: string;
  request?: Record<string, unknown>;
  response?: Record<string, unknown>;
  success?: boolean;
  error_message?: string | null;
  created_at?: string;
}

// ===== Convenience aliases =====

export type Organization = OrganizationRow;
export type Contact = ContactRow;
export type Campaign = CampaignRow;
export type CampaignContact = CampaignContactRow;
export type EnrichmentLogEntry = EnrichmentLogRow;

// ===== Table name constants =====

export const TABLES = {
  organizations: "organizations",
  contacts: "contacts",
  campaigns: "campaigns",
  campaign_contacts: "campaign_contacts",
  enrichment_log: "enrichment_log",
} as const;
