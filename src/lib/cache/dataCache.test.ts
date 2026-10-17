// The portal's in-memory read cache: one signed-in account at a time, entries
// keyed by the subject uid on screen, emptied on sign-out and account switch.
// An owner's cached financials must never reach a rep on the same phone.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATA_CACHE_MAX_AGE_MS,
  DATA_CACHE_MAX_ENTRIES,
  clearDataCache,
  dataCacheGeneration,
  invalidateAfterCompPlanWrite,
  invalidateAfterSaleWrite,
  readDataCacheEntry,
  invalidateDataCache,
  readDataCache,
  setDataCacheOwner,
  writeDataCache,
} from './dataCache';

beforeEach(() => {
  setDataCacheOwner(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('dataCache', () => {
  it('reads nothing and stores nothing with no signed-in account', () => {
    writeDataCache('rep-1', 'sales?limit=500', [1]);
    expect(readDataCache('rep-1', 'sales?limit=500')).toBeUndefined();
    setDataCacheOwner('rep-1');
    expect(readDataCache('rep-1', 'sales?limit=500')).toBeUndefined();
  });

  it('keeps each subject uid separate', () => {
    setDataCacheOwner('owner-1');
    writeDataCache('owner-1', 'comp-plan', { margin: 42 });
    writeDataCache('rep-1', 'comp-plan', { rates: 'rep' });
    expect(readDataCache('owner-1', 'comp-plan')).toEqual({ margin: 42 });
    expect(readDataCache('rep-1', 'comp-plan')).toEqual({ rates: 'rep' });
    expect(readDataCache('rep-2', 'comp-plan')).toBeUndefined();
    expect(readDataCache(null, 'comp-plan')).toBeUndefined();
  });

  it('empties on sign-out', () => {
    setDataCacheOwner('owner-1');
    writeDataCache('owner-1', 'comp-plan', { margin: 42 });
    setDataCacheOwner(null);
    setDataCacheOwner('owner-1');
    expect(readDataCache('owner-1', 'comp-plan')).toBeUndefined();
  });

  it('empties when another account signs in, even for a subject uid both could show', () => {
    setDataCacheOwner('owner-1');
    // The owner viewing as rep-1 cached rep-1's screen (and their own financials).
    writeDataCache('rep-1', 'dashboard', { book: 'as seen by owner' });
    writeDataCache('owner-1', 'comp-plan', { margin: 42 });
    setDataCacheOwner('rep-1');
    expect(readDataCache('rep-1', 'dashboard')).toBeUndefined();
    expect(readDataCache('owner-1', 'comp-plan')).toBeUndefined();
  });

  it('keeps entries when the same account is set again (token refresh)', () => {
    setDataCacheOwner('rep-1');
    writeDataCache('rep-1', 'dashboard', 1);
    setDataCacheOwner('rep-1');
    expect(readDataCache('rep-1', 'dashboard')).toBe(1);
  });

  it('drops one subject’s entries by prefix, and everything on clear', () => {
    setDataCacheOwner('rep-1');
    writeDataCache('rep-1', 'dashboard', 1);
    writeDataCache('rep-1', 'sales?limit=500', 2);
    writeDataCache('rep-2', 'dashboard', 3);
    invalidateDataCache('rep-1', 'dashboard');
    expect(readDataCache('rep-1', 'dashboard')).toBeUndefined();
    expect(readDataCache('rep-1', 'sales?limit=500')).toBe(2);
    expect(readDataCache('rep-2', 'dashboard')).toBe(3);
    clearDataCache();
    expect(readDataCache('rep-1', 'sales?limit=500')).toBeUndefined();
  });

  it('treats an entry past the max age as a miss', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-17T15:00:00Z'));
    setDataCacheOwner('rep-1');
    writeDataCache('rep-1', 'dashboard', 1);
    expect(readDataCacheEntry('rep-1', 'dashboard')).toEqual({ value: 1, at: Date.now() });
    vi.advanceTimersByTime(DATA_CACHE_MAX_AGE_MS - 1000);
    expect(readDataCache('rep-1', 'dashboard')).toBe(1);
    vi.advanceTimersByTime(2000);
    expect(readDataCache('rep-1', 'dashboard')).toBeUndefined();
  });

  it('keeps at most the cap, dropping the least recently used', () => {
    setDataCacheOwner('rep-1');
    for (let i = 0; i < DATA_CACHE_MAX_ENTRIES; i += 1) writeDataCache('rep-1', `k${i}`, i);
    // Reading k0 makes it recent, so k1 is now the oldest.
    expect(readDataCache('rep-1', 'k0')).toBe(0);
    writeDataCache('rep-1', 'extra', 'x');
    expect(readDataCache('rep-1', 'k1')).toBeUndefined();
    expect(readDataCache('rep-1', 'k0')).toBe(0);
    expect(readDataCache('rep-1', 'extra')).toBe('x');
    expect(readDataCache('rep-1', `k${DATA_CACHE_MAX_ENTRIES - 1}`)).toBe(DATA_CACHE_MAX_ENTRIES - 1);
  });

  it('ignores a write from a fetch started under an earlier account', () => {
    setDataCacheOwner('owner-1');
    const gen = dataCacheGeneration();
    setDataCacheOwner('rep-1');
    writeDataCache('rep-1', 'dashboard', 'late', gen);
    expect(readDataCache('rep-1', 'dashboard')).toBeUndefined();
    writeDataCache('rep-1', 'dashboard', 'fresh', dataCacheGeneration());
    expect(readDataCache('rep-1', 'dashboard')).toBe('fresh');
  });

  it('drops sale-derived views for every subject after a sale write', () => {
    setDataCacheOwner('owner-1');
    writeDataCache('owner-1', 'sales?limit=500', 1);
    writeDataCache('rep-1', 'dashboard', 2);
    writeDataCache('rep-1', 'leaderboard?period=month', 3);
    writeDataCache('rep-2', 'fiber-status', 4);
    writeDataCache('rep-1', 'training-list?', 5);
    invalidateAfterSaleWrite('owner-1');
    expect(readDataCache('owner-1', 'sales?limit=500')).toBeUndefined();
    expect(readDataCache('rep-1', 'dashboard')).toBeUndefined();
    expect(readDataCache('rep-1', 'leaderboard?period=month')).toBeUndefined();
    expect(readDataCache('rep-2', 'fiber-status')).toBeUndefined();
    expect(readDataCache('rep-1', 'training-list?')).toBe(5);
  });

  it('drops the plan, pay structure and dashboard after a comp-plan write', () => {
    setDataCacheOwner('owner-1');
    writeDataCache('owner-1', 'comp-plan', 1);
    writeDataCache('rep-1', 'dashboard', 2);
    writeDataCache('owner-1', 'commission', 3);
    writeDataCache('owner-1', 'sales?limit=500', 4);
    invalidateAfterCompPlanWrite();
    expect(readDataCache('owner-1', 'comp-plan')).toBeUndefined();
    expect(readDataCache('rep-1', 'dashboard')).toBeUndefined();
    expect(readDataCache('owner-1', 'commission')).toBeUndefined();
    expect(readDataCache('owner-1', 'sales?limit=500')).toBe(4);
  });
});
