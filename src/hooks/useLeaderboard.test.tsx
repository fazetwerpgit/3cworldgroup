// @vitest-environment jsdom
//
// The board shows the newest request's answer, and a quiet (resume) refresh
// never shows the skeleton or trades the board for an error.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLeaderboard } from './useLeaderboard';

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
// The hook's fetch, as of the latest render.
const fetchers: FetchBoard[] = [];
let pending: Array<{ url: string; resolve: (response: FakeResponse) => void }> = [];

function Probe() {
  const hook = useLeaderboard();
  fetchers.push(hook.fetchLeaderboard);
  renders.push({ rep: hook.leaderboard[0]?.salesRepId ?? null, loading: hook.loading, error: hook.error });
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
});
