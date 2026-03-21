/**
 * Comprehensive catalog of free data sources for company discovery.
 * Organized by strategy — each strategy uses one or more sources.
 *
 * This catalog serves as the reference for strategy agents:
 * - API sources are called directly with structured queries
 * - WebSearch sources are discovered dynamically per industry/geography
 * - WebFetch sources have known URL patterns for extraction
 *
 * All sources are FREE. No paid databases or logins required.
 */

import type { SourceInfo, StrategyConfig } from './types.js';

// ─── Government Registries ─────────────────────────────────────────────────

const GOVERNMENT_REGISTRIES: SourceInfo[] = [
  {
    name: 'Companies House UK',
    url: 'https://api.company-information.service.gov.uk',
    coverage: 'UK',
    accessMethod: 'api',
    rateLimit: '600 requests / 5 minutes',
    apiKeyRequired: true,
    freeAccess: true,
    dataFields: ['name', 'number', 'sic_codes', 'address', 'status', 'incorporation_date', 'officers', 'accounts'],
    antiBot: 'none',
    notes: 'Free API key from developer.company-information.service.gov.uk. Bulk data download also available at download.companieshouse.gov.uk',
  },
  {
    name: 'Companies House Bulk Data',
    url: 'https://download.companieshouse.gov.uk/en_output.html',
    coverage: 'UK',
    accessMethod: 'bulk-download',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'number', 'address', 'sic_codes', 'status', 'accounts_category'],
    antiBot: 'none',
    notes: 'CSV snapshots of all UK companies. ~5M active companies. Updated monthly.',
  },
  {
    name: 'SEC EDGAR',
    url: 'https://data.sec.gov',
    coverage: 'US (public companies)',
    accessMethod: 'api',
    rateLimit: '10 requests/second',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'cik', 'ticker', 'sic_code', 'state', 'filings', 'xbrl_financials'],
    antiBot: 'none',
    notes: 'Must include User-Agent header with contact email. company_tickers.json has all public companies. XBRL company facts API for financials.',
  },
  {
    name: 'GLEIF (Global LEI Foundation)',
    url: 'https://api.gleif.org/api/v1',
    coverage: 'Global (2.4M+ entities)',
    accessMethod: 'api',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['legal_name', 'lei', 'jurisdiction', 'address', 'entity_status', 'registration_authority'],
    antiBot: 'none',
    notes: 'Legal Entity Identifiers. Excellent for financial institutions and large corporations.',
  },
  {
    name: 'EU Business Registers (BRIS)',
    url: 'https://e-justice.europa.eu/489/EN/business_registers__search_for_a_company_in_the_eu',
    coverage: 'EU member states',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'registration_number', 'country', 'status'],
    antiBot: 'moderate',
    notes: 'Interconnection of EU business registers. Individual country registers may have better APIs.',
  },
  {
    name: 'Australian Business Register (ABN Lookup)',
    url: 'https://abr.business.gov.au/abrxmlsearch/AbrXmlSearch.asmx',
    coverage: 'Australia',
    accessMethod: 'api',
    apiKeyRequired: true,
    freeAccess: true,
    dataFields: ['name', 'abn', 'entity_type', 'state', 'postcode', 'status'],
    antiBot: 'none',
    notes: 'Free GUID-based API key. SOAP XML API.',
  },
  {
    name: 'New Zealand Companies Office',
    url: 'https://app.companiesoffice.govt.nz/companies/app/ui/pages/companies/search',
    coverage: 'New Zealand',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'number', 'status', 'incorporation_date', 'address'],
    antiBot: 'low',
  },
  {
    name: 'Hong Kong Companies Registry (ICRIS)',
    url: 'https://www.icris.cr.gov.hk/csci/',
    coverage: 'Hong Kong',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'number', 'status', 'incorporation_date'],
    antiBot: 'moderate',
  },
  {
    name: 'Singapore ACRA (BizFile)',
    url: 'https://www.bizfile.gov.sg',
    coverage: 'Singapore',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'uen', 'status', 'entity_type'],
    antiBot: 'moderate',
  },
  {
    name: 'India MCA (Ministry of Corporate Affairs)',
    url: 'https://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do',
    coverage: 'India',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'cin', 'status', 'category', 'state'],
    antiBot: 'moderate',
  },
  {
    name: 'German Handelsregister',
    url: 'https://www.handelsregister.de',
    coverage: 'Germany',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'court', 'registration_number', 'status', 'address'],
    antiBot: 'moderate',
  },
  {
    name: 'French Registre du Commerce (Pappers)',
    url: 'https://www.pappers.fr',
    coverage: 'France',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'siren', 'address', 'activity_code', 'revenue', 'employees'],
    antiBot: 'low',
    notes: 'Pappers provides free access to French company data from official registers.',
  },
  {
    name: 'Canadian Corporations (ISED)',
    url: 'https://ised-isde.canada.ca/cc/lgcy/fdrlCrpSrch.html',
    coverage: 'Canada (federal)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'corporation_number', 'status', 'jurisdiction'],
    antiBot: 'low',
  },
];

