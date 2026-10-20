// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LegacyLeaderboardTable } from './LegacyLeaderboardTable';
import type { LeaderboardEntry } from '../LeaderboardTable';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const entries: LeaderboardEntry[] = [1, 2, 3].map((rank) => ({
  rank,
  salesRepId: `rep-${rank}`,
  salesRepName: `Rep ${rank}`,
  totalSales: 10 - rank * 2,
  totalPoints: 100 - rank * 10,
}));

function render(props: { metric?: 'totalPoints' | 'totalSales'; period?: 'week' | 'month' | 'year' | 'all' } = {}) {
  act(() => {
    root.render(
      <LegacyLeaderboardTable
        entries={entries}
        currentUser={entries[0]}
        metric={props.metric ?? 'totalPoints'}
        period={props.period ?? 'week'}
      />
    );
  });
}

function pulse() {
  return container.querySelector('[aria-label="Team pulse"]')?.textContent ?? '';
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  window.matchMedia = ((query: string) => ({
    matches: true, media: query, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('LegacyLeaderboardTable team pulse', () => {
  it('counts the week down to Sunday midnight Chicago: a full 7 days on Sunday morning', () => {
    // Sunday 2026-10-18 09:00 Chicago (CDT, UTC-5).
    vi.setSystemTime(new Date('2026-10-18T14:00:00.000Z'));
    render();
    expect(pulse()).toContain('7 days left');
  });

  it('shows 1 day left on Saturday, when the week closes that night', () => {
    // Saturday 2026-10-24 12:00 Chicago.
    vi.setSystemTime(new Date('2026-10-24T17:00:00.000Z'));
    render();
    expect(pulse()).toContain('1 day left');
  });

  it('uses the Chicago day, not the device day, near midnight', () => {
    // 2026-10-25 03:00 UTC is still Saturday 22:00 in Chicago.
    vi.setSystemTime(new Date('2026-10-25T03:00:00.000Z'));
    render();
    expect(pulse()).toContain('1 day left');
  });

  it('counts the month down to the 1st at Chicago midnight', () => {
    // 2026-10-31 23:00 Chicago is already Nov 1 in UTC.
    vi.setSystemTime(new Date('2026-11-01T04:00:00.000Z'));
    render({ period: 'month' });
    expect(pulse()).toContain('1 day left');
  });

  it('labels the leader margin in the active metric', () => {
    vi.setSystemTime(new Date('2026-10-18T14:00:00.000Z'));
    render({ metric: 'totalSales' });
    expect(pulse()).toContain('Leading by 2');
    expect(pulse()).toContain('over #2 in sales');
    expect(pulse()).not.toContain('in pts');
    render({ metric: 'totalPoints' });
    expect(pulse()).toContain('over #2 in pts');
  });
});
