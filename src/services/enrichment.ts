/**
 * Enrichment waterfall orchestrator — the core economic engine.
 *
 * Flow per contact:
 * 1. Supabase cache → fresh hit → done
 * 2. Apollo → email + phone → MV validate → pass → done
 *    → MV fail → step 3
 * 3. Prospeo → find/verify email → MV validate → pass → done
 *    → phone missing → step 4
 * 4. Freckle → fallback for remaining gaps
 * 5. Million Verifier → bulk sweep ALL emails before export
 */

import { getSupabaseClient } from '../db/client.js';
import { enrichContact as apolloEnrich } from '../providers/apollo/enrichment.js';
import { findEmail as prospeoFind } from '../providers/prospeo/email-finder.js';
import { verifyEmail as mvVerify, verifyEmails as mvBulkVerify } from '../providers/million-verifier/validate.js';
import { enrichContact as freckleEnrich } from '../providers/freckle/enrichment.js';
import { isProviderConfigured } from '../config/env.js';
import { getCostTracker } from './cost-tracker.js';
import type { ContactEnrichmentResult, EmailVerificationResult } from '../providers/types.js';

export interface EnrichmentInput {
  contactId: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  companyDomain?: string;
  linkedinUrl?: string;
}

export interface EnrichmentOutput {
  contactId: string;
  email: string | null;
  emailStatus: string | null;
  phone: string | null;
  phoneStatus: string | null;
  linkedinUrl: string | null;
  providers: string[];
  totalCredits: number;
  cacheHit: boolean;
}

/**
 * Run the enrichment waterfall for a single contact.
 */
