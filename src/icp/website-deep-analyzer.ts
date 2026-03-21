/**
 * Deep website analyzer for ICP challenge.
 *
 * Scrapes multiple pages (homepage, pricing, about, customers) and extracts
 * structured WebsiteAnalysis data used to challenge ICP assumptions.
 */

import { BlockTracker, chooseFetchStrategy, resilientFetch } from '../utils/resilience.js';
import type { WebsiteAnalysis } from './types.js';

const blockTracker = new BlockTracker();

// ---------------------------------------------------------------------------
// Page discovery
// ---------------------------------------------------------------------------

/** Common paths we probe to find key sections of a company's site. */
const DISCOVERY_PATHS = [
  '/pricing',
  '/about',
  '/about-us',
  '/customers',
  '/case-studies',
  '/solutions',
  '/product',
  '/why-us',
  '/for-enterprise',
  '/for-teams',
];

/**
 * Attempt to fetch a page — returns HTML or null on failure.
 */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const hostname = new URL(url).hostname;
    const methods = chooseFetchStrategy(hostname, 'low', blockTracker);
    const result = await resilientFetch(url, methods, blockTracker);
    return result.content;
  } catch {
    return null;
  }
}

/**
 * Discover which sub-pages exist and fetch them in parallel.
 */
async function discoverPages(baseUrl: string): Promise<Map<string, string>> {
  const base = baseUrl.replace(/\/+$/, '');
  const pages = new Map<string, string>();

  // Always fetch homepage
  const homepage = await fetchPage(base);
  if (homepage) pages.set('/', homepage);

  // Probe sub-pages in parallel (limit concurrency to avoid blocks)
  const probeResults = await Promise.allSettled(
    DISCOVERY_PATHS.map(async (path) => {
      const html = await fetchPage(`${base}${path}`);
      if (html && html.length > 500) {
        // Filter out 404 pages that return HTML shells
        const is404 = /404|not found|page not found/i.test(html.slice(0, 2000));
        if (!is404) return { path, html };
      }
      return null;
    }),
  );

  for (const result of probeResults) {
    if (result.status === 'fulfilled' && result.value) {
      pages.set(result.value.path, result.value.html);
    }
  }

  return pages;
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeroText(html: string): string {
  // Look for hero/banner sections or first h1
  const heroSection = html.match(
    /<(?:section|div)[^>]*class="[^"]*(?:hero|banner|jumbotron|masthead)[^"]*"[^>]*>([\s\S]*?)<\/(?:section|div)>/i,
  );
  if (heroSection) return stripHtml(heroSection[1]).slice(0, 500);

  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripHtml(h1[1]).slice(0, 300);

  return '';
}

function extractMetaDescription(html: string): string {
  const match =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  return match ? match[1].trim() : '';
}

function extractValueProposition(pages: Map<string, string>): string {
  const homepage = pages.get('/') ?? '';
  // Combine hero text + meta description
  const hero = extractHeroText(homepage);
  const meta = extractMetaDescription(homepage);
  return [hero, meta].filter(Boolean).join(' — ').slice(0, 800) || 'unknown';
}

function extractProductDescription(pages: Map<string, string>): string {
  // Check product/solutions/about pages
  for (const path of ['/product', '/solutions', '/about', '/about-us', '/']) {
    const html = pages.get(path);
    if (!html) continue;

    // Look for the main content area
    const mainContent = html.match(
      /<(?:main|article|section)[^>]*>([\s\S]*?)<\/(?:main|article|section)>/i,
    );
    if (mainContent) {
      const text = stripHtml(mainContent[1]).slice(0, 1000);
      if (text.length > 100) return text;
    }
  }

  // Fallback to OG description
  const homepage = pages.get('/') ?? '';
  const ogDesc = homepage.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']+)["']/i);
  return ogDesc ? ogDesc[1].trim() : '';
}

// ---------------------------------------------------------------------------
// Persona detection
// ---------------------------------------------------------------------------

