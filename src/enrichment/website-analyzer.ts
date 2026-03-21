/**
 * Website analysis for company enrichment.
 * Fetches a company's homepage and extracts structured data.
 */

import { BlockTracker, chooseFetchStrategy, resilientFetch } from '../utils/resilience.js';

const blockTracker = new BlockTracker();

export interface WebsiteEnrichment {
  title: string | null;
  description: string | null;
  techStack: string[];
  ogData: Record<string, string>;
  socialLinks: {
    linkedin: string | null;
    twitter: string | null;
    github: string | null;
  };
}

/**
 * Known tech stack indicators from HTML content.
 */
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
  { pattern: /bootstrap/i, tech: 'Bootstrap' },
  { pattern: /tailwind/i, tech: 'Tailwind CSS' },
  { pattern: /aws|amazonaws/i, tech: 'AWS' },
  { pattern: /azure/i, tech: 'Azure' },
  { pattern: /google cloud|gcp/i, tech: 'Google Cloud' },
];

const SOCIAL_PATTERNS = {
  linkedin: /https?:\/\/(www\.)?linkedin\.com\/company\/[^\s"'<>]+/gi,
  twitter: /https?:\/\/(www\.)?(twitter|x)\.com\/[^\s"'<>]+/gi,
  github: /https?:\/\/(www\.)?github\.com\/[^\s"'<>]+/gi,
};

/**
 * Analyze a company website and extract enrichment data.
 */
export async function analyzeWebsite(url: string): Promise<WebsiteEnrichment> {
  const methods = chooseFetchStrategy(new URL(url).hostname, 'low', blockTracker);
  const result = await resilientFetch(url, methods, blockTracker);

  if (!result.content) {
    return { title: null, description: null, techStack: [], ogData: {}, socialLinks: { linkedin: null, twitter: null, github: null } };
  }

  const html = result.content;

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : null;

  // Extract meta description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
  const description = descMatch ? descMatch[1].trim() : null;

  // Extract Open Graph data
  const ogData: Record<string, string> = {};
  const ogRegex = /<meta[^>]*property=["']og:(\w+)["'][^>]*content=["']([^"']+)["']/gi;
  let ogMatch;
  while ((ogMatch = ogRegex.exec(html)) !== null) {
    ogData[ogMatch[1]] = ogMatch[2];
  }

  // Detect tech stack
  const techStack = new Set<string>();
  for (const { pattern, tech } of TECH_INDICATORS) {
    if (pattern.test(html)) {
      techStack.add(tech);
    }
  }

  // Extract social links
  const socialLinks = {
    linkedin: (html.match(SOCIAL_PATTERNS.linkedin) ?? [])[0] ?? null,
    twitter: (html.match(SOCIAL_PATTERNS.twitter) ?? [])[0] ?? null,
    github: (html.match(SOCIAL_PATTERNS.github) ?? [])[0] ?? null,
  };

  return {
    title,
    description,
    techStack: Array.from(techStack),
    ogData,
    socialLinks,
  };
}