export async function enrichContact(input: EnrichmentInput): Promise<EnrichmentOutput> {
  const db = getSupabaseClient();
  const costTracker = getCostTracker();
  const providers: string[] = [];
  let totalCredits = 0;

  let email = input.email ?? null;
  let emailStatus: string | null = null;
  let phone = input.phone ?? null;
  let phoneStatus: string | null = null;
  let linkedinUrl = input.linkedinUrl ?? null;

  // ─── Step 1: Cache check ────────────────────────────────────────────────
  const { data: cached } = await db
    .from('enrichment_cache')
    .select('response, provider')
    .eq('lookup_key', input.linkedinUrl ?? input.email ?? `${input.firstName}:${input.lastName}:${input.companyDomain}`)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cached?.response) {
    const resp = cached.response as Record<string, unknown>;
    if (resp.email && resp.phone) {
      return {
        contactId: input.contactId,
        email: resp.email as string,
        emailStatus: (resp.emailStatus as string) ?? 'unknown',
        phone: resp.phone as string,
        phoneStatus: (resp.phoneStatus as string) ?? 'unknown',
        linkedinUrl: (resp.linkedinUrl as string) ?? linkedinUrl,
        providers: [cached.provider],
        totalCredits: 0,
        cacheHit: true,
      };
    }
    // Partial cache — use what we have, continue waterfall for gaps
    email = (resp.email as string) ?? email;
    phone = (resp.phone as string) ?? phone;
  }

  // ─── Step 2: Apollo enrichment ──────────────────────────────────────────
  if (isProviderConfigured('apollo') && costTracker.canSpend('apollo') && (!email || !phone)) {
    try {
      const result = await apolloEnrich({
        email: email ?? undefined,
        linkedinUrl: input.linkedinUrl,
        firstName: input.firstName,
        lastName: input.lastName,
        companyDomain: input.companyDomain,
      });

      await cacheResult('apollo', input, result);
      costTracker.record('apollo', result.creditsUsed);
      totalCredits += result.creditsUsed;
      providers.push('apollo');

      if (result.email) email = result.email;
      if (result.phone) {
        phone = result.phone;
        phoneStatus = result.phoneStatus;
      }
      if (result.linkedinUrl) linkedinUrl = result.linkedinUrl;

      // MV inline validation
      if (email && isProviderConfigured('million_verifier')) {
        const mv = await mvVerify(email);
        emailStatus = mv.status;
        if (mv.status === 'valid') {
          if (phone) {
            return buildOutput(input.contactId, email, emailStatus, phone, phoneStatus, linkedinUrl, providers, totalCredits);
          }
        }
        // MV fail — continue to Prospeo
      }
    } catch (err) {
      console.warn('Apollo enrichment failed:', err);
    }
  }

  // ─── Step 3: Prospeo ────────────────────────────────────────────────────
  if (isProviderConfigured('prospeo') && costTracker.canSpend('prospeo') && (!email || emailStatus === 'invalid')) {
    try {
      const result = await prospeoFind({
        firstName: input.firstName,
        lastName: input.lastName,
        companyDomain: input.companyDomain ?? '',
      });

      await cacheResult('prospeo', input, result);
      costTracker.record('prospeo', result.creditsUsed);
      totalCredits += result.creditsUsed;
      providers.push('prospeo');

      if (result.email) email = result.email;

      // MV inline validation
      if (email && isProviderConfigured('million_verifier')) {
        const mv = await mvVerify(email);
        emailStatus = mv.status;
        if (mv.status === 'valid' && phone) {
          return buildOutput(input.contactId, email, emailStatus, phone, phoneStatus, linkedinUrl, providers, totalCredits);
        }
      }
    } catch (err) {
      console.warn('Prospeo enrichment failed:', err);
    }
  }

  // ─── Step 4: Freckle fallback ───────────────────────────────────────────
  if (isProviderConfigured('freckle') && costTracker.canSpend('freckle') && (!email || !phone)) {
    try {
      const result = await freckleEnrich({
        email: email ?? undefined,
        linkedinUrl: input.linkedinUrl,
        firstName: input.firstName,
        lastName: input.lastName,
        companyDomain: input.companyDomain,
      });

      await cacheResult('freckle', input, result);
      costTracker.record('freckle', result.creditsUsed);
      totalCredits += result.creditsUsed;
      providers.push('freckle');

      if (result.email && !email) email = result.email;
      if (result.phone && !phone) {
        phone = result.phone;
        phoneStatus = result.phoneStatus;
      }
      if (result.linkedinUrl && !linkedinUrl) linkedinUrl = result.linkedinUrl;
    } catch (err) {
      console.warn('Freckle enrichment failed:', err);
    }
  }

  // ─── Persist enriched fields back to the contacts table ─────────────
  const updates: Record<string, unknown> = {};
  if (email) { updates.email = email; updates.email_status = emailStatus; }
  if (phone) { updates.phone = phone; updates.phone_status = phoneStatus; }
  if (linkedinUrl) updates.linkedin_url = linkedinUrl;

  if (Object.keys(updates).length > 0) {
    try {
      await db.from('contacts').update(updates).eq('id', input.contactId);
    } catch (err) {
      console.warn(`Failed to persist enrichment for contact ${input.contactId}:`, err);
    }
  }

  return buildOutput(input.contactId, email, emailStatus, phone, phoneStatus, linkedinUrl, providers, totalCredits);
}

/**
 * Bulk MV sweep — Step 5, run before export.
 * Re-validates ALL emails in a campaign.
 */
export async function bulkVerifyEmails(
  emails: string[],
): Promise<EmailVerificationResult[]> {
  if (!isProviderConfigured('million_verifier') || emails.length === 0) {
    return [];
  }
  return mvBulkVerify(emails);
}

// ─── Batch Enrichment ─────────────────────────────────────────────────────────

export interface BatchEnrichmentOptions {
  /** Max contacts to enrich concurrently. Defaults to 10. */
  concurrency?: number;
  /** Stop after this many total credits are consumed. Defaults to Infinity. */
  creditCeiling?: number;
  /** Called after each contact completes. */
  onProgress?: (completed: number, total: number, latest: EnrichmentOutput) => void;
}

export interface BatchEnrichmentResult {
  results: EnrichmentOutput[];
  totalCredits: number;
  cacheHits: number;
  failures: number;
  durationMs: number;
}

