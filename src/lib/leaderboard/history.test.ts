import { describe, expect, it } from 'vitest';
import {
  addDaysToKey,
  computeHistory,
  computeStreak,
  dayKey,
  isWeekendKey,
  type SaleRecord,
} from './history';

const sale = (salesRepId: string, iso: string, totalPoints = 10): SaleRecord => ({
  salesRepId,
  saleDate: new Date(iso),
  totalPoints,
});

describe('dayKey', () => {
  it('buckets by America/New_York, not UTC', () => {
    // 02:00 UTC on the 10th is 10pm ET on the 9th.
    expect(dayKey(new Date('2026-07-10T02:00:00Z'))).toBe('2026-07-09');
    expect(dayKey(new Date('2026-07-10T16:00:00Z'))).toBe('2026-07-10');
  });
});

describe('addDaysToKey / isWeekendKey', () => {
  it('walks calendar days', () => {
    expect(addDaysToKey('2026-07-13', -1)).toBe('2026-07-12');
    expect(addDaysToKey('2026-07-01', -1)).toBe('2026-06-30');
  });
  it('flags Sat/Sun', () => {
    expect(isWeekendKey('2026-07-11')).toBe(true); // Sat
    expect(isWeekendKey('2026-07-12')).toBe(true); // Sun
    expect(isWeekendKey('2026-07-13')).toBe(false); // Mon
  });
});

describe('computeStreak', () => {
  it('counts consecutive selling days', () => {
    expect(computeStreak(new Set(['2026-07-08', '2026-07-09', '2026-07-10']), '2026-07-10')).toBe(3);
  });
  it('weekend without a sale does not break the streak (Fri -> Mon)', () => {
    expect(computeStreak(new Set(['2026-07-10', '2026-07-13']), '2026-07-13')).toBe(2);
  });
  it('a weekend sale still counts toward the streak', () => {
    expect(computeStreak(new Set(['2026-07-10', '2026-07-11', '2026-07-13']), '2026-07-13')).toBe(3);
  });
  it('today without a sale is grace, not a break', () => {
    expect(computeStreak(new Set(['2026-07-08', '2026-07-09']), '2026-07-10')).toBe(2);
  });
  it('a saleless weekday breaks the streak', () => {
    // Sold Thu 07-09 only; today Mon 07-13: grace Mon, skip Sun/Sat, Fri had no sale -> 0.
    expect(computeStreak(new Set(['2026-07-09']), '2026-07-13')).toBe(0);
  });
  it('no sales -> 0', () => {
    expect(computeStreak(new Set(), '2026-07-10')).toBe(0);
  });
});

describe('computeHistory', () => {
  const now = new Date('2026-07-10T16:00:00Z'); // Fri noon ET

  it('movement = yesterdayRank - currentRank; null for reps unranked yesterday', () => {
    const periodSales = [
      sale('A', '2026-07-08T16:00:00Z', 20),
      sale('B', '2026-07-08T16:00:00Z', 10),
      sale('B', '2026-07-10T16:00:00Z', 30), // B overtakes A today
      sale('C', '2026-07-10T16:00:00Z', 5),  // C is new today
    ];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['B', 1], ['A', 2], ['C', 3]]),
      periodStartKey: '2026-07-01',
      metric: 'totalPoints',
      now,
    });
    expect(result.get('B')!.movement).toBe(1);  // was #2, now #1
    expect(result.get('A')!.movement).toBe(-1); // was #1, now #2
    expect(result.get('C')!.movement).toBeNull(); // unranked yesterday
  });

  it('spark has 7 entries oldest->newest with nulls before period start and before first sale', () => {
    const periodSales = [sale('A', '2026-07-08T16:00:00Z', 20)];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['A', 1]]),
      periodStartKey: '2026-07-06',
      metric: 'totalPoints',
      now,
    });
    // Days 07-04..07-10: 04,05 predate period start -> null; 06,07 unranked -> null; 08,09,10 -> rank 1.
    expect(result.get('A')!.spark).toEqual([null, null, null, null, 1, 1, 1]);
  });

  it('first day of a period yields movement null for everyone', () => {
    const periodSales = [sale('A', '2026-07-10T16:00:00Z', 20)];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['A', 1]]),
      periodStartKey: '2026-07-10',
      metric: 'totalPoints',
      now,
    });
    expect(result.get('A')!.movement).toBeNull();
  });

  it('streak uses allSales even when outside the period', () => {
    const periodSales = [sale('A', '2026-07-10T16:00:00Z', 20)];
    const allSales = [...periodSales, sale('A', '2026-07-09T16:00:00Z', 5)];
    const result = computeHistory({
      periodSales,
      allSales,
      currentRanks: new Map([['A', 1]]),
      periodStartKey: '2026-07-10',
      metric: 'totalPoints',
      now,
    });
    expect(result.get('A')!.streakDays).toBe(2);
  });

  it('ranks by totalSales when that metric is selected', () => {
    const periodSales = [
      sale('A', '2026-07-08T16:00:00Z', 100), // 1 sale, 100 pts
      sale('B', '2026-07-08T16:00:00Z', 1),   // 2 sales, 2 pts
      sale('B', '2026-07-09T16:00:00Z', 1),
    ];
    const result = computeHistory({
      periodSales,
      allSales: periodSales,
      currentRanks: new Map([['B', 1], ['A', 2]]),
      periodStartKey: '2026-07-01',
      metric: 'totalSales',
      now,
    });
    // Yesterday (07-09) by sales count: B(2) #1, A(1) #2 -> no movement.
    expect(result.get('B')!.movement).toBe(0);
    expect(result.get('A')!.movement).toBe(0);
  });
});