// ─── Aggregator APIs ────────────────────────────────────────────────────────

const AGGREGATOR_SOURCES: SourceInfo[] = [
  {
    name: 'OpenCorporates',
    url: 'https://api.opencorporates.com/v0.4',
    coverage: 'Global (200+ jurisdictions, 200M+ companies)',
    accessMethod: 'api',
    rateLimit: 'Generous for public benefit use',
    apiKeyRequired: true,
    freeAccess: true,
    dataFields: ['name', 'company_number', 'jurisdiction', 'status', 'address', 'officers', 'industry_codes'],
    antiBot: 'none',
    notes: 'Largest open database of companies. Free for public benefit. API token from registration.',
  },
  {
    name: 'Wikidata SPARQL',
    url: 'https://query.wikidata.org/sparql',
    coverage: 'Global (notable companies)',
    accessMethod: 'api',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'country', 'industry', 'inception_date', 'revenue', 'employees', 'website', 'identifiers'],
    antiBot: 'none',
    notes: 'SPARQL endpoint. Use format=json. Great for enrichment data on well-known companies. ~1M company entities.',
  },
];

// ─── Funding & Startup Databases ────────────────────────────────────────────

const FUNDING_SOURCES: SourceInfo[] = [
  {
    name: 'Crunchbase (public pages)',
    url: 'https://www.crunchbase.com/organization/',
    coverage: 'Global (tech/startups focus)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['name', 'description', 'location', 'founding_date', 'funding_total', 'employee_range', 'social_links'],
    antiBot: 'moderate',
    notes: 'Public org pages have data in embedded JSON. Free Basic API (200 calls/min) gives limited fields.',
  },
  {
    name: 'CORDIS (EU Research Projects)',
    url: 'https://cordis.europa.eu/search',
    coverage: 'EU (Horizon Europe, FP7, H2020 funded)',
    accessMethod: 'api',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['organization_name', 'country', 'project_title', 'funding_amount', 'activity_type'],
    antiBot: 'none',
    notes: 'EU-funded research projects. Excellent for deep-tech, biotech, cleantech companies in EU.',
  },
  {
    name: 'SBIR/STTR (US)',
    url: 'https://www.sbir.gov/api',
    coverage: 'US (small businesses with federal R&D funding)',
    accessMethod: 'api',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['company_name', 'address', 'award_amount', 'agency', 'abstract', 'year'],
    antiBot: 'none',
    notes: 'US Small Business Innovation Research. Great for US tech/science startups.',
  },
  {
    name: 'Innovate UK (Gateway to Research)',
    url: 'https://gtr.ukri.org/search/project',
    coverage: 'UK',
    accessMethod: 'api',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['organization_name', 'project_title', 'funding_amount', 'sector'],
    antiBot: 'none',
    notes: 'UK-funded innovation projects. RESTful API available.',
  },
  {
    name: 'EU Open Data Portal',
    url: 'https://data.europa.eu/api/hub/search/',
    coverage: 'EU',
    accessMethod: 'api',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['varies by dataset'],
    antiBot: 'none',
    notes: 'Search for business/company datasets. Contains startup ecosystems, SME data, etc.',
  },
];

