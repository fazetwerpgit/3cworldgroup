// @vitest-environment jsdom
//
// The board shows the newest request's answer, and a quiet (resume) refresh
// never shows the skeleton or trades the board for an error.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { leaderboardCacheKey, solarBoardFromResponse, useLeaderboard } from './useLeaderboard';

vi.mock('@/lib/firebase/config', () => ({ auth: null }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Snapshot {
  rep: string | null;
  loading: boolean;
  error: string | null;
}
interface FakeResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

let root: Root;
type FetchBoard = (
  period: 'week' | 'month',
  metric?: 'totalPoints',
  limit?: number,
  scope?: 'approved',
  options?: { quiet?: boolean }
) => Promise<void>;

let renders: Snapshot[] = [];
let lastStaleAt: number | null = null;
// The hook's fetch, as of the latest render.
const fetchers: FetchBoard[] = [];
let pending: Array<{ url: string; resolve: (response: FakeResponse) => void }> = [];

function Probe() {
  const hook = useLeaderboard();
  // Recorded after each commit (an effect with no deps), not during render:
  // writing module variables in render is a side effect the hooks rules forbid.
  useEffect(() => {
    fetchers.push(hook.fetchLeaderboard);
    lastStaleAt = hook.staleAt;
    renders.push({ rep: hook.leaderboard[0]?.salesRepId ?? null, loading: hook.loading, error: hook.error });
  });
  return null;
}

const fetchLeaderboard: FetchBoard = (...args) => fetchers.at(-1)!(...args);

const board = (name: string) => ({ leaderboard: [{ rank: 1, salesRepId: name, salesRepName: name, totalSales: 1, totalPoints: 1 }] });

async function answer(index: number, ok: boolean, body: unknown) {
  await act(async () => {
    pending[index].resolve({ ok, status: ok ? 200 : 503, json: async () => body });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

beforeEach(() => {
  renders = [];
  pending = [];
  vi.stubGlobal('fetch', (url: string) => {
    const { promise, resolve } = Promise.withResolvers<FakeResponse>();
    pending.push({ url, resolve });
    return promise;
  });
  root = createRoot(document.createElement('div'));
  act(() => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('useLeaderboard', () => {
  it('keeps the newest period when an older answer arrives last', async () => {
    await act(async () => {
      void fetchLeaderboard('week');
      void fetchLeaderboard('month');
    });
    expect(pending.map((p) => p.url)).toEqual([
      expect.stringContaining('period=week'),
      expect.stringContaining('period=month'),
    ]);
    await answer(1, true, board('month-rep'));
    await answer(0, true, board('week-rep'));
    expect(renders.at(-1)).toEqual({ rep: 'month-rep', loading: false, error: null });
  });

  it('refreshes quietly: no loading, and a failure keeps the board', async () => {
    await act(async () => void fetchLeaderboard('week'));
    await answer(0, true, board('before'));
    const before = renders.length;

    await act(async () => void fetchLeaderboard('week', 'totalPoints', 10, 'approved', { quiet: true }));
    await answer(1, false, { error: 'down' });
    expect(renders.at(-1)).toEqual({ rep: 'before', loading: false, error: null });

    await act(async () => void fetchLeaderboard('week', 'totalPoints', 10, 'approved', { quiet: true }));
    await answer(2, true, board('after'));
    expect(renders.at(-1)).toEqual({ rep: 'after', loading: false, error: null });
    expect(renders.slice(before).some((r) => r.loading)).toBe(false);
  });

  it('a failed load of a new board drops the previous board instead of showing it under the new labels', async () => {
    await act(async () => void fetchLeaderboard('week'));
    await answer(0, true, board('week-rep'));
    expect(renders.at(-1)).toEqual({ rep: 'week-rep', loading: false, error: null });

    await act(async () => void fetchLeaderboard('month'));
    await answer(1, false, { error: 'down' });
    expect(renders.at(-1)).toEqual({ rep: null, loading: false, error: 'down' });
  });

  it('notes when the board was loaded after a quiet refresh fails, and clears it on success', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await act(async () => void fetchLeaderboard('week'));
    await answer(0, true, board('before'));
    expect(lastStaleAt).toBeNull();

    await act(async () => void fetchLeaderboard('week', 'totalPoints', 10, 'approved', { quiet: true }));
    await answer(1, false, { error: 'down' });
    expect(typeof lastStaleAt).toBe('number');

    await act(async () => void fetchLeaderboard('week', 'totalPoints', 10, 'approved', { quiet: true }));
    await answer(2, true, board('after'));
    expect(lastStaleAt).toBeNull();
  });
});

describe('solar board answers', () => {
  it('map onto the fiber board shape, booked consults in both counts', () => {
    const board = solarBoardFromResponse({
      leaderboard: [{ rank: 1, uid: 'ana', name: 'Ana R', booked: 3, mix: [{ tier: 'Virtual', count: 3 }], movement: 1, spark: [null, 1], streakDays: 2 }],
      currentUser: { rank: 1, uid: 'ana', name: 'Ana R', booked: 3 },
      unranked: [{ uid: 'ben', name: 'Ben C' }],
      recent: [{ repName: 'Ana R', plan: 'Virtual', at: '2026-10-12T15:00:00.000Z' }],
      totalRanked: 1,
    });
    expect(board.leaderboard[0]).toEqual({
      rank: 1, salesRepId: 'ana', salesRepName: 'Ana R', totalSales: 3, totalPoints: 3,
      movement: 1, spark: [null, 1], streakDays: 2, planMix: [{ tier: 'Virtual', count: 3 }],
    });
    expect(board.currentUser).toMatchObject({ salesRepId: 'ana', totalSales: 3 });
    expect(board.unranked).toEqual([{ salesRepId: 'ben', salesRepName: 'Ben C' }]);
    expect(board.totalRanked).toBe(1);
  });

  it('read `count` (Demoed / Closed rows carry no `booked`)', () => {
    const board = solarBoardFromResponse({ leaderboard: [{ rank: 1, uid: 'ana', name: 'Ana R', count: 4, mix: [] }] });
    expect(board.leaderboard[0]).toMatchObject({ totalSales: 4, totalPoints: 4, planMix: [] });
  });

  it('cache each of Set | Demoed | Closed apart', () => {
    const request = { period: 'week', limit: 100, team: true, source: 'solar' } as const;
    const keys = (['bookedConsults', 'solarDemoed', 'solarClosed'] as const).map((metric) => leaderboardCacheKey({ ...request, metric }));
    expect(new Set(keys).size).toBe(3);
    expect(keys[1]).toContain('metric=solarDemoed');
  });

  it('cache apart from the fiber board', () => {
    const request = { period: 'week', metric: 'bookedConsults', limit: 100, team: true } as const;
    expect(leaderboardCacheKey({ ...request, source: 'solar' })).not.toBe(leaderboardCacheKey(request));
  });
});
