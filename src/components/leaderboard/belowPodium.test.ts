import { describe, expect, it } from 'vitest';
import { recentSaleWhen, spotLine, zeroEntries } from './belowPodium';
import type { LeaderboardEntry } from './LeaderboardTable';

const entry = (rank: number, totalSales: number, name = `Rep ${rank}`): LeaderboardEntry => ({
  rank,
  salesRepId: `r${rank}`,
  salesRepName: name,
  totalSales,
  totalPoints: totalSales * 10,
});

const board = [entry(1, 9), entry(2, 7), entry(3, 5), entry(4, 4, 'Ana Ruiz'), entry(5, 4), entry(6, 1)];

describe('zeroEntries', () => {
  it('numbers the team at 0 on from the last rank, never inside the podium', () => {
    const unranked = [{ salesRepId: 'a', salesRepName: 'Amy' }, { salesRepId: 'b', salesRepName: 'Ben' }];
    expect(zeroEntries(board, unranked).map((e) => [e.rank, e.totalSales])).toEqual([[7, 0], [8, 0]]);
    expect(zeroEntries(board.slice(0, 1), unranked).map((e) => e.rank)).toEqual([4, 5]);
  });
});

describe('spotLine', () => {
  const base = { entries: board, unranked: [], viewerId: null, metric: 'totalSales' as const };

  it('says nothing on the podium', () => {
    expect(spotLine({ ...base, currentUser: board[2] })).toBeNull();
  });

  it('passes a tied rep with one sale', () => {
    expect(spotLine({ ...base, currentUser: board[4] })).toBe("You're 5th. 1 sale passes Ana Ruiz.");
  });

  it('ties when one sale is exactly the gap, and counts the sales to pass beyond that', () => {
    expect(spotLine({ ...base, currentUser: board[3] })).toBe("You're 4th. 1 sale ties Rep 3.");
    expect(spotLine({ ...base, currentUser: board[5] })).toBe("You're 6th. 4 sales pass Rep 5.");
  });

  it('gives the gap in points on the points board', () => {
    expect(spotLine({ ...base, metric: 'totalPoints', currentUser: board[5] })).toBe("You're 6th. 30 pts behind Rep 5.");
  });

  it('only states the rank when the rep above is off the returned list', () => {
    expect(spotLine({ ...base, currentUser: entry(40, 1) })).toBe("You're 40th.");
    expect(spotLine({ ...base, currentUser: entry(22, 1) })).toBe("You're 22nd.");
  });

  it('puts a rep at 0 on the board with one sale, and leaves non-reps out', () => {
    const unranked = [{ salesRepId: 'me', salesRepName: 'Me' }];
    expect(spotLine({ ...base, unranked, viewerId: 'me', currentUser: null })).toBe('1 sale gets you on the board.');
    expect(spotLine({ ...base, unranked, viewerId: 'admin', currentUser: null })).toBeNull();
  });
});

describe('recentSaleWhen', () => {
  const now = Date.parse('2026-09-16T17:00:00.000Z');

  it('shows minutes for a sale logged the day it happened', () => {
    expect(recentSaleWhen({ repName: 'A', plan: '', at: '2026-09-16T16:48:00.000Z' }, now)).toBe('12m ago');
  });

  it('shows only the day for a sale logged later', () => {
    expect(recentSaleWhen({ repName: 'A', plan: '', at: '2026-09-16T12:00:00.000Z', dayOnly: true }, now)).toBe('Today');
    expect(recentSaleWhen({ repName: 'A', plan: '', at: '2026-09-15T12:00:00.000Z', dayOnly: true }, now)).toBe('Tue');
  });
});
