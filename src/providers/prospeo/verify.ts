/**
 * Prospeo email verification.
 */

import { prospeoFetch } from './client.js';
import type { EmailVerificationResult } from '../types.js';

interface ProspeoVerifyResponse {
  response: {
    email: string;
    is_valid: boolean;
    email_status: string;
  };
  error: boolean;
}

/**
 * Verify a single email via Prospeo.
 */
export async function verifyEmail(email: string): Promise<EmailVerificationResult> {
  const response = await prospeoFetch<ProspeoVerifyResponse>(
    '/email-verifier',
    { email },
  );

  return {
    email,
    status: response.response.is_valid ? 'valid' : 'invalid',
    provider: 'prospeo',
    rawData: response as unknown as Record<string, unknown>,
  };
}
