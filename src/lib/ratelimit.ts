/**
 * Simple sliding-window rate limiter.
 * One bucket per key (tool name or client id). Thread-safe for single-process Node.js.
 *
 * For the stdio transport there is exactly one caller (the MCP host process),
 * so the key is the tool name. This prevents a runaway model loop from hammering
 * a tool thousands of times in a short window.
 */

type Bucket = { calls: number[]; };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxCalls: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the call is allowed; false if the rate limit is exceeded. */
  allow(key: string): boolean {
    const now = Date.now();
    const cutoff = now - this.windowMs;

    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { calls: [] };
      this.buckets.set(key, bucket);
    }

    // Evict calls outside the window.
    bucket.calls = bucket.calls.filter((t) => t > cutoff);

    if (bucket.calls.length >= this.maxCalls) return false;

    bucket.calls.push(now);
    return true;
  }

  /** Prune all empty buckets to prevent memory growth over a long-lived session. */
  gc(): void {
    const now = Date.now();
    const cutoff = now - this.windowMs;
    for (const [key, bucket] of this.buckets) {
      if (bucket.calls.every((t) => t <= cutoff)) this.buckets.delete(key);
    }
  }
}

/**
 * Default limiter: 60 calls per tool per 60-second window.
 * Override via RATE_LIMIT_MAX and RATE_LIMIT_WINDOW_MS env vars.
 */
export const defaultLimiter = new RateLimiter(
  Number(process.env['RATE_LIMIT_MAX'] ?? 60),
  Number(process.env['RATE_LIMIT_WINDOW_MS'] ?? 60_000),
);

// Prune stale buckets every 5 minutes.
setInterval(() => defaultLimiter.gc(), 5 * 60 * 1000).unref();
