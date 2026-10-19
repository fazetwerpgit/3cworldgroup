// Money and cross-screen consistency (audit 13-money-date). Time-zone
// independent; the time-zone cases are in lib/sales/chicagoClock.test.ts.
import { describe, expect, it } from 'vitest';
import type { FiberOrder } from '@/types';
import { AE1, AE2, noonUtc, order, sale } from '@/lib/pay/moneyDateFixtures';
import { expectedPayForSale } from '@/lib/pay/expectedPay';
import { estimateDollars } from '@/lib/pay/estimate';
import { groupPaySales, sumExpectedPay } from '@/lib/pay/payGroups';
import { nextPayout, payoutWindowForInstall, formatPayoutWindow } from '@/lib/pay/payoutWindow';
import { chargebackFor, boardCountedSales } from '@/lib/pay/chargeback';
import { summarizePay } from '@/lib/dashboard/repSummary';
import { summarizeMoney, ownerPeriods, type PricedInstall } from '@/lib/owner/companySummary';
import { summarizeMarkets } from '@/lib/owner/markets';
import { buildOwnerWidgetData, buildWidgetData } from '@/lib/app/shellExtras';
import { tallyBoard, boardSales, companyFiberBySale, rankedBoard, sortBoard, topRepOf } from '@/lib/leaderboard/board';
import { countedBoardSales, rankBoard } from '@/lib/ask/liveData';
import { summarizeCompanySales } from '@/lib/sales/companyTapeStats';
import { periodBounds } from '@/lib/leaderboard/periods';
import { buildMergedBook, fiberBySaleFromBook } from '@/lib/sales/mergeBook';
import { countedSales } from '@/lib/sales/installBucket';

describe('M1 rounding: exact sums, rounded down once; every screen agrees', () => {
  const now = new Date('2026-10-20T17:00:00Z');

  it.each([
    ['1 x tfiber-300 (67.5)', ['tfiber-300'], 1, 67.5, 67],
    ['2 x tfiber-300', ['tfiber-300'], 2, 135, 135],
    ['10 x tfiber-500 (97.5)', ['tfiber-500'], 10, 975, 975],
    ['4 x xfinity-tv (37.5)', ['xfinity-tv'], 4, 150, 150],
    ['3 x tfiber-300', ['tfiber-300'], 3, 202.5, 202],
  ])('%s: exact %s, shown $%s (was rounded up per sale)', (_label, ids, count, exact, shown) => {
    const sales = Array.from({ length: count as number }, () => sale({ productIds: ids as string[] }));
    expect(sumExpectedPay(sales, AE1)).toBe(exact);
    expect(estimateDollars(sumExpectedPay(sales, AE1)!)).toBe(shown);
  });

  it.each([1, 2, 3])('%s tfiber-300 install(s): dashboard, Pay list, payout window, widget and owner commissions agree', (count) => {
    const installs = Array.from({ length: count }, (_, i) =>
      sale({ productIds: ['tfiber-300'], saleDate: noonUtc('2026-10-02'), installDate: noonUtc(`2026-10-0${5 + i}`) })
    );
    const pay = summarizePay(installs, new Map(), AE1, now);
    const payList = groupPaySales(installs, new Map(), AE1, { month: { year: 2026, month: 9 } })
      .reduce((sum, group) => sum + (group.amount ?? 0), 0);
    const window = nextPayout(installs, AE1, new Date('2026-10-08T17:00:00Z'))!;
    const widget = buildWidgetData({ uidHash: 'x', estThisMonth: pay.estThisMonth, hasPlan: true, monthCount: pay.monthCount, standing: null, now });
    const priced: PricedInstall[] = installs.map((s) => ({
      saleId: s.id!, repId: 'repA', installDate: s.installDate as Date, sale: s,
      revenue: 225, commission: expectedPayForSale(s, AE1)!, hasRepPlan: true,
    }));
    const owner = summarizeMoney(priced, ownerPeriods(now)).month.current.commissions;
    const expected = Math.floor(67.5 * count);
    expect({
      dashboard: estimateDollars(pay.estThisMonth!),
      payList: estimateDollars(payList),
      window: estimateDollars(window.amount!),
      widget: widget.estPayMtd,
      owner,
    }).toEqual({ dashboard: expected, payList: expected, window: expected, widget: expected, owner: expected });
  });

  it('a chargeback nets out exactly before the one round down', () => {
    const installed = sale({ productIds: ['tfiber-300'], saleDate: noonUtc('2026-10-02'), installDate: noonUtc('2026-10-05') });
    const churned = sale({ productIds: ['tfiber-300'], saleDate: noonUtc('2026-08-02'), installDate: noonUtc('2026-08-03') });
    const fiber = new Map<string, FiberOrder>([
      [churned.id!, order({ status: 'churned', activationDate: '2026-08-03', deactivationDate: '2026-10-10' })],
    ]);
    // +67.5 install, -67.5 chargeback in October: exactly 0, never -1.
    expect(summarizePay([installed, churned], fiber, AE1, now).estThisMonth).toBe(0);
  });
});

