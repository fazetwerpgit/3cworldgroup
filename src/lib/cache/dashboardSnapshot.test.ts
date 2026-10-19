// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authState = vi.hoisted(() => ({ currentUser: null as { uid: string } | null }));
vi.mock('@/lib/firebase/config', () => ({ auth: authState }));

import {
  clearDashboardSnapshots,
  readDashboardSnapshot,
  SNAPSHOT_MAX_AGE_MS,
  writeDashboardSnapshot,
} from './dashboardSnapshot';

const BOOK = {
  book: {
    status: 'ready',
    data: {
      sales: [{ id: 's1', saleDate: new Date('2026-10-01T12:00:00Z') }],
      fiberBySale: new Map([['s1', { id: 'o1' }]]),
      carrierFailed: false,
    },
  },
};

beforeEach(() => {
  window.localStorage.clear();
  authState.currentUser = { uid: 'rep1' };
});

describe('dashboard snapshot', () => {
  it('round-trips Dates and Maps for the signed-in account', () => {
    writeDashboardSnapshot('rep1', BOOK, 1000);
    vi.spyOn(Date, 'now').mockReturnValue(2000);
    const read = readDashboardSnapshot<typeof BOOK>('rep1');
    vi.restoreAllMocks();
    expect(read?.at).toBe(1000);
    expect(read?.value.book.data.sales[0].saleDate).toBeInstanceOf(Date);
    expect(read?.value.book.data.sales[0].saleDate.toISOString()).toBe('2026-10-01T12:00:00.000Z');
    expect(read?.value.book.data.fiberBySale.get('s1')).toEqual({ id: 'o1' });
  });

  it('never reads or writes for anyone but the signed-in account', () => {
    writeDashboardSnapshot('rep2', BOOK, Date.now());
    expect(window.localStorage.length).toBe(0);
    writeDashboardSnapshot('rep1', BOOK, Date.now());
    authState.currentUser = { uid: 'rep2' };
    expect(readDashboardSnapshot('rep1')).toBeUndefined();
    expect(readDashboardSnapshot('rep2')).toBeUndefined();
    authState.currentUser = null;
    expect(readDashboardSnapshot('rep1')).toBeUndefined();
  });

  it('keeps one account only: a new account drops the previous one', () => {
    writeDashboardSnapshot('rep1', BOOK, Date.now());
    authState.currentUser = { uid: 'rep2' };
    writeDashboardSnapshot('rep2', BOOK, Date.now());
    expect(window.localStorage.length).toBe(1);
    authState.currentUser = { uid: 'rep1' };
    expect(readDashboardSnapshot('rep1')).toBeUndefined();
  });

  it('ignores a stale snapshot and is gone after sign-out', () => {
    writeDashboardSnapshot('rep1', BOOK, Date.now() - SNAPSHOT_MAX_AGE_MS - 1);
    expect(readDashboardSnapshot('rep1')).toBeUndefined();
    writeDashboardSnapshot('rep1', BOOK, Date.now());
    expect(readDashboardSnapshot('rep1')).toBeDefined();
    clearDashboardSnapshots();
    expect(window.localStorage.length).toBe(0);
  });

  it('ignores another version or a tampered uid', () => {
    window.localStorage.setItem('3c:dash:v1:rep1', JSON.stringify({ v: 1, uid: 'rep2', at: Date.now(), value: {} }));
    expect(readDashboardSnapshot('rep1')).toBeUndefined();
    window.localStorage.setItem('3c:dash:v1:rep1', JSON.stringify({ v: 0, uid: 'rep1', at: Date.now(), value: {} }));
    expect(readDashboardSnapshot('rep1')).toBeUndefined();
  });
});
