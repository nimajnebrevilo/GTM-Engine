/**
 * Token-bucket rate limiter.
 * Each source/domain gets its own limiter instance configured to the API's limits.
 */

export interface RateLimiterConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in milliseconds */
  windowMs: number;
}

export class RateLimiter {
  private timestamps: number[] = [];
  private readonly config: RateLimiterConfig;

  constructor(config: RateLimiterConfig) {
    this.config = config;
  }

  /**
   * Wait until a request slot is available, then consume it.
   */
  async acquire(): Promise<void> {
    while (true) {
      const now = Date.now();
      // Remove timestamps outside the window
      this.timestamps = this.timestamps.filter(t => now - t < this.config.windowMs);

      if (this.timestamps.length < this.config.maxRequests) {
        this.timestamps.push(now);
        return;
      }

      // Wait until the oldest timestamp expires
      const oldestInWindow = this.timestamps[0];
      const waitMs = this.config.windowMs - (now - oldestInWindow) + 10;
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
  }
}

/** Pre-configured rate limiters for known APIs */
export const RATE_LIMITERS = {
  // Paid providers
  exa: () => new RateLimiter({ maxRequests: 10, windowMs: 1_000 }),               // 10/sec
  apollo: () => new RateLimiter({ maxRequests: 5, windowMs: 1_000 }),             // 5/sec conservative
  prospeo: () => new RateLimiter({ maxRequests: 10, windowMs: 1_000 }),           // 10/sec
  millionVerifier: () => new RateLimiter({ maxRequests: 20, windowMs: 1_000 }),   // 20/sec
  freckle: () => new RateLimiter({ maxRequests: 5, windowMs: 1_000 }),            // 5/sec conservative

  // Free sources
  wikidata: () => new RateLimiter({ maxRequests: 5, windowMs: 1_000 }),           // be polite
  generic: () => new RateLimiter({ maxRequests: 10, windowMs: 60_000 }),          // conservative default
};
