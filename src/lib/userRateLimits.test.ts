import { beforeEach, describe, expect, it } from 'vitest';
import { resetUserRateLimits, userRateLimited } from './userRateLimits';

beforeEach(() => resetUserRateLimits());

describe('userRateLimited', () => {
  it('lets 30 chat messages a minute through, then answers 429 with Retry-After', async () => {
    for (let i = 0; i < 30; i += 1) expect(userRateLimited('chatMessage', 'rep-1')).toBeNull();
    const limited = userRateLimited('chatMessage', 'rep-1');
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get('Retry-After')).toBe('60');
    await expect(limited?.json()).resolves.toMatchObject({ code: 'rate_limited' });
  });

  it('counts each user and each kind on its own', () => {
    for (let i = 0; i < 10; i += 1) expect(userRateLimited('formSubmit', 'rep-1')).toBeNull();
    expect(userRateLimited('formSubmit', 'rep-1')?.status).toBe(429);
    expect(userRateLimited('formSubmit', 'rep-2')).toBeNull();
    expect(userRateLimited('chatUpload', 'rep-1')).toBeNull();
  });
});
