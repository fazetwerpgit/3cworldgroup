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

import { LeaderboardDesktop, LeaderboardDesktopView, type WeeklyChallengeState } from './LeaderboardDesktop';
import type { LeaderboardEntry } from './LeaderboardTable';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const entries: LeaderboardEntry[] = [1, 2, 3, 4, 5, 6].map((rank) => ({
  rank,
  salesRepId: `rep-${rank}`,
  salesRepName: `Rep ${rank}`,
  totalSales: 10 - rank,
  totalPoints: (10 - rank) * 10,
  movement: rank === 4 ? 2 : rank === 6 ? -1 : 0,
  streakDays: rank === 5 ? 3 : 0,
}));

const challenge = (overrides: Partial<WeeklyChallengeState> = {}): WeeklyChallengeState => ({
  sales: 7,
  loading: false,
  target: 10,
  failed: false,
  onRetry: () => {},
  ...overrides,
});

function renderView(props: Partial<Parameters<typeof LeaderboardDesktopView>[0]> = {}) {
  act(() => {
    root.render(
      <LeaderboardDesktopView
        entries={entries}
        currentUser={entries[4]}
        loading={false}
        error={null}
        period="week"
        metric="totalPoints"
        onPeriodChange={() => {}}
        onMetricChange={() => {}}
        viewerName="Ada Lovelace"
        challenge={challenge()}
        {...props}
      />
    );
  });
}

beforeEach(() => {
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

describe('desktop leaderboard', () => {
  it('puts the podium, your standing, the challenge and the ranks on one page', () => {
    renderView();

    expect(container.querySelectorAll('[data-rank]')).toHaveLength(3);
    expect(container.textContent).toContain('Your standing');
    expect(container.textContent).toContain('Weekly challenge');
    expect(container.textContent).toContain('7 of 10');
    expect(container.textContent).toContain('3 more to close 10 sales by Saturday');
    const rows = [...container.querySelectorAll<HTMLElement>('[aria-label="Ranking"] > div')];
    expect(rows.map((row) => row.textContent?.slice(0, 2))).toEqual(['04', '05', '06']);
  });

  it('marks your row and chases the rank above', () => {
    renderView();

    expect(container.querySelector('[data-current-user="true"]')?.textContent).toContain('Rep 5');
    expect(container.textContent).toContain('Rank 5');
    expect(container.textContent).toContain('10 pts behind Rep 4 for #4');
  });

  it('shows movement, streaks and the gap to the next rank', () => {
    renderView();

    expect(container.textContent).toContain('up 2 since yesterday');
    expect(container.textContent).toContain('down 1 since yesterday');
    expect(container.textContent).toContain('3-day streak');
    // Rank 6 is last on the board, so it has no gap to show.
    const last = container.querySelector('[aria-label="Ranking"] > div:last-of-type');
    expect(last?.textContent).toContain('—');
  });

  it('says so when you are not on the board yet', () => {
    renderView({ currentUser: null });

    expect(container.textContent).toContain('Not ranked');
    expect(container.textContent).toContain('Your first approved sale puts you on the board');
    expect(container.textContent).toContain('Ada Lovelace');
  });

  it('never makes up a challenge target when the setting fails', () => {
    const onRetry = vi.fn();
    renderView({ challenge: challenge({ target: null, failed: true, onRetry }) });

    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load");
    act(() => container.querySelector<HTMLButtonElement>('[role="alert"] button')?.click());
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('keeps the stage and says the board is open when nobody has scored', () => {
    renderView({ entries: [], currentUser: null });

    expect(container.querySelectorAll('[data-rank]')).toHaveLength(3);
    expect(container.textContent).toContain('The board is open');
    expect(container.querySelector('[aria-label="Ranking"]')).toBeNull();
  });

  it('builds nothing while the phone board is the visible one', () => {
    act(() => {
      root.render(
        <LeaderboardDesktop
          active={false}
          entries={entries}
          currentUser={entries[1]}
          loading={false}
          error={null}
          period="month"
          metric="totalPoints"
          onPeriodChange={() => {}}
          onMetricChange={() => {}}
        />
      );
    });

    expect(container.textContent).toBe('');
    expect(fetch).not.toHaveBeenCalled();
  });
});
