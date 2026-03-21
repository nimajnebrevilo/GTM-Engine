/**
 * Provider-agnostic interfaces.
 * All provider clients conform to these types so the service layer
 * doesn't care which provider returned the data.
 */

// ─── Company Search ──────────────────────────────────────────────────────────

export interface CompanySearchResult {
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  employeeCount: number | null;
  hqLocation: string | null;
  country: string | null;
  linkedinUrl: string | null;
  fundingStage: string | null;
  fundingTotalUsd: number | null;
  /** Provider-specific ID */
  sourceId: string;
  /** URL where this result was found */
  sourceUrl: string | null;
  /** Raw provider response */
  rawData: Record<string, unknown>;
}

// ─── Contact Search ──────────────────────────────────────────────────────────

export interface ContactSearchResult {
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  department: string | null;
  linkedinUrl: string | null;
  companyName: string;
  companyDomain: string | null;
  /** Provider-specific ID */
  sourceId: string;
  rawData: Record<string, unknown>;
}

// ─── Contact Enrichment ──────────────────────────────────────────────────────

export interface ContactEnrichmentResult {
  email: string | null;
  emailStatus: 'valid' | 'invalid' | 'catch_all' | 'unknown' | 'risky' | null;
  phone: string | null;
  phoneStatus: 'valid' | 'invalid' | 'unknown' | null;
  /** Which provider returned this data */
  provider: string;
  /** Credits consumed for this enrichment */
  creditsUsed: number;
  rawData: Record<string, unknown>;
}

// ─── Email Verification ──────────────────────────────────────────────────────

export interface EmailVerificationResult {
  email: string;
  status: 'valid' | 'invalid' | 'catch_all' | 'unknown' | 'disposable' | 'risky';
  provider: string;
  rawData: Record<string, unknown>;
}

// ─── Trigger/Signal ──────────────────────────────────────────────────────────

export interface TriggerEvent {
  companyDomain: string;
  type: string;
  headline: string;
  sourceUrl: string | null;
  detectedAt: string;
  rawData: Record<string, unknown>;
}

// ─── Provider Client Interface ───────────────────────────────────────────────

export interface CompanySearchProvider {
  searchCompanies(query: string, options?: Record<string, unknown>): Promise<CompanySearchResult[]>;
}

export interface ContactSearchProvider {
  searchContacts(companyId: string, roles: RoleFilter): Promise<ContactSearchResult[]>;
}

export interface ContactEnrichmentProvider {
  enrichContact(contact: { email?: string; linkedinUrl?: string; firstName?: string; lastName?: string; companyDomain?: string }): Promise<ContactEnrichmentResult>;
}

export interface EmailVerificationProvider {
  verifyEmail(email: string): Promise<EmailVerificationResult>;
  verifyEmails(emails: string[]): Promise<EmailVerificationResult[]>;
}

export interface TriggerDetectionProvider {
  detectTriggers(companyDomain: string, triggerTypes?: string[]): Promise<TriggerEvent[]>;
}

// ─── Role Filter ─────────────────────────────────────────────────────────────

export interface RoleFilter {
  titles: string[];
  seniorities?: string[];
  departments?: string[];
}
