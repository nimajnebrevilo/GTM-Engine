/**
 * Anti-bot resilience and adaptive fetching strategies.
 *
 * Key principle: when direct fetching fails, the system cascades through
 * alternative extraction methods rather than giving up. The agents should
 * never be blocked permanently — there's always a fallback path.
 *
 * Resilience hierarchy (cheapest → most effort):
 * 1. Direct API call (structured, reliable, fastest)
 * 2. Direct HTTP fetch with browser-like headers
 * 3. Google cache / Wayback Machine for blocked pages
 * 4. WebSearch index extraction (Google already scraped it for us)
 * 5. Alternative source substitution (same data, different platform)
 * 6. LLM-assisted extraction from search snippets
 */

export type FetchMethod =
  | 'direct-api'
  | 'browser-fetch'
  | 'google-cache'
  | 'wayback-machine'
  | 'search-index'
  | 'alternative-source'
  | 'snippet-extraction';

export interface FetchAttempt {
  method: FetchMethod;
  url: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  durationMs: number;
}

export interface ResilientFetchResult {
  content: string | null;
  method: FetchMethod;
  attempts: FetchAttempt[];
  blocked: boolean;
}

/**
 * Browser-like request headers that reduce bot detection.
 * Rotated per request to avoid fingerprinting.
 */
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

function getBrowserHeaders(): Record<string, string> {
  return {
    'User-Agent': getRandomUserAgent(),
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Accept-Encoding': 'gzip, deflate, br',
    'DNT': '1',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Cache-Control': 'max-age=0',
  };
}

/**
 * Adaptive delay between requests to a single domain.
 * Starts conservative and backs off further if blocked.
 */
export interface AdaptiveThrottleConfig {
  /** Base delay between requests in ms */
  baseDelayMs: number;
  /** Multiply delay by this factor after each block/429 */
  backoffMultiplier: number;
  /** Maximum delay in ms */
  maxDelayMs: number;
  /** Add random jitter up to this percentage of delay */
  jitterPercent: number;
}

export const THROTTLE_PROFILES: Record<string, AdaptiveThrottleConfig> = {
  // For APIs with known rate limits
  'api-generous': { baseDelayMs: 100, backoffMultiplier: 2, maxDelayMs: 5000, jitterPercent: 20 },
  'api-strict': { baseDelayMs: 500, backoffMultiplier: 2, maxDelayMs: 30000, jitterPercent: 30 },
  // For web fetching with low bot protection
  'web-easy': { baseDelayMs: 1000, backoffMultiplier: 2, maxDelayMs: 10000, jitterPercent: 40 },
  // For web fetching with moderate bot protection
  'web-moderate': { baseDelayMs: 2000, backoffMultiplier: 3, maxDelayMs: 30000, jitterPercent: 50 },
  // For web fetching with heavy bot protection — use search index fallback instead
  'web-heavy': { baseDelayMs: 5000, backoffMultiplier: 3, maxDelayMs: 60000, jitterPercent: 60 },
};

export function getThrottledDelay(config: AdaptiveThrottleConfig, consecutiveFailures: number): number {
  const base = config.baseDelayMs * Math.pow(config.backoffMultiplier, consecutiveFailures);
  const capped = Math.min(base, config.maxDelayMs);
  const jitter = capped * (config.jitterPercent / 100) * Math.random();
  return capped + jitter;
}

/**
 * Alternative source mapping.
 * When one source is blocked, route to an equivalent source.
 */
export const SOURCE_ALTERNATIVES: Record<string, string[]> = {
  // If ZoomInfo blocks us, use these for the same company data
  'zoominfo.com': ['apollo.io', 'owler.com', 'crunchbase.com'],
  'apollo.io': ['zoominfo.com', 'owler.com', 'crunchbase.com'],
  'owler.com': ['crunchbase.com', 'zoominfo.com', 'apollo.io'],
  'crunchbase.com': ['owler.com', 'apollo.io', 'zoominfo.com'],
  // If G2 blocks, use these for software company data
  'g2.com': ['capterra.com', 'trustradius.com', 'getapp.com'],
  'capterra.com': ['g2.com', 'trustradius.com', 'getapp.com'],
  // If Glassdoor blocks, use these for company profile data
  'glassdoor.com': ['indeed.com', 'comparably.com'],
};