/**
 * Enrich a list of contacts in parallel batches.
 *
 * Runs the full waterfall (cache → Apollo → Prospeo → Freckle) per contact,
 * with concurrency capped to stay within API rate limits and an optional
 * credit ceiling to prevent runaway spend.
 *
 * After all contacts are enriched, runs a single bulk MV sweep on every
 * collected email for a final verification pass.
 */
export async function enrichContactsBatch(
  contacts: EnrichmentInput[],
  options: BatchEnrichmentOptions = {},
): Promise<BatchEnrichmentResult> {
  const concurrency = options.concurrency ?? 10;
  const creditCeiling = options.creditCeiling ?? Infinity;
  const startTime = Date.now();

  const results: EnrichmentOutput[] = [];
  let totalCredits = 0;
  let cacheHits = 0;
  let failures = 0;

  // Process in concurrent chunks
  for (let i = 0; i < contacts.length; i += concurrency) {
    // Check credit ceiling before starting next chunk
    if (totalCredits >= creditCeiling) {
      console.warn(
        `Batch enrichment stopped: credit ceiling reached (${totalCredits}/${creditCeiling})`,
      );
      break;
    }

    const chunk = contacts.slice(i, i + concurrency);
    const chunkResults = await Promise.allSettled(
      chunk.map(contact => enrichContact(contact)),
    );

    for (let j = 0; j < chunkResults.length; j++) {
      const settled = chunkResults[j];
      if (settled.status === 'fulfilled') {
        const output = settled.value;
        results.push(output);
        totalCredits += output.totalCredits;
        if (output.cacheHit) cacheHits++;
        options.onProgress?.(results.length, contacts.length, output);
      } else {
        failures++;
        console.warn(
          `Enrichment failed for contact ${chunk[j].contactId}:`,
          settled.reason,
        );
        // Push a null-result so the caller still sees every contactId
        const fallback: EnrichmentOutput = {
          contactId: chunk[j].contactId,
          email: chunk[j].email ?? null,
          emailStatus: null,
          phone: chunk[j].phone ?? null,
          phoneStatus: null,
          linkedinUrl: chunk[j].linkedinUrl ?? null,
          providers: [],
          totalCredits: 0,
          cacheHit: false,
        };
        results.push(fallback);
        options.onProgress?.(results.length, contacts.length, fallback);
      }
    }
  }

  // ─── Bulk MV sweep on all collected emails ───────────────────────────
  const emailsToVerify = results
    .map(r => r.email)
    .filter((e): e is string => !!e && !['valid'].includes(results.find(r => r.email === e)?.emailStatus ?? ''));

  if (emailsToVerify.length > 0) {
    const verified = await bulkVerifyEmails(emailsToVerify);
    const verifiedMap = new Map(verified.map(v => [v.email, v.status]));
    for (const result of results) {
      if (result.email && verifiedMap.has(result.email)) {
        result.emailStatus = verifiedMap.get(result.email) ?? result.emailStatus;
      }
    }
  }

  return {
    results,
    totalCredits,
    cacheHits,
    failures,
    durationMs: Date.now() - startTime,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildOutput(
  contactId: string,
  email: string | null,
  emailStatus: string | null,
  phone: string | null,
  phoneStatus: string | null,
  linkedinUrl: string | null,
  providers: string[],
  totalCredits: number,
): EnrichmentOutput {
  return { contactId, email, emailStatus, phone, phoneStatus, linkedinUrl, providers, totalCredits, cacheHit: false };
}

async function cacheResult(
  provider: string,
  input: EnrichmentInput,
  result: ContactEnrichmentResult,
): Promise<void> {
  const db = getSupabaseClient();
  const lookupKey = input.linkedinUrl ?? input.email ?? `${input.firstName}:${input.lastName}:${input.companyDomain}`;
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString(); // 30 day TTL

  await db.from('enrichment_cache').upsert({
    provider,
    lookup_key: lookupKey,
    lookup_type: 'person',
    response: result.rawData,
    credits_used: result.creditsUsed,
    expires_at: expiresAt,
  }, { onConflict: 'provider,lookup_key,lookup_type' });
}