const PERSONA_PATTERNS: Array<{ pattern: RegExp; persona: string }> = [
  { pattern: /\bfor\s+(?:sales|revenue)\s+teams?\b/i, persona: 'Sales / Revenue Teams' },
  { pattern: /\bfor\s+(?:marketing)\s+teams?\b/i, persona: 'Marketing Teams' },
  { pattern: /\bfor\s+(?:engineering|developers?|dev\s+teams?)\b/i, persona: 'Engineering / Developers' },
  { pattern: /\bfor\s+(?:product)\s+teams?\b/i, persona: 'Product Teams' },
  { pattern: /\bfor\s+(?:HR|human\s+resources|people\s+ops)\b/i, persona: 'HR / People Ops' },
  { pattern: /\bfor\s+(?:finance|CFO|accounting)\b/i, persona: 'Finance / Accounting' },
  { pattern: /\bfor\s+(?:IT|security|infosec|DevOps|SRE)\b/i, persona: 'IT / Security' },
  { pattern: /\bfor\s+(?:operations|ops)\s+teams?\b/i, persona: 'Operations' },
  { pattern: /\bfor\s+(?:customer\s+success|CS)\s+teams?\b/i, persona: 'Customer Success' },
  { pattern: /\bfor\s+(?:founders?|CEOs?|executives?|C-suite|leadership)\b/i, persona: 'Executives / Founders' },
  { pattern: /\bfor\s+(?:startups?|SMBs?|small\s+business)\b/i, persona: 'Startups / SMBs' },
  { pattern: /\benterprise\b/i, persona: 'Enterprise' },
  { pattern: /\bmid[- ]?market\b/i, persona: 'Mid-Market' },
];

function extractTargetPersonas(pages: Map<string, string>): string[] {
  const personas = new Set<string>();
  const allText = Array.from(pages.values()).join(' ');

  for (const { pattern, persona } of PERSONA_PATTERNS) {
    if (pattern.test(allText)) personas.add(persona);
  }

  // Also check nav / menu items for audience segments
  const navLinks = allText.match(/<a[^>]*href="[^"]*(?:for-|solution)[^"]*"[^>]*>([^<]+)</gi) ?? [];
  for (const link of navLinks) {
    const text = link.replace(/<[^>]+>/g, '').trim();
    if (text.length > 2 && text.length < 50) personas.add(text);
  }

  return Array.from(personas).slice(0, 10);
}

// ---------------------------------------------------------------------------
// Pricing signal detection
// ---------------------------------------------------------------------------

function extractPricingSignals(pages: Map<string, string>): WebsiteAnalysis['pricingSignals'] {
  const pricingHtml = pages.get('/pricing') ?? pages.get('/for-enterprise') ?? '';
  const allText = Array.from(pages.values()).join(' ');

  const signals = {
    enterprise: 0,
    midMarket: 0,
    smb: 0,
  };

  // Price-point indicators
  const priceMatches = [...allText.matchAll(/\$\s?([\d,]+)\s*(?:\/\s*(?:mo|month|yr|year|seat|user))/gi)];
  for (const m of priceMatches) {
    const price = parseInt(m[1].replace(/,/g, ''), 10);
    if (price > 500) signals.enterprise += 2;
    else if (price > 50) signals.midMarket += 2;
    else signals.smb += 2;
  }

  // Messaging indicators
  if (/\benterprise\s+(?:plan|tier|pricing|solution)/i.test(allText)) signals.enterprise += 3;
  if (/\bcustom\s+pricing|contact\s+(?:us|sales)\s+for\s+pricing/i.test(allText)) signals.enterprise += 2;
  if (/\bfree\s+(?:plan|tier|trial)\b/i.test(allText)) signals.smb += 2;
  if (/\bstarter\s+(?:plan|tier)\b/i.test(allText)) signals.smb += 1;
  if (/\bpro\s+(?:plan|tier)\b/i.test(allText)) signals.midMarket += 1;
  if (/\bbusiness\s+(?:plan|tier)\b/i.test(allText)) signals.midMarket += 2;
  if (/\bSOC\s*2|HIPAA|FedRAMP|ISO\s*27001/i.test(allText)) signals.enterprise += 2;
  if (/\bSSO|SAML|SCIM/i.test(allText)) signals.enterprise += 1;
  if (/\bself[- ]serve/i.test(allText)) signals.smb += 1;

  // Check if pricing page exists at all
  if (!pricingHtml && /contact\s+(?:us|sales)/i.test(allText)) signals.enterprise += 1;

  const total = signals.enterprise + signals.midMarket + signals.smb;
  if (total === 0) return 'unknown';

  // Check for mixed (two segments within 30% of each other)
  const sorted = Object.entries(signals).sort((a, b) => b[1] - a[1]);
  if (sorted[0][1] > 0 && sorted[1][1] > 0 && sorted[1][1] / sorted[0][1] > 0.6) {
    return 'mixed';
  }

  const winner = sorted[0][0];
  if (winner === 'enterprise') return 'enterprise';
  if (winner === 'midMarket') return 'mid-market';
  return 'smb';
}

