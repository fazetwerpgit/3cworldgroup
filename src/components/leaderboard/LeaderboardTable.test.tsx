// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LeaderboardTable, type LeaderboardEntry } from './LeaderboardTable';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function entry(rank: number, overrides: Partial<LeaderboardEntry> = {}): LeaderboardEntry {
  return {
    rank,
    salesRepId: `rep-${rank}`,
    salesRepName: `Rep ${rank}`,
    totalSales: 10 - rank,
    totalPoints: 1_000 - rank * 10,
    ...overrides,
  };
}

function renderBoard(entries: LeaderboardEntry[], currentUser: LeaderboardEntry | null = null) {
  act(() => {
    root.render(
      <LeaderboardTable
        entries={entries}
        currentUser={currentUser}
        metric="totalPoints"
        period="week"
      />
    );
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('leaderboard podium', () => {
  it.each([
    { count: 3, openSlots: 0 },
    { count: 2, openSlots: 1 },
    { count: 1, openSlots: 2 },
    { count: 0, openSlots: 3 },
  ])('keeps all podium positions with $count entries', ({ count, openSlots }) => {
    renderBoard(Array.from({ length: count }, (_, index) => entry(index + 1)));

    const slots = [...container.querySelectorAll<HTMLElement>('[data-rank]')];
    expect(slots.map((slot) => slot.dataset.rank)).toEqual(['2', '1', '3']);
    expect(slots.filter((slot) => slot.textContent?.includes('Open'))).toHaveLength(openSlots);
  });
});

describe('ranked list', () => {
  it('starts at four, because the podium already carries the top three', () => {
    renderBoard([entry(1), entry(2), entry(3), entry(4), entry(5)]);

    const rows = [...container.querySelectorAll<HTMLElement>('[aria-label="Ranking"] > div')];
    expect(rows.map((row) => row.textContent?.slice(0, 2))).toEqual(['04', '05']);
  });

  it('keeps the podium slots distinct from the rows', () => {
    renderBoard([entry(1), entry(2), entry(3), entry(4)]);

    expect(container.querySelectorAll('[data-rank]')).toHaveLength(3);
    expect(container.querySelectorAll('[aria-label="Ranking"] > div')).toHaveLength(1);
  });
});

describe('current-user treatment', () => {
  it('highlights a visible row by stable ID', () => {
    const visibleUser = entry(4, { salesRepId: 'current', salesRepName: 'Current User' });
    renderBoard([entry(1), entry(2), entry(3), visibleUser], visibleUser);

    expect(container.querySelector('[data-current-user="true"]')?.textContent).toContain('Current User');
    expect(container.querySelector('[aria-label="Your standing"]')).toBeNull();
  });

  it('does not show the sticky bar when the user is visible in the podium', () => {
    const visibleUser = entry(2, { salesRepId: 'current' });
    renderBoard([entry(1), visibleUser, entry(3)], visibleUser);

    expect(container.querySelector('[aria-label="Your standing"]')).toBeNull();
  });

  it('shows the sticky bar when the user is outside the visible list', () => {
    const outsideUser = entry(17, { salesRepId: 'current', totalPoints: 320 });
    renderBoard([entry(1), entry(2), entry(3), entry(4)], outsideUser);

    expect(container.querySelector('[aria-label="Your standing"]')?.textContent).toContain('You · #17');
    expect(container.querySelector('[aria-label="Your standing"]')?.textContent).toContain('320 pts');
  });

  it('hides the sticky bar on a zero-entry board, where the empty card says it', () => {
    renderBoard([], entry(17, { salesRepId: 'current', totalPoints: 320 }));

    expect(container.querySelector('[aria-label="Your standing"]')).toBeNull();
    expect(container.textContent).toContain('The board is open');
  });

  it('does not show the sticky bar without a current-user standing', () => {
    renderBoard([entry(1), entry(2), entry(3)], null);

    expect(container.querySelector('[aria-label="Your standing"]')).toBeNull();
  });
});