describe('M2 the weekly Tier 2 bump is NOT applied automatically (needs Jeremy\'s approval per case)', () => {
  it('7 tfiber-300 installs in one Sun-Sat week stay on the Tier 1 rate: 7 x 67.5 = 472.5 (shown $472)', () => {
    const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];
    const sales = week.map((day) => sale({ productIds: ['tfiber-300'], installDate: noonUtc(day) }));
    expect(AE2.tfiber['tfiber-300']).toBe(90);
    expect(sumExpectedPay(sales, AE1)).toBe(472.5);
  });
});

describe('M3 chargeback 120-day boundary', () => {
  const s = sale({ installDate: noonUtc('2026-06-01') });
  it.each([
    ['day 120 -> chargeback', '2026-06-01', '2026-09-29', true],
    ['day 121 -> none', '2026-06-01', '2026-09-30', false],
    ['leap: 2028-02-01 + 120 = 2028-05-31', '2028-02-01', '2028-05-31', true],
    ['deactivation BEFORE activation (bad data) -> no chargeback', '2026-06-10', '2026-06-01', false],
    ['deactivation on the activation day -> chargeback (day 0)', '2026-06-10', '2026-06-10', true],
  ])('%s', (_label, activation, deactivation, expected) => {
    const o = order({ status: 'churned', activationDate: activation as string, deactivationDate: deactivation as string });
    expect(!!chargebackFor(s, o)).toBe(expected);
  });

  it('a deactivation dated before activation keeps the sale on the board', () => {
    const o = order({ status: 'churned', activationDate: '2026-06-10', deactivationDate: '2026-06-01' });
    expect(boardCountedSales([s], new Map([[s.id!, o]]))).toHaveLength(1);
  });
});

describe('M4 payout windows (always a range)', () => {
  it.each([
    ['2026-10-07', 'Oct 14–18'], ['2026-10-08', 'Oct 21–25'], ['2026-10-14', 'Oct 21–25'],
    ['2026-10-15', 'Oct 28–Nov 3'], ['2026-10-21', 'Oct 28–Nov 3'], ['2026-10-22', 'Nov 7–11'],
    ['2026-12-31', 'Jan 7–11'], ['2028-02-29', 'Mar 7–11'], ['2026-11-01', 'Nov 14–18'],
  ])('install %s -> %s', (day, label) => {
    const [y, m, d] = day.split('-').map(Number);
    expect(formatPayoutWindow(payoutWindowForInstall(new Date(y, m - 1, d, 12)))).toBe(label);
  });
});

describe('X1 one "sales this month" number on every screen (carrier-cancelled + charged-back sale)', () => {
  const now = new Date('2026-10-20T17:00:00Z');
  const month = periodBounds('month', now)!;
  const withOrder = (id: string, number: string, over: object) =>
    sale({ id, orderNumberOrBtn: number, totalPoints: 5, ...over } as never);
  const sales = [
    withOrder('keep', 'TMO20261005KEEP1', { saleDate: noonUtc('2026-10-05') }),
    withOrder('cc', 'TMO20261006CANC1', { saleDate: noonUtc('2026-10-06') }),
    withOrder('cb', 'TMO20261002CHRN1', { saleDate: noonUtc('2026-10-02'), installDate: noonUtc('2026-10-03') }),
  ];
  const orders = [
    order({ id: 'TMO20261005KEEP1', matchedUserId: 'repA', status: 'pending_install' }),
    order({ id: 'TMO20261006CANC1', matchedUserId: 'repA', status: 'cancelled', cancellationDate: '2026-10-08' }),
    order({ id: 'TMO20261002CHRN1', matchedUserId: 'repA', status: 'churned', activationDate: '2026-10-03', deactivationDate: '2026-10-15' }),
  ];
  const fiber = companyFiberBySale(sales, orders, { now });
  const board = tallyBoard(boardSales(sales, fiber, 'approved'), month.start.getTime(), month.end.getTime());
  const boardCount = board.totals.reduce((sum, row) => sum + row.totalSales, 0);

  it('leaderboard counts 1 (the reference)', () => expect(boardCount).toBe(1));

  it('owner Markets total and the owner widget companySalesMtd == leaderboard (was 3)', () => {
    const markets = summarizeMarkets(sales, month, fiber);
    expect(markets.total).toBe(boardCount);
    const widget = buildOwnerWidgetData({ uidHash: 'x', money: null, markets, now });
    expect([widget.companySalesMtd, widget.topRepSalesMtd]).toEqual([1, 1]);
  });

  it('Ask 3C Board == leaderboard (was 3)', () => {
    const [monthRows] = rankBoard(countedBoardSales(sales, orders, { now }), [month.start.getTime()], 'repA', [month.end.getTime()]);
    expect(monthRows[0].sales).toBe(boardCount);
  });

  it('company tape mtdCount == leaderboard (was 3)', () => {
    expect(summarizeCompanySales(sales, fiber, month).mtdCount).toBe(boardCount);
  });
});

