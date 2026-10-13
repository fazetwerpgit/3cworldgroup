import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale, SaleProduct } from '@/types';
import { rowStatus, CHARGEBACK_STATUS_LABEL } from '@/lib/dashboard/repSummary';
import { countedSales } from '@/lib/sales/installBucket';
import { statusLine } from '@/components/sales/InstallStatusLine';
import {
  boardCountedSales,
  CHARGEBACK_WINDOW_DAYS,
  chargebackFor,
  chargebackLines,
  chargebacksIn,
} from './chargeback';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 12, 0, 0);
const NOW = d(2026, 10, 13);
const product: SaleProduct = {
  company: 'tfiber',
  productId: 'tfiber-1gig',
  productName: 'TFiber 1 Gig',
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0,
  points: 8,
};
const rates = { tfiber: { 'tfiber-1gig': 140 } };

let seq = 0;
function sale(over: Partial<Sale> = {}): Sale {
  seq += 1;
  return {
    id: `c${seq}`,
    salesRepId: 'rep',
    salesRepName: 'Rep',
    customerName: 'Stephen Nolan',
    customerAddress: `${seq} Main St`,
    saleType: 'new_service',
    products: [product],
    totalValue: 60,
    totalPoints: 8,
    status: 'approved',
    saleDate: d(2026, 6, 1),
    installDate: d(2026, 6, 10),
    createdAt: d(2026, 6, 1),
    updatedAt: d(2026, 6, 1),
    ...over,
  } as Sale;
}

const churned = (activationDate: string | null, deactivationDate: string | null) =>
  ({ status: 'churned', activationDate, deactivationDate, cancellationDate: null }) as FiberOrder;

describe('chargebackFor — the 120-day rule', () => {
  it('charges back a disconnect 119 or 120 days after install, not 121', () => {
    expect(CHARGEBACK_WINDOW_DAYS).toBe(120);
    // Jun 10 + 119 = Oct 7, + 120 = Oct 8, + 121 = Oct 9.
    expect(chargebackFor(sale(), churned('2026-06-10', '2026-10-07'))).toEqual({
      installDay: '2026-06-10',
      deactivationDay: '2026-10-07',
      days: 119,
    });
    expect(chargebackFor(sale(), churned('2026-06-10', '2026-10-08'))?.days).toBe(120);
    expect(chargebackFor(sale(), churned('2026-06-10', '2026-10-09'))).toBeNull();
  });

  it("falls back to the sale's install day when the carrier has no activation date", () => {
    const s = sale({ installDate: d(2026, 9, 1) });
    expect(chargebackFor(s, churned(null, '2026-09-20'))).toEqual({
      installDay: '2026-09-01',
      deactivationDay: '2026-09-20',
      days: 19,
    });
    // No install day on either side, or no deactivation: nothing to judge.
    expect(chargebackFor(sale({ installDate: undefined }), churned(null, '2026-09-20'))).toBeNull();
    expect(chargebackFor(sale(), churned('2026-06-10', null))).toBeNull();
  });

  it('never charges back a carrier cancel before install, or a sale cancelled here', () => {
    const cancelledOrder = { status: 'cancelled', cancellationDate: '2026-06-12' } as FiberOrder;
    expect(chargebackFor(sale(), cancelledOrder)).toBeNull();
    expect(chargebackFor(sale({ status: 'cancelled' }), churned('2026-06-10', '2026-06-20'))).toBeNull();
    expect(chargebackFor(sale(), { status: 'active', activationDate: '2026-06-10' } as FiberOrder)).toBeNull();
    expect(chargebackFor(sale(), null)).toBeNull();
  });
});

describe('counting a churned sale', () => {
  const within = sale({ customerName: 'Stephen Nolan' });
  const after = sale({ customerName: 'Late Leaver' });
  const before = sale({ customerName: 'Never Installed' });
  const fiber = new Map<string, FiberOrder>([
    [within.id!, churned('2026-06-10', '2026-07-10')], // 30 days
    [after.id!, churned('2026-06-10', '2026-10-12')], // 124 days
    [before.id!, { status: 'cancelled', cancellationDate: '2026-06-09' } as FiberOrder],
  ]);

  it('keeps every churn counted for the estimate (history stays put); drops only the cancel before install', () => {
    expect(countedSales([within, after, before], fiber)).toEqual([within, after]);
  });

  it('takes a churn within 120 days off the board, and keeps one after 120 days', () => {
    expect(boardCountedSales([within, after, before], fiber)).toEqual([after]);
  });

  it('prices the chargeback at the est. pay it earned, in the deactivation month only', () => {
    const lines = chargebackLines([within, after, before], fiber, rates);
    expect(lines.map((line) => [line.customer, line.amount, line.chargeback.deactivationDay])).toEqual([
      ['Stephen N.', -140, '2026-07-10'],
    ]);
    expect(chargebacksIn(lines, { year: 2026, month: 6 })).toHaveLength(1); // July
    expect(chargebacksIn(lines, { year: 2026, month: 5 })).toHaveLength(0); // June, the install month
    expect(chargebackLines([within], fiber, null)[0].amount).toBeNull();
  });

  it('reads the row calmly: chargeback within 120 days, installed after', () => {
    expect(rowStatus(within, fiber.get(within.id!), NOW)).toBe('chargeback');
    expect(rowStatus(after, fiber.get(after.id!), NOW)).toBe('installed');
    expect(rowStatus(before, fiber.get(before.id!), NOW)).toBe('cancelled');
    expect(statusLine('chargeback', within.installDate)).toBe(CHARGEBACK_STATUS_LABEL);
    expect(CHARGEBACK_STATUS_LABEL).toBe('Cancelled after install · chargeback');
  });
});