/**
 * Google Cache URL for a given URL.
 * Google caches most indexed pages — useful when the original blocks bots.
 */
export function getGoogleCacheUrl(originalUrl: string): string {
  return `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(originalUrl)}`;
}

/**
 * Wayback Machine URL for a given URL.
 * Internet Archive captures snapshots — useful for pages that block bots.
 */
export function getWaybackUrl(originalUrl: string): string {
  return `https://web.archive.org/web/2024/${originalUrl}`;
}

/**
 * WebSearch-based extraction patterns.
 * Instead of fetching a blocked site directly, we search for its content
 * via Google, which has already indexed it for us.
 *
 * The search snippets often contain the key data we need (company name,
 * description, size, location) without ever touching the blocked site.
 */
export const SEARCH_INDEX_PATTERNS: Record<string, string[]> = {
  // Find company profiles on blocked platforms via Google index
  'zoominfo-company': [
    'site:zoominfo.com/c/ "{company_name}"',
    'site:zoominfo.com "{company_name}" revenue employees',
  ],
  'apollo-company': [
    'site:apollo.io/companies/ "{company_name}"',
  ],
  'linkedin-company': [
    'site:linkedin.com/company/ "{company_name}"',
    '"{company_name}" linkedin company',
  ],
  'glassdoor-company': [
    'site:glassdoor.com "{company_name}" reviews',
  ],
  // Find companies by industry on blocked platforms
  'zoominfo-industry': [
    'site:zoominfo.com/c/ "{industry}" "{country}"',
  ],
  'apollo-industry': [
    'site:apollo.io/companies "{industry}" "{country}"',
  ],
};

/**
 * Extraction hints for getting structured data from search snippets.
 * When we can't fetch the page, Google's snippet often has what we need.
 */
export interface SnippetExtractionHint {
  /** What to search for */
  searchQuery: string;
  /** Fields we expect to find in the snippet */
  expectedFields: string[];
  /** Regex patterns to extract structured data from snippets */
  extractionPatterns: Record<string, RegExp>;
}

export const SNIPPET_EXTRACTION: Record<string, Record<string, RegExp>> = {
  // Patterns for extracting data from ZoomInfo snippets
  zoominfo: {
    employees: /(\d[\d,]+)\s*(?:employees|staff|people)/i,
    revenue: /\$?([\d.]+)\s*(?:M|B|million|billion)\s*(?:revenue|annual)/i,
    industry: /Industry:\s*([^.]+)/i,
    location: /(?:headquartered|based|located)\s+in\s+([^.]+)/i,
  },
  // Patterns for extracting data from LinkedIn snippets
  linkedin: {
    employees: /(\d[\d,]+)\s*(?:employees|followers)/i,
    industry: /(?:Industry|Sector):\s*([^.·]+)/i,
    location: /([A-Z][a-z]+(?:\s[A-Z][a-z]+)*,\s*[A-Z][a-z]+)/,
  },
  // Patterns for extracting data from Crunchbase snippets
  crunchbase: {
    funding: /(?:raised|funding)\s*\$?([\d.]+)\s*(?:M|B|K|million|billion|thousand)/i,
    employees: /(\d[\d,-]+)\s*(?:employees)/i,
    founded: /(?:founded|est\.?)\s*(?:in\s+)?(\d{4})/i,
  },
};

/**
 * Domain-level block tracking.
 * If a domain has blocked us N times, skip it and use alternatives.
 */
export class BlockTracker {
  private blocks = new Map<string, { count: number; lastBlockedAt: number }>();
  private readonly maxBlocks: number;
  private readonly cooldownMs: number;

  constructor(maxBlocks = 3, cooldownMs = 300000) {
    this.maxBlocks = maxBlocks;
    this.cooldownMs = cooldownMs;
  }

  recordBlock(domain: string): void {
    const existing = this.blocks.get(domain) ?? { count: 0, lastBlockedAt: 0 };
    this.blocks.set(domain, {
      count: existing.count + 1,
      lastBlockedAt: Date.now(),
    });
  }

  isBlocked(domain: string): boolean {
    const record = this.blocks.get(domain);
    if (!record) return false;
    // Reset after cooldown
    if (Date.now() - record.lastBlockedAt > this.cooldownMs) {
      this.blocks.delete(domain);
      return false;
    }
    return record.count >= this.maxBlocks;
  }