describe('X2 an order number logged twice counts once, and stays flagged', () => {
  it('board, book and est. pay count one sale for one carrier order', () => {
    const a = sale({ id: 'a', orderNumberOrBtn: 'TM-123456', createdAt: new Date('2026-10-05T15:00:00Z') } as never);
    const b = sale({ id: 'b', orderNumberOrBtn: 'tm 123456', createdAt: new Date('2026-10-06T15:00:00Z') } as never);
    const book = buildMergedBook([a, b], []);
    expect(book.rows.filter((row) => row.counted).map((row) => row.sale?.id)).toEqual(['a']);
    // Both rows stay on the list, flagged for an admin.
    expect(book.rows.filter((row) => row.possibleDuplicate).map((row) => row.sale?.id).sort()).toEqual(['a', 'b']);
    expect(boardCountedSales([a, b], fiberBySaleFromBook(book)).map((s) => s.id)).toEqual(['a']);
    expect(sumExpectedPay(countedSales([b, a]), AE1)).toBe(67.5);
  });

  it('the first one logged counts, whatever the input order; a cancelled copy never pushes out the live one', () => {
    const first = sale({ id: 'z-first', orderNumberOrBtn: 'TM-555555', createdAt: new Date('2026-10-01T15:00:00Z') } as never);
    const second = sale({ id: 'a-second', orderNumberOrBtn: 'TM-555555', createdAt: new Date('2026-10-02T15:00:00Z') } as never);
    expect(countedSales([second, first]).map((s) => s.id)).toEqual(['z-first']);
    const cancelledFirst = { ...first, status: 'cancelled' } as typeof first;
    expect(countedSales([second, cancelledFirst]).map((s) => s.id)).toEqual(['a-second']);
  });

  it('sales with no order number are never merged', () => {
    expect(countedSales([sale(), sale()])).toHaveLength(2);
  });
});

describe('X3 one definition of "top rep": the leaderboard\'s #1', () => {
  const now = new Date('2026-10-20T17:00:00Z');
  const month = periodBounds('month', now)!;
  // Wil: 2 sales x 3 pts = 6. Kai: 1 sale x 10 pts. Ana: 2 sales x 3 = 6 (ties Wil, A before W).
  const sales = [
    sale({ salesRepId: 'wil', salesRepName: 'Wil Teasdale', saleDate: noonUtc('2026-10-03') }),
    sale({ salesRepId: 'wil', salesRepName: 'Wil Teasdale', saleDate: noonUtc('2026-10-04') }),
    sale({ salesRepId: 'kai', salesRepName: 'Kai Lowe', totalPoints: 10, saleDate: noonUtc('2026-10-05') }),
    sale({ salesRepId: 'ana', salesRepName: 'Ana Ruiz', saleDate: noonUtc('2026-10-06') }),
    sale({ salesRepId: 'ana', salesRepName: 'Ana Ruiz', saleDate: noonUtc('2026-10-07') }),
  ];
  const none = new Map<string, FiberOrder>();

  it('the leaderboard, owner widget, tape and Ask all name the same rep', () => {
    const leader = sortBoard(tallyBoard(boardSales(sales, none, 'approved'), month.start.getTime(), month.end.getTime()).totals)[0];
    expect(leader.salesRepId).toBe('kai');
    expect(topRepOf(rankedBoard(sales, none, month))?.salesRepId).toBe('kai');
    expect(summarizeMarkets(sales, month, none).topRep).toEqual({ name: 'Kai L.', sales: 1 });
    expect(summarizeCompanySales(sales, none, month).topRep).toEqual({ repName: 'Kai Lowe', count: 1 });
    const [askMonth] = rankBoard(countedBoardSales(sales, [], { now }), [month.start.getTime()], 'x', [month.end.getTime()]);
    expect(askMonth[0].id).toBe('kai');
  });
});
