/**
 * Prospeo email finder.
 * Find professional email addresses by name + domain.
 */

import { prospeoFetch } from './client.js';
import type { ContactEnrichmentResult } from '../types.js';

interface ProspeoEmailFinderResponse {
  response: {
    email: string | null;
    email_status: string | null;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    domain: string | null;
  };
  error: boolean;
  message: string;
}

/**
 * Find email for a person at a company.
 * Uses 1 credit per successful lookup.
 */
export async function findEmail(contact: {
  firstName: string;
  lastName: string;
  companyDomain: string;
}): Promise<ContactEnrichmentResult> {
  const response = await prospeoFetch<ProspeoEmailFinderResponse>(
    '/email-finder',
    {
      first_name: contact.firstName,
      last_name: contact.lastName,
      company: contact.companyDomain,
    },
  );

  if (response.error || !response.response.email) {
    return {
      email: null,
      emailStatus: null,
      phone: null,
      phoneStatus: null,
      provider: 'prospeo',
      creditsUsed: 0,
      rawData: response as unknown as Record<string, unknown>,
    };
  }

  return {
    email: response.response.email,
    emailStatus: mapProspeoStatus(response.response.email_status),
    phone: null, // Prospeo doesn't provide phone
    phoneStatus: null,
    provider: 'prospeo',
    creditsUsed: 1,
    rawData: response as unknown as Record<string, unknown>,
  };
}

function mapProspeoStatus(status: string | null): ContactEnrichmentResult['emailStatus'] {
  if (!status) return null;
  const map: Record<string, ContactEnrichmentResult['emailStatus']> = {
    valid: 'valid',
    invalid: 'invalid',
    catch_all: 'catch_all',
    unknown: 'unknown',
  };
  return map[status] ?? 'unknown';
}
