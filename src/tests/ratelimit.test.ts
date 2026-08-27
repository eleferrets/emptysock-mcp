import { describe, it, expect } from 'vitest';
import { RateLimiter } from '../lib/ratelimit.js';

describe('RateLimiter', () => {
  it('allows calls within the limit', () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.allow('tool')).toBe(true);
    expect(rl.allow('tool')).toBe(true);
    expect(rl.allow('tool')).toBe(true);
  });

  it('blocks calls that exceed the limit', () => {
    const rl = new RateLimiter(2, 1000);
    rl.allow('tool');
    rl.allow('tool');
    expect(rl.allow('tool')).toBe(false);
  });

  it('uses separate buckets per key', () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.allow('toolA')).toBe(true);
    expect(rl.allow('toolB')).toBe(true); // different key — should still pass
    expect(rl.allow('toolA')).toBe(false);
  });

  it('gc removes exhausted buckets', () => {
    const rl = new RateLimiter(1, 0); // 0ms window — everything expires immediately
    rl.allow('tool');
    rl.gc();
    // After gc with a 0ms window, the bucket should be gone — a fresh call is allowed.
    expect(rl.allow('tool')).toBe(true);
  });
});