// ─── Public Profile / Directory Sources ─────────────────────────────────────

const PUBLIC_PROFILE_SOURCES: SourceInfo[] = [
  {
    name: 'BuiltWith (free API)',
    url: 'https://api.builtwith.com/free1/api.json',
    coverage: 'Global (673M+ websites)',
    accessMethod: 'api',
    rateLimit: '1 request/second',
    apiKeyRequired: true,
    freeAccess: true,
    dataFields: ['domain', 'technology_groups', 'technology_categories', 'last_updated'],
    antiBot: 'none',
    notes: 'Free tier gives tech group counts. Reverse lookup (find sites by tech) requires paid plan, but WebSearch "builtwith.com {technology}" works.',
  },
  {
    name: 'Trustpilot (public pages)',
    url: 'https://www.trustpilot.com/review/',
    coverage: 'Global (strongest EU)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['company_name', 'trust_score', 'review_count', 'category', 'website'],
    antiBot: 'low',
    notes: 'Next.js app — all data in __NEXT_DATA__ JSON script tag. Easy to parse.',
  },
  {
    name: 'G2 (public pages)',
    url: 'https://www.g2.com/products/',
    coverage: 'Global (software companies)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['product_name', 'company_name', 'rating', 'review_count', 'category', 'pricing'],
    antiBot: 'low',
    notes: 'Category pages list all products. SEO-optimized, mostly server-rendered.',
  },
  {
    name: 'Capterra (public pages)',
    url: 'https://www.capterra.com/software/',
    coverage: 'Global (software companies)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['product_name', 'company_name', 'rating', 'review_count', 'pricing', 'features'],
    antiBot: 'low',
    notes: '100K+ products, 900+ categories. Country-specific domains available.',
  },
  {
    name: 'Clutch.co',
    url: 'https://clutch.co/directory',
    coverage: 'Global (B2B service companies)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['company_name', 'location', 'employees', 'hourly_rate', 'rating', 'services'],
    antiBot: 'low',
    notes: 'B2B service provider directory. Excellent for agencies, consultancies, dev shops.',
  },
  {
    name: 'ProductHunt',
    url: 'https://www.producthunt.com',
    coverage: 'Global (tech startups)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['product_name', 'tagline', 'website', 'topics', 'upvotes'],
    antiBot: 'low',
    notes: 'Great for finding early-stage tech companies. GraphQL API also available.',
  },
  {
    name: 'ZoomInfo (public pages)',
    url: 'https://www.zoominfo.com/c/',
    coverage: 'Global',
    accessMethod: 'web-search',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['company_name', 'description', 'revenue_range', 'employee_count', 'industry', 'technologies'],
    antiBot: 'extreme',
    notes: 'Public company profiles indexed by Google. Use WebSearch "site:zoominfo.com/c/ {keyword}" to discover. Direct fetch blocked by Cloudflare.',
  },
  {
    name: 'Apollo.io (public pages)',
    url: 'https://www.apollo.io/companies/',
    coverage: 'Global',
    accessMethod: 'web-search',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['company_name', 'description', 'employees', 'revenue', 'tech_stack'],
    antiBot: 'heavy',
    notes: '700K+ SEO pages indexed by Google. Use WebSearch to discover. Direct fetch may 403.',
  },
  {
    name: 'Owler (public pages)',
    url: 'https://www.owler.com/company/',
    coverage: 'Global (20M+ companies)',
    accessMethod: 'web-search',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['company_name', 'revenue_estimate', 'employees', 'competitors', 'funding'],
    antiBot: 'moderate',
    notes: 'Crowdsourced competitive intelligence. Public profiles have revenue estimates.',
  },
];

