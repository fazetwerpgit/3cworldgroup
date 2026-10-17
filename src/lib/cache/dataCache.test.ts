// The portal's in-memory read cache: one signed-in account at a time, entries
// keyed by the subject uid on screen, emptied on sign-out and account switch.
// An owner's cached financials must never reach a rep on the same phone.
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearDataCache,
  invalidateDataCache,
  readDataCache,
  setDataCacheOwner,
  writeDataCache,
} from './dataCache';

beforeEach(() => {
  setDataCacheOwner(null);
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
});
