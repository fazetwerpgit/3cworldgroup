// @vitest-environment jsdom
//
// Tab prefetch: warms the Sales and Leaderboard tabs' cache entries with the
// same requests and shapes as their hooks, skips warm entries, never fetches
// the company book, and a screen opening mid-read reuses the read.
import { act, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'rep-1' } }) }));

import { prefetchTab, prefetchTabs, resetTabPrefetchSession, type TabPrefetchContext } from './tabPrefetch';
import { readDataCache, setDataCacheOwner, writeDataCache, dataCacheGeneration } from './dataCache';
import { salesListCacheKey, useSales } from '@/hooks/useSales';
import { FIRST_LEADERBOARD_BOARD, leaderboardCacheKey } from '@/hooks/useLeaderboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const REP: TabPrefetchContext = { uid: 'rep-1', active: true, canViewAll: false, canSales: true, canLeaderboard: true, management: false };
const OWN = { limit: 500, salesRepId: 'rep-1' };

let fetchMock: ReturnType<typeof vi.fn>;
let release: () => void = () => undefined;

function answer(url: string) {
  if (url.startsWith('/api/portal/sales/status')) return { scope: 'own', orders: [] };
  if (url.startsWith('/api/portal/sales?')) return { sales: [{ id: 's1' }], truncated: false };
  if (url.startsWith('/api/portal/comp-plan')) return { scope: 'own', rates: { att: { p1: 50 } }, compRole: 'rep' };
  if (url.startsWith('/api/portal/leaderboard?')) return { leaderboard: [{ id: 'rep-1' }], currentUser: null };
  return {};
}

beforeEach(() => {
  resetTabPrefetchSession();
  setDataCacheOwner(null);
  setDataCacheOwner('rep-1');
  fetchMock = vi.fn(async (url: string) => ({ ok: true, json: async () => answer(url) }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  release();
});

const flush = () => act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
const urls = () => fetchMock.mock.calls.map((call) => String(call[0]));

describe('prefetchTabs', () => {
  it("warms the rep's own book, carrier report, plan and first board", async () => {
    prefetchTabs('/portal/dashboard', REP);
    await flush();
    expect(urls().sort()).toEqual([
      '/api/portal/comp-plan',
      `/api/portal/leaderboard?period=week&metric=totalPoints&limit=100&include=team`,
      '/api/portal/sales/status',
      '/api/portal/sales?salesRepId=rep-1&limit=500',
    ]);
    expect(readDataCache('rep-1', salesListCacheKey(OWN))).toEqual({ sales: [{ id: 's1' }], truncated: false });
    expect(readDataCache('rep-1', 'fiber-status')).toEqual({ scope: 'own', orders: [] });
    expect(readDataCache<{ hasPlan: boolean }>('rep-1', 'comp-plan')?.hasPlan).toBe(true);
    expect(readDataCache('rep-1', leaderboardCacheKey(FIRST_LEADERBOARD_BOARD))).toMatchObject({
      leaderboard: [{ id: 'rep-1' }],
      currentUser: null,
      unranked: [],
      recent: [],
    });
  });

  it('skips the tab on screen and anything already warm', async () => {
    writeDataCache('rep-1', leaderboardCacheKey(FIRST_LEADERBOARD_BOARD), { leaderboard: [] }, dataCacheGeneration());
    prefetchTabs('/portal/sales', REP);
    await flush();
    expect(urls()).toEqual([]);
  });

  it('the idle pass warms the leaderboard once per session; a touch still warms it', async () => {
    const board = '/api/portal/leaderboard?';
    prefetchTabs('/portal/sales', REP);
    await flush();
    expect(urls().filter((url) => url.startsWith(board))).toHaveLength(1);
    // Cache gone cold (or emptied): the idle pass leaves it alone now.
    setDataCacheOwner(null);
    setDataCacheOwner('rep-1');
    prefetchTabs('/portal/sales', REP);
    await flush();
    expect(urls().filter((url) => url.startsWith(board))).toHaveLength(1);
    prefetchTab('/portal/leaderboard', REP);
    await flush();
    expect(urls().filter((url) => url.startsWith(board))).toHaveLength(2);
  });

  it('skips the plan and carrier report prefetch for admin and owner (company-wide view)', async () => {
    prefetchTabs('/portal/dashboard', { ...REP, canViewAll: true, management: true });
    prefetchTab('/portal/sales', { ...REP, canViewAll: true, management: true });
    await flush();
    expect(urls().some((url) => url.startsWith('/api/portal/comp-plan'))).toBe(false);
    expect(urls().some((url) => url.startsWith('/api/portal/sales/status'))).toBe(false);
    expect(urls().some((url) => url.startsWith('/api/portal/leaderboard?'))).toBe(true);
  });

  it('still warms the own carrier report and plan for operations (management without sales:read:all)', async () => {
    prefetchTab('/portal/sales', { ...REP, canViewAll: false, management: true });
    await flush();
    expect(urls().some((url) => url.startsWith('/api/portal/sales/status'))).toBe(true);
    expect(urls().some((url) => url.startsWith('/api/portal/comp-plan'))).toBe(true);
  });

  it("never fetches management's company book on spec", async () => {
    prefetchTab('/portal/sales', { ...REP, canViewAll: true });
    await flush();
    expect(urls().some((url) => url.startsWith('/api/portal/sales?'))).toBe(false);
  });

  it('does nothing for a tab the user cannot open', async () => {
    prefetchTab('/portal/leaderboard', { ...REP, canLeaderboard: false });
    prefetchTab('/portal/sales', { ...REP, canSales: false });
    await flush();
    expect(urls()).toEqual([]);
  });

  it('a read from before an account switch is not cached for the new account', async () => {
    prefetchTab('/portal/leaderboard', REP);
    setDataCacheOwner('rep-2');
    await flush();
    expect(readDataCache('rep-2', leaderboardCacheKey(FIRST_LEADERBOARD_BOARD))).toBeUndefined();
  });

  it('a Sales screen opening mid-read uses the prefetch instead of asking again', async () => {
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    fetchMock.mockImplementation(async (url: string) => {
      await gate;
      return { ok: true, json: async () => answer(url) };
    });
    prefetchTab('/portal/sales', REP);

    let shown: unknown[] = [];
    function Screen() {
      const { sales, fetchSales } = useSales(OWN);
      shown = sales;
      useEffect(() => {
        void fetchSales(OWN);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- once per mount, like the page
      }, []);
      return null;
    }
    const container = document.createElement('div');
    const root = createRoot(container);
    await act(async () => root.render(<Screen />));
    release();
    await flush();
    await flush();
    expect(shown).toEqual([{ id: 's1' }]);
    expect(urls().filter((url) => url.startsWith('/api/portal/sales?'))).toHaveLength(1);
    await act(async () => root.unmount());
  });
});
