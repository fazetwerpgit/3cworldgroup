// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  fetchLeaderboard: vi.fn(),
  leaderboard: [] as Array<{
    rank: number;
    salesRepId: string;
    salesRepName: string;
    totalSales: number;
    totalPoints: number;
  }>,
  currentUser: null as {
    rank: number;
    salesRepId: string;
    salesRepName: string;
    totalSales: number;
    totalPoints: number;
  } | null,
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'current', displayName: 'Ada Lovelace', avatarUrl: null } }),
}));

vi.mock('@/lib/firebase/config', () => ({ auth: null }));

vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => ({
    get leaderboard() {
      return testState.leaderboard;
    },
    get currentUser() {
      return testState.currentUser;
    },
    loading: false,
    error: null,
    fetchLeaderboard: testState.fetchLeaderboard,
  }),
}));

import { LeaderboardRoute } from '@/components/leaderboard/LeaderboardRoute';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

/** jsdom has no layout, so the route's breakpoint is whatever this says.
 *  Reduced motion is left on: the legacy board's count-up then settles in one
 *  frame instead of animating through a test. */
function setViewport(wide: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('1024') ? wide : true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

function board() {
  return [1, 2, 3, 4].map((rank) => ({
    rank,
    salesRepId: `rep-${rank}`,
    salesRepName: `Rep ${rank}`,
    totalSales: rank,
    totalPoints: rank * 10,
  }));
}

beforeEach(() => {
  testState.fetchLeaderboard.mockClear();
  testState.leaderboard = [];
  testState.currentUser = null;
  setViewport(false);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('leaderboard page filters', () => {
  it('loads the week board by default and refetches for working filters', async () => {
    // A populated board: the standing bar only renders when there are entries.
    testState.leaderboard = board();

    await act(async () => root.render(<LeaderboardRoute />));

    expect(testState.fetchLeaderboard).toHaveBeenLastCalledWith('week', 'totalPoints', 100);
    expect(container.textContent).toContain('Weekly points · resets Sunday');
    expect(container.querySelector('[data-testid="standing-copy"]')?.textContent).toBe('You · unranked · 0 pts this week');
    expect(container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Ada Lovelace avatar');
    expect(container.querySelector('[role="img"]')?.textContent).toBe('AL');

    const buttons = [...container.querySelectorAll<HTMLButtonElement>('button')];
    const month = buttons.find((button) => button.textContent === 'Month');
    const sales = buttons.find((button) => button.textContent === 'Sales');

    await act(async () => month?.click());
    expect(testState.fetchLeaderboard).toHaveBeenLastCalledWith('month', 'totalPoints', 100);
    expect(container.textContent).toContain('Monthly points · resets on the 1st');

    await act(async () => sales?.click());
    expect(testState.fetchLeaderboard).toHaveBeenLastCalledWith('month', 'totalSales', 100);
    expect(container.textContent).toContain('Monthly sales · resets on the 1st');
    expect(container.querySelector('[data-testid="standing-copy"]')?.textContent).toBe('You · unranked · 0 sales this month');

    const year = buttons.find((button) => button.textContent === 'Year');
    const allTime = buttons.find((button) => button.textContent === 'All time');

    await act(async () => year?.click());
    expect(testState.fetchLeaderboard).toHaveBeenLastCalledWith('year', 'totalSales', 100);
    expect(container.textContent).toContain('Yearly sales · resets Jan 1');
    expect(container.querySelector('[data-testid="standing-copy"]')?.textContent).toBe('You · unranked · 0 sales this year');

    await act(async () => allTime?.click());
    expect(testState.fetchLeaderboard).toHaveBeenLastCalledWith('all', 'totalSales', 100);
    expect(container.textContent).toContain('All-time sales');
    expect(container.querySelector('[data-testid="standing-copy"]')?.textContent).toBe('You · unranked · 0 sales all time');
  });

  it('uses the exact outside-list standing text', async () => {
    testState.leaderboard = board();
    testState.currentUser = {
      rank: 17,
      salesRepId: 'current',
      salesRepName: 'Ada Lovelace',
      totalSales: 4,
      totalPoints: 320,
    };

    await act(async () => root.render(<LeaderboardRoute />));

    expect(container.querySelector('[data-testid="standing-copy"]')?.textContent).toBe('You · #17 · 320 pts');
  });
});

describe('breakpoint switch', () => {
  it('builds only the phone board below 1024px', async () => {
    testState.leaderboard = board();

    await act(async () => root.render(<LeaderboardRoute />));

    expect(container.querySelectorAll('[data-rank]')).toHaveLength(3);
    expect(container.textContent).not.toContain('Weekly challenge');
    // The legacy board's own calls stay off with it.
    expect(testState.fetchLeaderboard).not.toHaveBeenCalledWith('week', 'totalSales', 1, 'submitted');
  });

  it('builds only the legacy desktop board at 1024px and up', async () => {
    setViewport(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    testState.leaderboard = board();

    await act(async () => root.render(<LeaderboardRoute />));

    expect(container.textContent).toContain('Weekly challenge');
    expect(container.textContent).toContain('Your standing');
    // The phone podium is the redesign's alone.
    expect(container.querySelectorAll('[data-rank]')).toHaveLength(0);
    expect(testState.fetchLeaderboard).toHaveBeenCalledWith('week', 'totalPoints', 100);
    expect(testState.fetchLeaderboard).toHaveBeenCalledWith('week', 'totalSales', 1, 'submitted');
  });

  it('shares one board fetch with whichever page is on screen', async () => {
    testState.leaderboard = board();

    await act(async () => root.render(<LeaderboardRoute />));

    const boardCalls = testState.fetchLeaderboard.mock.calls.filter((call) => call[2] === 100);
    expect(boardCalls).toHaveLength(1);
  });
});
