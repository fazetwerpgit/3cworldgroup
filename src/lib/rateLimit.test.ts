import { describe, expect, it } from 'vitest';
import { createRateLimiter } from './rateLimit';

describe('createRateLimiter', () => {
  it('limits a key within the window and frees it after', () => {
    const limiter = createRateLimiter({ limit: 2, windowMs: 1000 });
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 10)).toBe(true);
    expect(limiter.take('a', 20)).toBe(false);
    expect(limiter.take('b', 20)).toBe(true);
    expect(limiter.take('a', 1010)).toBe(true);
  });

  it('drops keys whose hits have all expired instead of keeping one per caller forever', () => {
    const limiter = createRateLimiter({ limit: 5, windowMs: 1000 });
    for (let i = 0; i < 100; i += 1) limiter.take(`10.0.0.${i}`, i);
    expect(limiter.size()).toBe(100);
    limiter.take('10.0.1.1', 5000);
    expect(limiter.size()).toBe(1);
  });

  it('keeps keys that still have hits in the window when it sweeps', () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });
    limiter.take('old', 0);
    limiter.take('busy', 900);
    expect(limiter.take('new', 1500)).toBe(true);
    expect(limiter.size()).toBe(2);
    expect(limiter.take('busy', 1500)).toBe(false);
  });
});
