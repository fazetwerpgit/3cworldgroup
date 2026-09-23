import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale, SaleProduct } from '@/types';
import { formatPayoutWindow } from './payoutWindow';
import { datedSales, groupPaySales, hasInstallDate, sumExpectedPay, undatedSales } from './payGroups';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);

function product(company: string, productId: string): SaleProduct {
  return { company, productId, productName: productId, quantity: 1, unitPrice: 0, totalPrice: 0, points: 0 };
}

let seq = 0;
function sale(overrides: Partial<Sale> = {}): Sale {
  seq += 1;
  return {
    id: `p${seq}`,
    salesRepId: 'me',
    salesRepName: 'Me',
    customerName: `Customer ${seq}`,
    saleType: 'new_service',
    products: [product('tfiber', 'tfiber-1gig')],
    totalValue: 60,
    totalPoints: 8,
    status: 'approved',
    saleDate: d(2026, 9, 1),
    createdAt: d(2026, 9, 1),
    updatedAt: d(2026, 9, 1),
    ...overrides,
  } as Sale;
}

const att = () => [product('att', 'att-500')];
const rates = { tfiber: { 'tfiber-1gig': 140 }, att: { 'att-500': 90 } };
const noFiber = new Map<string, FiberOrder>();
const SEP = { year: 2026, month: 8 };

describe('dated / undated', () => {
  it('splits counted sales on whether they carry a real install date', () => {
    const sales = [
      sale({ installDate: d(2026, 9, 3) }),
      sale({}),
      sale({ installDate: 'not a date' as unknown as Date }),
      sale({ status: 'cancelled', installDate: d(2026, 9, 3) }),
      sale({ status: 'cancelled' }),
    ];
    expect(datedSales(sales, noFiber)).toHaveLength(1);
    expect(undatedSales(sales, noFiber)).toHaveLength(2);
    expect(hasInstallDate(sales[2])).toBe(false);
  });

  it('sums est. pay, null without a plan', () => {
    expect(sumExpectedPay([sale(), sale({ products: att() })], rates)).toBe(230);
    expect(sumExpectedPay([sale()], null)).toBeNull();
  });
});

describe('groupPaySales', () => {
  const book = () => [
    sale({ customerName: 'wk1', installDate: d(2026, 9, 3) }), // Sep 14–18
    sale({ customerName: 'wk2a', installDate: d(2026, 9, 9) }), // Sep 21–25
    sale({ customerName: 'wk2b', installDate: d(2026, 9, 12) }), // Sep 21–25
    sale({ customerName: 'wk3', installDate: d(2026, 9, 18) }), // Sep 28–Oct 3
    sale({ customerName: 'wk4', installDate: d(2026, 9, 29) }), // Oct 7–11 (scheduled)
    sale({ customerName: 'att', installDate: d(2026, 9, 10), products: att() }),
    sale({ customerName: 'aug', installDate: d(2026, 8, 20) }), // other month
    sale({ customerName: 'nodate' }),
    sale({ customerName: 'dead', installDate: d(2026, 9, 10), status: 'cancelled' }),
  ];

  it('groups by payout window, newest first, then other carriers, then no install date', () => {
    const groups = groupPaySales(book(), noFiber, rates, { month: SEP, includeUndated: true });
    expect(groups.map((g) => g.label)).toEqual([
      'Oct 7–11',
      'Sep 28–Oct 3',
      'Sep 21–25',
      'Sep 14–18',
      'Other carriers · Sep',
      'No install date',
    ]);
    const wk2 = groups[2];
    expect(wk2.kind).toBe('window');
    expect(wk2.amount).toBe(280);
    expect(wk2.sales.map((s) => s.customerName)).toEqual(['wk2b', 'wk2a']); // newest install first
    expect(groups[4]).toMatchObject({ kind: 'other', window: null, amount: 90 });
    expect(groups[5]).toMatchObject({ kind: 'undated', amount: 140 });
  });

  it('keeps a scheduled install in its window (reps see what is coming)', () => {
    const groups = groupPaySales(book(), noFiber, rates, { month: SEP });
    expect(groups[0].sales.map((s) => s.customerName)).toEqual(['wk4']);
  });

  it('pays week 3 (15th–21st) across the month boundary: 28th–3rd next month', () => {
    const groups = groupPaySales(
      [sale({ installDate: d(2026, 9, 15) }), sale({ installDate: d(2026, 9, 21) })],
      noFiber,
      rates
    );
    expect(groups).toHaveLength(1);
    const window = groups[0].window!;
    expect(formatPayoutWindow(window)).toBe('Sep 28–Oct 3');
    expect([window.start.getMonth(), window.start.getDate()]).toEqual([8, 28]);
    expect([window.end.getMonth(), window.end.getDate()]).toEqual([9, 3]);
    expect(groups[0].amount).toBe(280);
  });

  it('crosses the year too: Dec 15–21 pays Dec 28–Jan 3', () => {
    const [group] = groupPaySales([sale({ installDate: d(2026, 12, 20) })], noFiber, rates);
    expect(formatPayoutWindow(group.window!)).toBe('Dec 28–Jan 3');
    expect(group.window!.end.getFullYear()).toBe(2027);
  });

  it('moves a rescheduled install to its new window', () => {
    const original = sale({ installDate: d(2026, 9, 12) });
    expect(groupPaySales([original], noFiber, rates)[0].label).toBe('Sep 21–25');
    const moved = { ...original, installDate: d(2026, 9, 24) };
    const groups = groupPaySales([moved], noFiber, rates);
    expect(groups.map((g) => g.label)).toEqual(['Oct 7–11']);
  });

  it('groups other carriers by install month without a window', () => {
    const groups = groupPaySales(
      [
        sale({ installDate: d(2026, 8, 30), products: att() }),
        sale({ installDate: d(2026, 9, 2), products: att() }),
        sale({ installDate: d(2026, 9, 20), products: att() }),
      ],
      noFiber,
      rates
    );
    expect(groups.map((g) => [g.label, g.sales.length, g.window])).toEqual([
      ['Other carriers · Sep', 2, null],
      ['Other carriers · Aug', 1, null],
    ]);
  });

  it('drops carrier cancellations and scopes to the picked install month', () => {
    const churned = sale({ installDate: d(2026, 9, 5) });
    const fiber = new Map<string, FiberOrder>([[churned.id!, { status: 'churned' } as FiberOrder]]);
    const groups = groupPaySales([churned, sale({ installDate: d(2026, 8, 5) })], fiber, rates, { month: SEP });
    expect(groups).toEqual([]);
  });

  it('keeps sales but drops the dollars when the rep has no plan', () => {
    const [group] = groupPaySales([sale({ installDate: d(2026, 9, 5) })], noFiber, null);
    expect(group.amount).toBeNull();
    expect(group.sales).toHaveLength(1);
  });
});
