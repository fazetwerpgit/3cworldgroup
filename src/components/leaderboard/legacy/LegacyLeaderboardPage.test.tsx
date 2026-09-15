// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: null }));

vi.mock('@/hooks/useLeaderboard', () => ({
  useLeaderboard: () => ({
    leaderboard: [],
    currentUser: { rank: 2, salesRepId: 'rep-2', salesRepName: 'Rep 2', totalSales: 3, totalPoints: 30 },
    loading: false,
    error: null,
    fetchLeaderboard: vi.fn(),
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

function render(active: boolean) {
  act(() => {
    root.render(
      <LegacyLeaderboardPage
        active={active}
        entries={entries}
        currentUser={entries[1]}
        loading={false}
        error={null}
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

  it('builds nothing while the phone board is the visible one', () => {
    render(false);

    expect(container.textContent).toBe('');
  });
});
