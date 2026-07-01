import { describe, it, expect } from 'vitest';
import { isOnline, ONLINE_WINDOW_MS } from './isOnline';

const NOW = 1_700_000_000_000;

describe('isOnline', () => {
  it('is online when active just now', () => {
    expect(isOnline(NOW, NOW)).toBe(true);
  });
  it('is online at the edge of the window', () => {
    expect(isOnline(NOW - ONLINE_WINDOW_MS, NOW)).toBe(true);
  });
  it('is offline just past the window', () => {
    expect(isOnline(NOW - ONLINE_WINDOW_MS - 1000, NOW)).toBe(false);
  });
  it('is offline for null/undefined', () => {
    expect(isOnline(null, NOW)).toBe(false);
    expect(isOnline(undefined, NOW)).toBe(false);
  });
  it('accepts Date, ISO string, and millis', () => {
    expect(isOnline(new Date(NOW - 1000), NOW)).toBe(true);
    expect(isOnline(new Date(NOW - 1000).toISOString(), NOW)).toBe(true);
    expect(isOnline(NOW - 1000, NOW)).toBe(true);
  });
  it('is offline for an unparseable string', () => {
    expect(isOnline('not-a-date', NOW)).toBe(false);
  });
  it('does not treat a far-future timestamp as online (clock skew guard)', () => {
    expect(isOnline(NOW + 10 * 60 * 1000, NOW)).toBe(false);
  });
});