// ─── Regulatory Registers ───────────────────────────────────────────────────

const REGULATORY_SOURCES: SourceInfo[] = [
  {
    name: 'FCA Register (UK)',
    url: 'https://register.fca.org.uk/s/',
    coverage: 'UK (financial services)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['firm_name', 'frn', 'status', 'permissions', 'address'],
    antiBot: 'low',
  },
  {
    name: 'FDA Establishment Registration (US)',
    url: 'https://www.accessdata.fda.gov/scripts/cdrh/cfdocs/cfRL/rl.cfm',
    coverage: 'US (medical devices, pharma)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['establishment_name', 'address', 'registration_number', 'device_types'],
    antiBot: 'low',
  },
  {
    name: 'BaFin Register (Germany)',
    url: 'https://portal.mvp.bafin.de/database/InstInfo/',
    coverage: 'Germany (financial services)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['institution_name', 'type', 'status', 'address'],
    antiBot: 'low',
  },
  {
    name: 'ESMA Registers (EU)',
    url: 'https://www.esma.europa.eu/databases-library/registers-and-data',
    coverage: 'EU (financial services)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['firm_name', 'country', 'authorization_type', 'status'],
    antiBot: 'low',
  },
];

// ─── Patent & Trademark ────────────────────────────────────────────────────

const PATENT_SOURCES: SourceInfo[] = [
  {
    name: 'USPTO Patent Full-Text (PatFT)',
    url: 'https://patft.uspto.gov/netahtml/PTO/search-adv.htm',
    coverage: 'US',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['assignee_name', 'patent_number', 'title', 'filing_date'],
    antiBot: 'low',
  },
  {
    name: 'EPO Open Patent Services',
    url: 'https://ops.epo.org',
    coverage: 'Global (EPO, PCT, national patents)',
    accessMethod: 'api',
    apiKeyRequired: true,
    freeAccess: true,
    dataFields: ['applicant_name', 'country', 'patent_number', 'title', 'classification'],
    antiBot: 'none',
    notes: 'Free registration. Fair use: 4GB/week download.',
  },
  {
    name: 'Google Patents',
    url: 'https://patents.google.com',
    coverage: 'Global',
    accessMethod: 'web-search',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['assignee_name', 'patent_number', 'title', 'classification'],
    antiBot: 'low',
  },
  {
    name: 'WIPO Global Brand Database',
    url: 'https://branddb.wipo.int/en',
    coverage: 'Global (trademarks)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['owner_name', 'country', 'mark_name', 'nice_classification', 'status'],
    antiBot: 'low',
  },
];

// ─── Procurement / Tenders ──────────────────────────────────────────────────

const PROCUREMENT_SOURCES: SourceInfo[] = [
  {
    name: 'TED (Tenders Electronic Daily)',
    url: 'https://ted.europa.eu/en/',
    coverage: 'EU (public procurement)',
    accessMethod: 'api',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['contractor_name', 'country', 'contract_value', 'cpv_codes', 'buyer'],
    antiBot: 'none',
    notes: 'EU public procurement notices. Search API available. Excellent for finding B2B/B2G companies.',
  },
  {
    name: 'SAM.gov (US)',
    url: 'https://api.sam.gov/entity-information/v3/entities',
    coverage: 'US (government contractors)',
    accessMethod: 'api',
    apiKeyRequired: true,
    freeAccess: true,
    dataFields: ['legal_business_name', 'duns', 'cage_code', 'naics_codes', 'address', 'entity_type'],
    antiBot: 'none',
    notes: 'Free API key. All US government contractors must register here.',
  },
  {
    name: 'Contracts Finder (UK)',
    url: 'https://www.contractsfinder.service.gov.uk/Search/Results',
    coverage: 'UK (public procurement)',
    accessMethod: 'web-fetch',
    apiKeyRequired: false,
    freeAccess: true,
    dataFields: ['supplier_name', 'contract_value', 'buyer', 'category'],
    antiBot: 'low',
  },
];

