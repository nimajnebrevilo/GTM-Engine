/**
 * Exponential backoff with jitter for transient failures.
 */

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  /** Jitter factor 0-1. 0.5 means delay varies ±50% */
  jitterFactor: number;
  /** HTTP status codes that should trigger retry */
  retryableStatusCodes: number[];
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.5,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

function getDelay(attempt: number, config: RetryConfig): number {
  const base = config.initialDelayMs * Math.pow(2, attempt);
  const capped = Math.min(base, config.maxDelayMs);
  const jitter = capped * config.jitterFactor * (2 * Math.random() - 1);
  return Math.max(0, capped + jitter);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
): Promise<T> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= cfg.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Check if this is a retryable HTTP error
      const statusMatch = lastError.message.match(/status[:\s]+(\d+)/i);
      if (statusMatch) {
        const status = parseInt(statusMatch[1], 10);
        if (!cfg.retryableStatusCodes.includes(status)) {
          throw lastError;
        }
      }

      if (attempt < cfg.maxRetries) {
        const delay = getDelay(attempt, cfg);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError!;
}
