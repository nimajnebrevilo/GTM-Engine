/**
 * Million Verifier email validation.
 * Single verification + bulk verification.
 */

import { mvFetch } from './client.js';
import type { EmailVerificationResult } from '../types.js';

interface MVSingleResponse {
  email: string;
  quality: string;    // "good", "bad", "catch_all", "unknown", "disposable"
  result: string;     // "ok", "invalid", "catch_all", "unknown", "disposable"
  resultcode: number;
  free: boolean;
  role: boolean;
}

/**
 * Verify a single email address.
 */
export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  const response = await mvFetch<MVSingleResponse>(
    '/verify',
    { email },
  );

  return {
    email,
    status: mapMVStatus(response.result),
    provider: 'million_verifier',
    rawData: response as unknown as Record<string, unknown>,
  };
}

/**
 * Verify multiple emails. Calls single verification in parallel with concurrency limit.
 * For true bulk (1000+), use the file upload API instead.
 */
export async function verifyEmails(
  emails: string[],
  concurrency = 10,
): Promise<EmailVerificationResult[]> {
  const results: EmailVerificationResult[] = [];
  const queue = [...emails];

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const email = queue.shift()!;
      const result = await verifyEmail(email);
      results.push(result);
    }
  });

  await Promise.all(workers);
  return results;
}

function mapMVStatus(result: string): EmailVerificationResult['status'] {
  const map: Record<string, EmailVerificationResult['status']> = {
    ok: 'valid',
    invalid: 'invalid',
    catch_all: 'catch_all',
    unknown: 'unknown',
    disposable: 'disposable',
  };
  return map[result] ?? 'unknown';
}