// ─── Dynamic Discovery Sources (WebSearch-based) ───────────────────────────

const DYNAMIC_DISCOVERY_PATTERNS = {
  tradeAssociations: {
    searchPatterns: [
      '"{industry}" trade association members list',
      '"{industry}" professional body directory',
      '"{industry}" industry association {country}',
      '"{industry}" chamber of commerce members',
    ],
    extractionNotes: 'Member directories often as HTML tables, PDFs, or paginated lists. Look for /members, /directory, /our-members URLs.',
  },
  conferences: {
    searchPatterns: [
      '"{industry}" conference 2025 exhibitors list',
      '"{industry}" summit 2025 sponsors',
      '"{industry}" expo exhibitor directory',
      '"{industry}" trade show {country} companies',
    ],
    extractionNotes: 'Exhibitor pages often have company name + booth number + description. Some behind JavaScript (use WebFetch). Conference sponsors are high-quality targets.',
  },
  awards: {
    searchPatterns: [
      '"{industry}" awards 2025 winners',
      '"{industry}" fastest growing companies',
      '"{industry}" top 100 companies {country}',
      'Deloitte Fast 50 {country} "{industry}"',
      'Inc 5000 "{industry}"',
      'FT 1000 fastest growing "{industry}"',
      'Forbes "{industry}" companies',
      'Gartner Magic Quadrant "{industry}"',
    ],
    extractionNotes: 'Award lists are curated, high-quality company sets. Usually HTML tables or articles.',
  },
  industryDirectories: {
    searchPatterns: [
      '"{industry}" company directory',
      '"{industry}" vendors list',
      '"{industry}" suppliers directory {country}',
      '"{industry}" marketplace companies',
      '"{industry}" ecosystem map',
    ],
    extractionNotes: 'Niche directories exist for nearly every industry. Often the best source of SMB companies.',
  },
};

// ─── Strategy Configurations ────────────────────────────────────────────────