// ---------------------------------------------------------------------------
// Customer logo & case study extraction
// ---------------------------------------------------------------------------

/** Known enterprise company names often found as logos. */
const KNOWN_LOGOS = [
  'Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'Salesforce', 'HubSpot',
  'Stripe', 'Slack', 'Shopify', 'Adobe', 'SAP', 'Oracle', 'IBM', 'Dell',
  'Cisco', 'Intel', 'Uber', 'Airbnb', 'Dropbox', 'Zoom', 'Twilio', 'Atlassian',
  'Datadog', 'Snowflake', 'Cloudflare', 'Figma', 'Notion', 'Airtable',
  'Monday', 'Asana', 'Linear', 'Vercel', 'Netlify', 'GitLab', 'GitHub',
  'Intercom', 'Zendesk', 'Freshworks', 'Gong', 'Outreach', 'Clari',
  'Deel', 'Rippling', 'Gusto', 'BambooHR', 'Lattice', 'Culture Amp',
];

function extractCustomerLogos(pages: Map<string, string>): string[] {
  const logos = new Set<string>();
  const allHtml = Array.from(pages.values()).join('\n');

  // 1. Check for logo sections
  const logoSections = allHtml.match(
    /<(?:section|div)[^>]*class="[^"]*(?:logo|customer|client|trusted|brand|partner)[^"]*"[^>]*>([\s\S]*?)<\/(?:section|div)>/gi,
  ) ?? [];

  for (const section of logoSections) {
    // Extract from alt attributes
    const alts = section.match(/alt=["']([^"']+)["']/gi) ?? [];
    for (const alt of alts) {
      const name = alt.replace(/alt=["']|["']/g, '').replace(/\s*logo\s*/gi, '').trim();
      if (name.length > 1 && name.length < 50) logos.add(name);
    }
    // Extract from title attributes
    const titles = section.match(/title=["']([^"']+)["']/gi) ?? [];
    for (const title of titles) {
      const name = title.replace(/title=["']|["']/g, '').replace(/\s*logo\s*/gi, '').trim();
      if (name.length > 1 && name.length < 50) logos.add(name);
    }
  }

  // 2. Check for known company names in "trusted by" / "used by" sections
  const trustedSection = allHtml.match(
    /(?:trusted|used|loved|chosen)\s+by[\s\S]{0,2000}/gi,
  ) ?? [];
  const trustedText = trustedSection.join(' ');

  for (const company of KNOWN_LOGOS) {
    if (trustedText.includes(company) || allHtml.match(new RegExp(`alt=["'][^"']*${company}[^"']*["']`, 'i'))) {
      logos.add(company);
    }
  }

  return Array.from(logos).slice(0, 30);
}

function extractCaseStudies(pages: Map<string, string>): string[] {
  const studies: string[] = [];

  for (const [path, html] of pages) {
    if (!path.includes('case') && !path.includes('customer')) continue;

    // Extract case study titles
    const headings = html.match(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/gi) ?? [];
    for (const h of headings) {
      const text = stripHtml(h).trim();
      if (text.length > 5 && text.length < 200) studies.push(text);
    }
  }

  // Also look for case study links on homepage
  const homepage = pages.get('/') ?? '';
  const caseLinks = homepage.match(/<a[^>]*href="[^"]*case[^"]*"[^>]*>([\s\S]*?)<\/a>/gi) ?? [];
  for (const link of caseLinks) {
    const text = stripHtml(link).trim();
    if (text.length > 5 && text.length < 200) studies.push(text);
  }

  return [...new Set(studies)].slice(0, 15);
}

// ---------------------------------------------------------------------------
// Tech stack detection (reuse from website-analyzer.ts)
// ---------------------------------------------------------------------------

const TECH_INDICATORS: Array<{ pattern: RegExp; tech: string }> = [
  { pattern: /wp-content|wordpress/i, tech: 'WordPress' },
  { pattern: /shopify/i, tech: 'Shopify' },
  { pattern: /wix\.com/i, tech: 'Wix' },
  { pattern: /squarespace/i, tech: 'Squarespace' },
  { pattern: /webflow/i, tech: 'Webflow' },
  { pattern: /hubspot/i, tech: 'HubSpot' },
  { pattern: /salesforce|pardot/i, tech: 'Salesforce' },
  { pattern: /marketo/i, tech: 'Marketo' },
  { pattern: /intercom/i, tech: 'Intercom' },
  { pattern: /drift/i, tech: 'Drift' },
  { pattern: /zendesk/i, tech: 'Zendesk' },
  { pattern: /segment\.com|analytics\.js/i, tech: 'Segment' },
  { pattern: /google-analytics|gtag|ga\.js/i, tech: 'Google Analytics' },
  { pattern: /googletagmanager/i, tech: 'Google Tag Manager' },
  { pattern: /hotjar/i, tech: 'Hotjar' },
  { pattern: /mixpanel/i, tech: 'Mixpanel' },
  { pattern: /amplitude/i, tech: 'Amplitude' },
  { pattern: /stripe/i, tech: 'Stripe' },
  { pattern: /cloudflare/i, tech: 'Cloudflare' },
  { pattern: /react/i, tech: 'React' },
  { pattern: /vue\.js|vuejs/i, tech: 'Vue.js' },
  { pattern: /angular/i, tech: 'Angular' },
  { pattern: /next\.js|_next/i, tech: 'Next.js' },
  { pattern: /gatsby/i, tech: 'Gatsby' },
  { pattern: /tailwind/i, tech: 'Tailwind CSS' },
  { pattern: /aws|amazonaws/i, tech: 'AWS' },
  { pattern: /azure/i, tech: 'Azure' },
  { pattern: /google cloud|gcp/i, tech: 'Google Cloud' },
  { pattern: /clearbit/i, tech: 'Clearbit' },
  { pattern: /6sense/i, tech: '6sense' },
  { pattern: /demandbase/i, tech: 'Demandbase' },
  { pattern: /gong\.io/i, tech: 'Gong' },
  { pattern: /outreach\.io/i, tech: 'Outreach' },
  { pattern: /apollo\.io/i, tech: 'Apollo' },
  { pattern: /zoominfo/i, tech: 'ZoomInfo' },
];

function extractTechStack(pages: Map<string, string>): string[] {
  const tech = new Set<string>();
  const allHtml = Array.from(pages.values()).join('\n');

  for (const { pattern, tech: name } of TECH_INDICATORS) {
    if (pattern.test(allHtml)) tech.add(name);
  }

  return Array.from(tech);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DeepAnalysisOptions {
  /** Skip sub-page discovery (only analyse homepage). Default false. */
  homepageOnly?: boolean;
  /** Maximum sub-pages to fetch beyond homepage. Default 6. */
  maxSubPages?: number;
}

/**
 * Deep-analyse a client website and return structured WebsiteAnalysis.
 *
 * Fetches homepage + key sub-pages, then extracts value proposition,
 * target personas, pricing signals, customer logos, case studies, and tech stack.
 */
export async function analyzeWebsiteDeep(
  websiteUrl: string,
  options: DeepAnalysisOptions = {},
): Promise<WebsiteAnalysis> {
  const { homepageOnly = false } = options;

  const base = websiteUrl.replace(/\/+$/, '');
  let pages: Map<string, string>;

  if (homepageOnly) {
    pages = new Map();
    const html = await fetchPage(base);
    if (html) pages.set('/', html);
  } else {
    pages = await discoverPages(base);
  }

  if (pages.size === 0) {
    return {
      valueProposition: 'Could not fetch website',
      targetPersonas: [],
      pricingSignals: 'unknown',
      customerLogos: [],
      caseStudies: [],
      technologyIndicators: [],
      productDescription: '',
    };
  }

  return {
    valueProposition: extractValueProposition(pages),
    targetPersonas: extractTargetPersonas(pages),
    pricingSignals: extractPricingSignals(pages),
    customerLogos: extractCustomerLogos(pages),
    caseStudies: extractCaseStudies(pages),
    technologyIndicators: extractTechStack(pages),
    productDescription: extractProductDescription(pages),
  };
}
