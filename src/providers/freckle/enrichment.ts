/**
 * Freckle waterfall enrichment — final fallback.
 * Aggregates 40+ providers for remaining gaps.
 */

import { freckleFetch } from './client.js';
import type { ContactEnrichmentResult } from '../types.js';

interface FreckleEnrichResponse {
  data: {
    email: string | null;
    email_verified: boolean;
    phone: string | null;
    phone_verified: boolean;
    first_name: string | null;
    last_name: string | null;
    title: string | null;
    company: string | null;
    linkedin_url: string | null;
  } | null;
  credits_used: number;
  providers_checked: string[];
}

/**
 * Enrich a contact via Freckle's multi-provider waterfall.
 * This is the last resort — only called when Apollo and Prospeo failed.
 */
export async function enrichContact(contact: {
  email?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  companyDomain?: string;
}): Promise<ContactEnrichmentResult> {
  const body: Record<string, unknown> = {};

  if (contact.email) body.email = contact.email;
  if (contact.linkedinUrl) body.linkedin_url = contact.linkedinUrl;
  if (contact.firstName) body.first_name = contact.firstName;
  if (contact.lastName) body.last_name = contact.lastName;
  if (contact.companyDomain) body.company_domain = contact.companyDomain;

  const response = await freckleFetch<FreckleEnrichResponse>(
    '/enrich',
    body,
  );

  if (!response.data) {
    return {
      email: null,
      emailStatus: null,
      phone: null,
      phoneStatus: null,
      linkedinUrl: null,
      provider: 'freckle',
      creditsUsed: response.credits_used,
      rawData: response as unknown as Record<string, unknown>,
    };
  }

  return {
    email: response.data.email ?? null,
    emailStatus: response.data.email
      ? (response.data.email_verified ? 'valid' : 'unknown')
      : null,
    phone: response.data.phone ?? null,
    phoneStatus: response.data.phone
      ? (response.data.phone_verified ? 'valid' : 'unknown')
      : null,
    linkedinUrl: response.data.linkedin_url ?? null,
    provider: 'freckle',
    creditsUsed: response.credits_used,
    rawData: response as unknown as Record<string, unknown>,
  };
}
