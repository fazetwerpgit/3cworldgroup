// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: null }));

const weekly = vi.hoisted(() => ({
  currentUser: { rank: 2, salesRepId: 'rep-2', salesRepName: 'Rep 2', totalSales: 3, totalPoints: 30 } as unknown,
  error: null as string | null,
  fetchLeaderboard: (() => {}) as (...args: unknown[]) => void,
}));

vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => ({
    leaderboard: [],
    currentUser: weekly.currentUser,
    loading: false,
    error: weekly.error,
    fetchLeaderboard: weekly.fetchLeaderboard,
  }),
}));

import { LegacyLeaderboardPage } from './LegacyLeaderboardPage';
import type { LeaderboardEntry } from '../LeaderboardTable';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const entries: LeaderboardEntry[] = [1, 2, 3, 4].map((rank) => ({
  rank,
  salesRepId: `rep-${rank}`,
  salesRepName: `Rep ${rank}`,
  totalSales: 5 - rank,
  totalPoints: (5 - rank) * 10,
}));

function render(active: boolean, extra: { error?: string | null; onRetry?: () => void } = {}) {
  act(() => {
    root.render(
      <LegacyLeaderboardPage
        active={active}
        entries={entries}
        currentUser={entries[1]}
        loading={false}
        error={extra.error ?? null}
        onRetry={extra.onRetry}
        period="month"
        metric="totalPoints"
        onPeriodChange={() => {}}
        onMetricChange={() => {}}
        viewerName="Ada Lovelace"
      />
    );
  });
}

beforeEach(() => {
  weekly.currentUser = { rank: 2, salesRepId: 'rep-2', salesRepName: 'Rep 2', totalSales: 3, totalPoints: 30 };
  weekly.error = null;
  weekly.fetchLeaderboard = vi.fn();
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('legacy desktop leaderboard', () => {
  it('renders the master page: filters, challenge, standing and the board', () => {
    render(true);

    expect(container.textContent).toContain('Leaderboard');
    expect(container.textContent).toContain('4 ranked');
    ['This Week', 'This Month', 'This Year', 'All Time', 'Points', 'Sales', 'Live'].forEach((label) => {
      expect(container.textContent).toContain(label);
    });
    expect(container.textContent).toContain('Weekly challenge');
    expect(container.textContent).toContain('Your standing');
    expect(container.textContent).toContain('Rep 1');
    expect(container.textContent).toContain('Rep 4');
  });

  it('shows plain words and a retry instead of the raw fetch error', () => {
    const onRetry = vi.fn();
    render(true, { error: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, onRetry });

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Couldn't refresh the board");
    expect(container.textContent).not.toContain('Unexpected token');
    const button = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Try again');
    expect(button).toBeTruthy();
    act(() => button!.click());
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says the weekly sales failed to load rather than showing 0 as progress', async () => {
    weekly.currentUser = null;
    weekly.error = 'Failed to fetch';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ targetSales: 10 }) }));
    render(true);
    await act(async () => {});

    expect(container.textContent).toContain('Close 10 sales by Saturday');
    expect(container.textContent).toContain("Couldn't load your sales");
    expect(container.textContent).not.toMatch(/0 of 10/);
    const fetchWeekly = weekly.fetchLeaderboard as ReturnType<typeof vi.fn>;
    fetchWeekly.mockClear();
    const retry = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Retry');
    act(() => retry!.click());
    expect(fetchWeekly).toHaveBeenCalledWith('week', 'totalSales', 1, 'submitted');
  });

  it('shows the weekly count once both the target and the standing load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ targetSales: 10 }) }));
    render(true);
    await act(async () => {});

    expect(container.textContent).toMatch(/3 of 10, /);
    expect(container.textContent).not.toContain("Couldn't load your sales");
  });

  it('builds nothing while the phone board is the visible one', () => {
    render(false);

    expect(container.textContent).toBe('');
  });
});
