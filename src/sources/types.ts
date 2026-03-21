/**
 * Core types for the company sourcing system.
 * Strategy-based architecture: each strategy discovers and extracts
 * companies using a different method (APIs, WebSearch, WebFetch).
 */

export interface SourceSearchParams {
  projectId: string;
  industries: string[];
  geographies: string[];       // ISO country codes
  keywords: string[];
  exclusionKeywords?: string[];
  companyTypes?: string[];     // private, public, etc.
  minEmployees?: number;
  maxEmployees?: number;
}

export interface RawCompanyRecord {
  sourceName: string;          // e.g. "companies-house", "crunchbase-public"
  sourceStrategy: string;      // e.g. "government-registries", "public-profiles"
  sourceId: string;            // unique ID within source (company number, URL, etc.)
  sourceUrl?: string;          // URL where this record was found

  // Core identity
  name: string;
  registrationNumber?: string;
  jurisdiction?: string;       // ISO country code

  // Basic info
  website?: string;
  description?: string;
  industry?: string;
  sicCodes?: string[];
  employeeCount?: number;
  foundedYear?: number;
  companyType?: string;        // private, public, subsidiary, etc.
  status?: string;             // active, dissolved, etc.

  // Address
  addressLine1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;

  // Raw data from source (preserved for merge decisions)
  rawData: Record<string, unknown>;
}

export type StrategyName =
  | 'government-registries'
  | 'opencorporates'
  | 'wikidata'
  | 'sec-edgar'
  | 'trade-associations'
  | 'conferences-events'
  | 'awards-rankings'
  | 'funding-databases'
  | 'regulatory-registers'
  | 'industry-directories'
  | 'public-profiles'
  | 'tech-stack'
  | 'procurement'
  | 'patent-trademark'
  | 'gap-fill'
  | 'bulk-csv-import';

export interface StrategyConfig {
  name: StrategyName;
  description: string;
  method: 'api' | 'websearch' | 'hybrid';
  /** Estimated records per run for a typical industry/geography */
  expectedYield: string;
  /** Sources this strategy typically hits */
  typicalSources: SourceInfo[];
}

export interface SourceInfo {
  name: string;
  url: string;
  coverage: string;            // geographic coverage
  accessMethod: 'api' | 'web-fetch' | 'web-search' | 'bulk-download';
  rateLimit?: string;
  apiKeyRequired: boolean;
  freeAccess: boolean;
  dataFields: string[];
  antiBot: 'none' | 'low' | 'moderate' | 'heavy' | 'extreme';
  notes?: string;
}

export interface StrategyResult {
  strategyName: StrategyName;
  sourcesQueried: string[];
  recordsFound: number;
  recordsInserted: number;
  recordsDuplicate: number;
  errors: StrategyError[];
  durationMs: number;
}

export interface StrategyError {
  source: string;
  message: string;
  recoverable: boolean;
}
