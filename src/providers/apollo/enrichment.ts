/**
 * Apollo contact enrichment — email + phone reveal.
 */

import { apolloFetch } from './client.js';
import type { ContactEnrichmentResult } from '../types.js';

interface ApolloEnrichResponse {
  person: {
    id: string;
    email: string | null;
    email_status: string | null;
    phone_numbers: Array<{ raw_number: string; sanitized_number: string; type: string }> | null;
    first_name: string;
    last_name: string;
    title: string | null;
    organization: { name: string; primary_domain: string | null } | null;
  } | null;
}

/**
 * Enrich a contact via Apollo to get email and phone.
 * Uses 1 credit per successful reveal.
 */
export async function enrichContact(contact: {
  email?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
}): Promise<ContactEnrichmentResult> {
  const body: Record<string, unknown> = {};

  if (contact.email) {
    body.email = contact.email;
  }
  if (contact.linkedinUrl) {
    body.linkedin_url = contact.linkedinUrl;
  }
  if (contact.firstName) body.first_name = contact.firstName;
  if (contact.lastName) body.last_name = contact.lastName;
  if (contact.companyDomain) body.organization_domain = contact.companyDomain;

  const response = await apolloFetch<ApolloEnrichResponse>(
    '/people/match',
    { body },
  );

  const person = response.person;
  if (!person) {
    return {
      email: null,
      emailStatus: null,
      phone: null,
      phoneStatus: null,
      provider: 'apollo',
      creditsUsed: 0,
      rawData: {},
    };
  }

  const phone = person.phone_numbers?.[0]?.sanitized_number ?? null;

  return {
    email: person.email ?? null,
    emailStatus: mapEmailStatus(person.email_status),
    phone,
    phoneStatus: phone ? 'unknown' : null,
    provider: 'apollo',
    creditsUsed: 1,
    rawData: person as unknown as Record<string, unknown>,
  };
}

function mapEmailStatus(status: string | null): ContactEnrichmentResult['emailStatus'] {
  if (!status) return null;
  const map: Record<string, ContactEnrichmentResult['emailStatus']> = {
    verified: 'valid',
    valid: 'valid',
    invalid: 'invalid',
    guessed: 'risky',
    unavailable: null,
  };
  return map[status] ?? 'unknown';
}
