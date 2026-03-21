/**
 * Company name and data normalization for deduplication.
 */

/** Legal suffixes to strip, ordered longest-first to avoid partial matches */
const LEGAL_SUFFIXES = [
  'incorporated', 'corporation', 'limited', 'company',
  'holdings', 'international', 'enterprises', 'associates',
  'technologies', 'solutions', 'services', 'consulting',
  'partners', 'group',
  'inc', 'corp', 'ltd', 'llc', 'llp', 'plc', 'lp',
  'gmbh', 'mbh', 'ohg', 'kg', 'ug',     // German
  'sarl', 'sas', 'eurl',                  // French
  'srl', 'spa',                            // Italian
  'bv', 'nv',                              // Dutch/Belgian
  'ab',                                     // Swedish
  'as', 'asa',                             // Norwegian
  'oy', 'oyj',                             // Finnish
  'sa',                                     // Spanish/Portuguese/French
  'ag',                                     // German/Swiss
  'pty',                                    // Australian
  'pvt',                                    // Indian
  'co',
];

const SUFFIX_PATTERN = new RegExp(
  `\\b(${LEGAL_SUFFIXES.join('|')})\\.?\\s*$`,
  'gi',
);

/** Country name to ISO code mapping for common variations */
const COUNTRY_ALIASES: Record<string, string> = {
  'united kingdom': 'GB', 'uk': 'GB', 'england': 'GB', 'scotland': 'GB', 'wales': 'GB',
  'united states': 'US', 'usa': 'US', 'us': 'US', 'united states of america': 'US',
  'germany': 'DE', 'deutschland': 'DE',
  'france': 'FR',
  'italy': 'IT', 'italia': 'IT',
  'spain': 'ES', 'españa': 'ES',
  'netherlands': 'NL', 'holland': 'NL',
  'belgium': 'BE', 'belgique': 'BE',
  'switzerland': 'CH', 'schweiz': 'CH', 'suisse': 'CH',
  'austria': 'AT', 'österreich': 'AT',
  'sweden': 'SE', 'sverige': 'SE',
  'norway': 'NO', 'norge': 'NO',
  'denmark': 'DK', 'danmark': 'DK',
  'finland': 'FI', 'suomi': 'FI',
  'ireland': 'IE',
  'portugal': 'PT',
  'poland': 'PL', 'polska': 'PL',
  'czech republic': 'CZ', 'czechia': 'CZ',
  'romania': 'RO',
  'hungary': 'HU',
  'greece': 'GR',
  'canada': 'CA',
  'australia': 'AU',
  'new zealand': 'NZ',
  'japan': 'JP',
  'china': 'CN',
  'india': 'IN',
  'singapore': 'SG',
  'hong kong': 'HK',
  'south korea': 'KR', 'korea': 'KR',
  'israel': 'IL',
  'brazil': 'BR',
  'mexico': 'MX',
  'south africa': 'ZA',
  'uae': 'AE', 'united arab emirates': 'AE',
  'saudi arabia': 'SA',
};

/**
 * Normalize a company name for dedup matching.
 */
export function normalizeName(name: string): string {
  let normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')   // strip diacritics
    .toLowerCase()
    .trim();

  // Strip legal suffixes (may need multiple passes)
  for (let i = 0; i < 3; i++) {
    const before = normalized;
    normalized = normalized.replace(SUFFIX_PATTERN, '').trim();
    if (normalized === before) break;
  }

  // Strip punctuation but keep spaces
  normalized = normalized
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return normalized;
}

/**
 * Normalize a country name/code to ISO 3166-1 alpha-2.
 */
export function normalizeCountry(input: string): string {
  const lower = input.toLowerCase().trim();
  // Already an ISO code?
  if (/^[a-z]{2}$/i.test(lower)) return lower.toUpperCase();
  return COUNTRY_ALIASES[lower] ?? input.toUpperCase();
}

/**
 * Extract root domain from a URL or hostname.
 */
export function normalizeDomain(input: string): string | null {
  try {
    const url = input.startsWith('http') ? input : `https://${input}`;
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Normalize an address for comparison.
 */
export function normalizeAddress(address: string): string {
  return address
    .toLowerCase()
    .replace(/\b(street|st|road|rd|avenue|ave|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl|way|terrace|ter)\b/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
