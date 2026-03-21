/**
 * URL → normalised domain utilities.
 */

/**
 * Extract and normalise domain from a URL or domain string.
 * "https://www.Example.Com/path" → "example.com"
 * "Example.Com" → "example.com"
 */
export function extractDomain(input: string): string | null {
  if (!input) return null;

  let hostname: string;
  try {
    // Try parsing as full URL
    const url = new URL(input.startsWith('http') ? input : `https://${input}`);
    hostname = url.hostname;
  } catch {
    // Treat as bare domain
    hostname = input.split('/')[0];
  }

  return hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .trim() || null;
}

/**
 * Check if two URLs/domains resolve to the same root domain.
 */
export function isSameDomain(a: string, b: string): boolean {
  const domainA = extractDomain(a);
  const domainB = extractDomain(b);
  if (!domainA || !domainB) return false;
  return domainA === domainB;
}