export const STRATEGY_CATALOG: StrategyConfig[] = [
  {
    name: 'government-registries',
    description: 'Query official government company registers by SIC/NAICS codes and geography',
    method: 'api',
    expectedYield: '1,000-50,000 per country',
    typicalSources: GOVERNMENT_REGISTRIES,
  },
  {
    name: 'opencorporates',
    description: 'Search OpenCorporates aggregated database across 200+ jurisdictions',
    method: 'api',
    expectedYield: '500-20,000 per query',
    typicalSources: AGGREGATOR_SOURCES.filter(s => s.name === 'OpenCorporates'),
  },
  {
    name: 'wikidata',
    description: 'SPARQL queries on Wikidata for companies by country and industry classification',
    method: 'api',
    expectedYield: '100-5,000 per query',
    typicalSources: AGGREGATOR_SOURCES.filter(s => s.name === 'Wikidata SPARQL'),
  },
  {
    name: 'sec-edgar',
    description: 'Search SEC EDGAR for US public companies by SIC code, with XBRL financials',
    method: 'api',
    expectedYield: '50-2,000 per SIC code',
    typicalSources: GOVERNMENT_REGISTRIES.filter(s => s.name === 'SEC EDGAR'),
  },
  {
    name: 'trade-associations',
    description: 'WebSearch for trade/professional associations → extract member directories',
    method: 'websearch',
    expectedYield: '200-5,000 per industry',
    typicalSources: [],  // Discovered dynamically
  },
  {
    name: 'conferences-events',
    description: 'WebSearch for industry conferences/expos → extract exhibitor and sponsor lists',
    method: 'websearch',
    expectedYield: '100-3,000 per industry',
    typicalSources: [],
  },
  {
    name: 'awards-rankings',
    description: 'WebSearch for industry awards, rankings, top-N lists → extract company names',
    method: 'websearch',
    expectedYield: '200-2,000 per industry',
    typicalSources: [],
  },
  {
    name: 'funding-databases',
    description: 'Query free funding/grant databases for companies that received R&D funding',
    method: 'hybrid',
    expectedYield: '100-5,000 per industry/geography',
    typicalSources: FUNDING_SOURCES,
  },
  {
    name: 'regulatory-registers',
    description: 'WebSearch for industry regulators → extract registered entity lists',
    method: 'hybrid',
    expectedYield: '100-10,000 per regulator',
    typicalSources: REGULATORY_SOURCES,
  },
  {
    name: 'industry-directories',
    description: 'WebSearch for niche industry directories, vendor lists, ecosystem maps',
    method: 'websearch',
    expectedYield: '200-5,000 per directory',
    typicalSources: [...PUBLIC_PROFILE_SOURCES.filter(s => ['Clutch.co', 'ProductHunt'].includes(s.name))],
  },
  {
    name: 'public-profiles',
    description: 'WebSearch for indexed company profiles on ZoomInfo, Apollo, Crunchbase, Owler, G2',
    method: 'websearch',
    expectedYield: '500-10,000 per platform',
    typicalSources: PUBLIC_PROFILE_SOURCES.filter(s => ['ZoomInfo (public pages)', 'Apollo.io (public pages)', 'Crunchbase (public pages)', 'Owler (public pages)', 'G2 (public pages)'].includes(s.name)),
  },
  {
    name: 'tech-stack',
    description: 'Use BuiltWith free API + WebSearch to find companies by technology stack',
    method: 'hybrid',
    expectedYield: '100-5,000 per technology',
    typicalSources: PUBLIC_PROFILE_SOURCES.filter(s => s.name === 'BuiltWith (free API)'),
  },
  {
    name: 'procurement',
    description: 'Search public procurement/tender databases for active contractor companies',
    method: 'hybrid',
    expectedYield: '200-10,000 per geography',
    typicalSources: PROCUREMENT_SOURCES,
  },
  {
    name: 'patent-trademark',
    description: 'Search patent and trademark databases for applicant/assignee companies',
    method: 'hybrid',
    expectedYield: '100-5,000 per technology area',
    typicalSources: PATENT_SOURCES,
  },
  {
    name: 'gap-fill',
    description: 'Targeted deep search for sub-sectors with thin coverage. Adapts strategy based on what is missing.',
    method: 'websearch',
    expectedYield: 'Variable',
    typicalSources: [],
  },
];

export const DYNAMIC_PATTERNS = DYNAMIC_DISCOVERY_PATTERNS;

/**
 * Get all sources across all strategies.
 */
export function getAllSources(): SourceInfo[] {
  const seen = new Set<string>();
  const all: SourceInfo[] = [];
  for (const strategy of STRATEGY_CATALOG) {
    for (const source of strategy.typicalSources) {
      if (!seen.has(source.name)) {
        seen.add(source.name);
        all.push(source);
      }
    }
  }
  return all;
}

/**
 * Get strategies relevant for a given geography.
 */
export function getStrategiesForGeography(countryCode: string): StrategyConfig[] {
  return STRATEGY_CATALOG.filter(strategy => {
    // WebSearch-based strategies work for any geography
    if (strategy.method === 'websearch') return true;
    // API strategies: check if any source covers this geography
    return strategy.typicalSources.some(s =>
      s.coverage.includes('Global') ||
      s.coverage.includes(countryCode) ||
      (countryCode === 'US' && s.coverage.includes('US')) ||
      (countryCode === 'GB' && s.coverage.includes('UK'))
    );
  });
}