  getAlternatives(domain: string): string[] {
    return SOURCE_ALTERNATIVES[domain] ?? [];
  }
}

/**
 * Decide the best fetch strategy for a given source.
 */
export function chooseFetchStrategy(
  sourceName: string,
  antiBot: 'none' | 'low' | 'moderate' | 'heavy' | 'extreme',
  blockTracker: BlockTracker,
): FetchMethod[] {
  const domain = sourceName.toLowerCase();

  // If previously blocked, skip to search index
  if (blockTracker.isBlocked(domain)) {
    return ['search-index', 'google-cache', 'alternative-source'];
  }

  switch (antiBot) {
    case 'none':
      return ['direct-api'];
    case 'low':
      return ['browser-fetch', 'google-cache'];
    case 'moderate':
      return ['browser-fetch', 'google-cache', 'wayback-machine', 'search-index'];
    case 'heavy':
      return ['search-index', 'google-cache', 'wayback-machine', 'alternative-source'];
    case 'extreme':
      // Don't even try direct fetch — go straight to search index
      return ['search-index', 'snippet-extraction', 'alternative-source'];
    default:
      return ['browser-fetch', 'search-index'];
  }
}

/**
 * Attempt to fetch content using the resilience cascade.
 * Tries each method in order until one succeeds.
 */
export async function resilientFetch(
  url: string,
  methods: FetchMethod[],
  blockTracker: BlockTracker,
): Promise<ResilientFetchResult> {
  const attempts: FetchAttempt[] = [];
  const domain = new URL(url).hostname;

  for (const method of methods) {
    const start = Date.now();
    let attempt: FetchAttempt;

    try {
      switch (method) {
        case 'direct-api':
        case 'browser-fetch': {
          const headers = method === 'browser-fetch' ? getBrowserHeaders() : {};
          const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });

          if (response.ok) {
            const content = await response.text();
            attempt = { method, url, success: true, statusCode: response.status, durationMs: Date.now() - start };
            attempts.push(attempt);
            return { content, method, attempts, blocked: false };
          }

          // Track blocks
          if (response.status === 403 || response.status === 429 || response.status === 503) {
            blockTracker.recordBlock(domain);
          }

          attempt = { method, url, success: false, statusCode: response.status, durationMs: Date.now() - start };
          attempts.push(attempt);
          break;
        }

        case 'google-cache': {
          const cacheUrl = getGoogleCacheUrl(url);
          const response = await fetch(cacheUrl, { headers: getBrowserHeaders(), signal: AbortSignal.timeout(15000) });

          if (response.ok) {
            const content = await response.text();
            attempt = { method, url: cacheUrl, success: true, statusCode: response.status, durationMs: Date.now() - start };
            attempts.push(attempt);
            return { content, method, attempts, blocked: false };
          }

          attempt = { method, url: cacheUrl, success: false, statusCode: response.status, durationMs: Date.now() - start };
          attempts.push(attempt);
          break;
        }

        case 'wayback-machine': {
          const waybackUrl = getWaybackUrl(url);
          const response = await fetch(waybackUrl, { headers: getBrowserHeaders(), signal: AbortSignal.timeout(15000) });

          if (response.ok) {
            const content = await response.text();
            attempt = { method, url: waybackUrl, success: true, statusCode: response.status, durationMs: Date.now() - start };
            attempts.push(attempt);
            return { content, method, attempts, blocked: false };
          }

          attempt = { method, url: waybackUrl, success: false, statusCode: response.status, durationMs: Date.now() - start };
          attempts.push(attempt);
          break;
        }

        case 'search-index':
        case 'snippet-extraction':
        case 'alternative-source': {
          // These methods require Claude orchestration (WebSearch/WebFetch tools)
          // and cannot be executed purely in TypeScript. The strategy agent
          // handles these via the Claude Code tool interface.
          // Mark as needing orchestration.
          attempt = { method, url, success: false, error: 'requires-orchestration', durationMs: Date.now() - start };
          attempts.push(attempt);
          return { content: null, method, attempts, blocked: true };
        }
      }
    } catch (err) {
      attempt = {
        method,
        url,
        success: false,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - start,
      };
      attempts.push(attempt);
    }
  }

  return { content: null, method: methods[methods.length - 1], attempts, blocked: true };
}
