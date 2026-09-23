import { describe, expect, it } from 'vitest';
import type { SaleProduct } from '@/types';
import {
  formatPayoutWindow,
  isTFiberSale,
  nextPayout,
  payoutWindowForInstall,
  payoutLabelForDraft,
  payoutWindowForSale,
} from './payoutWindow';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);
const ymd = (date: Date) => `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

function product(company: string, productId: string, quantity = 1): SaleProduct {
  return { company, productId, productName: productId, quantity, unitPrice: 0, totalPrice: 0, points: 0 };
}

const tfiber = (installDate?: Date, plan = 'tfiber-1gig') => ({ products: [product('tfiber', plan)], installDate });
const att = (installDate?: Date) => ({ products: [product('att', 'att-500')], installDate });
const rates = { tfiber: { 'tfiber-1gig': 130, 'tfiber-500': 110 }, att: { 'att-500': 90 } };

describe('payoutWindowForInstall', () => {
  it.each([
    [d(2026, 9, 1), '2026-9-14', '2026-9-18'],
    [d(2026, 9, 7), '2026-9-14', '2026-9-18'],
    [d(2026, 9, 8), '2026-9-21', '2026-9-25'],
    [d(2026, 9, 14), '2026-9-21', '2026-9-25'],
    [d(2026, 9, 15), '2026-9-28', '2026-10-3'],
    [d(2026, 9, 21), '2026-9-28', '2026-10-3'],
    [d(2026, 9, 22), '2026-10-7', '2026-10-11'],
    [d(2026, 9, 30), '2026-10-7', '2026-10-11'],
  ])('install %s pays %s to %s', (install, start, end) => {
    const window = payoutWindowForInstall(install);
    expect(ymd(window.start)).toBe(start);
    expect(ymd(window.end)).toBe(end);
  });

  it('rolls week 3 and week 4 into the next year in December', () => {
    expect(ymd(payoutWindowForInstall(d(2026, 12, 18)).end)).toBe('2027-1-3');
    const w4 = payoutWindowForInstall(d(2026, 12, 31));
    expect(ymd(w4.start)).toBe('2027-1-7');
    expect(ymd(w4.end)).toBe('2027-1-11');
  });

  it('runs the week-4 install range to the true month end', () => {
    expect(ymd(payoutWindowForInstall(d(2027, 2, 25)).installTo)).toBe('2027-2-28');
    expect(ymd(payoutWindowForInstall(d(2026, 10, 25)).installTo)).toBe('2026-10-31');
  });
});

describe('payoutWindowForSale', () => {
  it('gives eligible dated T-Fiber sales a window', () => {
    expect(payoutWindowForSale(tfiber(d(2026, 9, 3)), true)).not.toBeNull();
  });

  it('moves the window when the install is rescheduled', () => {
    const sale = tfiber(d(2026, 9, 12));
    expect(formatPayoutWindow(payoutWindowForSale(sale, true)!)).toBe('Sep 21–25');
    const moved = { ...sale, installDate: d(2026, 9, 17) };
    expect(formatPayoutWindow(payoutWindowForSale(moved, true)!)).toBe('Sep 28–Oct 3');
  });

  it('gives no window to other carriers, ineligible sales or undated sales', () => {
    expect(payoutWindowForSale(att(d(2026, 9, 3)), true)).toBeNull();
    expect(payoutWindowForSale(tfiber(d(2026, 9, 3)), false)).toBeNull();
    expect(payoutWindowForSale(tfiber(undefined), true)).toBeNull();
  });

  it('reads ISO strings the API returns', () => {
    const sale = { products: [product('tfiber', 'tfiber-500')], installDate: '2026-09-10T17:00:00.000Z' as unknown as Date };
    expect(ymd(payoutWindowForSale(sale, true)!.start)).toBe('2026-9-21');
  });
});

describe('isTFiberSale', () => {
  it('matches on the tfiber company id only', () => {
    expect(isTFiberSale(tfiber())).toBe(true);
    expect(isTFiberSale(att())).toBe(false);
    expect(isTFiberSale({ products: [] })).toBe(false);
  });
});

describe('nextPayout', () => {
  const now = d(2026, 9, 22);

  it('picks the first window ending today or later and sums its install week', () => {
    const result = nextPayout(
      [
        tfiber(d(2026, 9, 2)), // Sep 14–18: already past
        tfiber(d(2026, 9, 16)), // Sep 28–Oct 3
        tfiber(d(2026, 9, 19), 'tfiber-500'), // Sep 28–Oct 3
        tfiber(d(2026, 9, 22)), // Oct 7–11
      ],
      rates,
      now
    );
    expect(result).not.toBeNull();
    expect(formatPayoutWindow(result!.window)).toBe('Sep 28–Oct 3');
    expect(result!.amount).toBe(240);
    expect(result!.count).toBe(2);
  });

  it('keeps a window whose last day is today', () => {
    const result = nextPayout([tfiber(d(2026, 9, 10))], rates, d(2026, 9, 25));
    expect(formatPayoutWindow(result!.window)).toBe('Sep 21–25');
  });

  it('ignores other carriers entirely', () => {
    expect(nextPayout([att(d(2026, 9, 16))], rates, now)).toBeNull();
  });

  it('is null when nothing is upcoming', () => {
    expect(nextPayout([tfiber(d(2026, 9, 1))], rates, now)).toBeNull();
    expect(nextPayout([], rates, now)).toBeNull();
  });

  it('counts scheduled installs toward their window and tallies them', () => {
    const result = nextPayout([tfiber(d(2026, 9, 16)), tfiber(d(2026, 9, 21))], rates, d(2026, 9, 20));
    expect(formatPayoutWindow(result!.window)).toBe('Sep 28–Oct 3');
    expect(result!.count).toBe(2);
    expect(result!.scheduled).toBe(1);
  });

  it('keeps the window but drops the amount when the rep has no pay plan', () => {
    const result = nextPayout([tfiber(d(2026, 9, 16))], null, now);
    expect(result!.amount).toBeNull();
    expect(result!.count).toBe(1);
  });
});

describe('formatPayoutWindow', () => {
  it('always prints a range', () => {
    expect(formatPayoutWindow(payoutWindowForInstall(d(2026, 9, 22)))).toBe('Oct 7–11');
    expect(formatPayoutWindow(payoutWindowForInstall(d(2026, 9, 3)))).toBe('Sep 14–18');
    expect(formatPayoutWindow(payoutWindowForInstall(d(2026, 9, 20)))).toBe('Sep 28–Oct 3');
  });
});

describe('payoutLabelForDraft', () => {
  const plan = [product('tfiber', 'tfiber-1gig')];

  it('labels a T-Fiber draft from the typed install date, live as it changes', () => {
    expect(payoutLabelForDraft(plan, '2026-09-22')).toBe('Oct 7–11');
    expect(payoutLabelForDraft(plan, '2026-09-18')).toBe('Sep 28–Oct 3');
    expect(payoutLabelForDraft(plan, '2026-09-05')).toBe('Sep 14–18');
  });

  it('is null without T-Fiber or a real date', () => {
    expect(payoutLabelForDraft([product('att', 'att-500')], '2026-09-22')).toBeNull();
    expect(payoutLabelForDraft([], '2026-09-22')).toBeNull();
    expect(payoutLabelForDraft(plan, '')).toBeNull();
    expect(payoutLabelForDraft(plan, '2026-02-31')).toBeNull();
  });
});
