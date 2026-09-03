import { describe, it, expect } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import {
  cancelledSales,
  countInstallBuckets,
  countedSales,
  installBucketForSale,
  rollupSalesByRep,
} from './installBucket';

const NOW = new Date('2026-09-15T12:00:00');

function sale(overrides: Partial<Sale> = {}): Sale {
  return {
    id: 's1',
    salesRepId: 'rep1',
    salesRepName: 'Wil Teasdale',
    customerName: 'M. Garcia',
    customerAddress: '1 Main St',
    saleType: 'new_service',
    products: [],
    totalValue: 100,
    totalPoints: 0,
    status: 'approved',
    saleDate: new Date('2026-09-01T12:00:00'),
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as Sale;
}

function order(status: FiberOrder['status']): FiberOrder {
  return { status } as FiberOrder;
}

describe('installBucketForSale', () => {
  it('calls a sale with no install date attention', () => {
    expect(installBucketForSale(sale({ installDate: undefined }), null, NOW)).toBe('attention');
  });

  it('calls a past install date installed and a future one scheduled', () => {
    expect(installBucketForSale(sale({ installDate: new Date('2026-09-08T12:00:00') }), null, NOW)).toBe('installed');
    expect(installBucketForSale(sale({ installDate: new Date('2026-09-20T12:00:00') }), null, NOW)).toBe('scheduled');
  });

  it('pulls a breakage back to attention even with a date on the calendar', () => {
    const scheduled = sale({ installDate: new Date('2026-09-20T12:00:00') });
    expect(installBucketForSale(scheduled, order('breakage'), NOW)).toBe('attention');
  });

  it('trusts an active fiber order over a future date', () => {
    const scheduled = sale({ installDate: new Date('2026-09-20T12:00:00') });
    expect(installBucketForSale(scheduled, order('active'), NOW)).toBe('installed');
  });

  it('treats an unparseable date as no date', () => {
    expect(installBucketForSale({ installDate: 'not-a-date' as unknown as Date }, null, NOW)).toBe('attention');
  });
});

describe('countedSales', () => {
  it('drops rejected and cancelled sales', () => {
    const kept = countedSales([
      sale({ id: 'a', status: 'approved' }),
      sale({ id: 'b', status: 'rejected' }),
      sale({ id: 'c', status: 'cancelled' }),
      sale({ id: 'd', status: 'pending' }),
    ]);
    expect(kept.map((s) => s.id)).toEqual(['a', 'd']);
  });
});

describe('cancelledSales', () => {
  it('is the exact complement of what the board counts: the cancellations', () => {
    const all = [
      sale({ id: 'a', status: 'approved' }),
      sale({ id: 'b', status: 'cancelled' }),
      sale({ id: 'c', status: 'cancelled' }),
    ];
    expect(cancelledSales(all).map((s) => s.id)).toEqual(['b', 'c']);
    // A cancelled sale is never in both lists — the sheet relies on that to
    // decide which list it is arrowing through.
    expect(countedSales(all).some((s) => s.status === 'cancelled')).toBe(false);
  });
});

describe('countInstallBuckets', () => {
  it('counts only live sales', () => {
    const counts = countInstallBuckets(
      [
        sale({ id: 'a', installDate: new Date('2026-09-08T12:00:00') }),
        sale({ id: 'b', installDate: new Date('2026-09-20T12:00:00') }),
        sale({ id: 'c', installDate: undefined }),
        sale({ id: 'd', installDate: undefined, status: 'cancelled' }),
      ],
      undefined,
      NOW
    );
    expect(counts).toEqual({ installed: 1, scheduled: 1, attention: 1 });
  });
});

describe('rollupSalesByRep', () => {
  const sales = [
    sale({ id: 'a', salesRepId: 'r1', salesRepName: 'Noah', totalValue: 200, installDate: new Date('2026-09-08T12:00:00') }),
    sale({ id: 'b', salesRepId: 'r1', salesRepName: 'Noah', totalValue: 300, installDate: undefined }),
    sale({ id: 'c', salesRepId: 'r2', salesRepName: 'Wil', totalValue: 100, installDate: new Date('2026-09-20T12:00:00') }),
    sale({ id: 'd', salesRepId: 'r2', salesRepName: 'Wil', totalValue: 50, status: 'cancelled' }),
  ];

  it('orders reps by monthly value, highest first', () => {
    const reps = rollupSalesByRep(sales, undefined, NOW);
    expect(reps.map((r) => r.repName)).toEqual(['Noah', 'Wil']);
    expect(reps[0].value).toBe(500);
    expect(reps[0].count).toBe(2);
  });

  it('leaves a cancelled sale out of the rep total', () => {
    const wil = rollupSalesByRep(sales, undefined, NOW).find((r) => r.repName === 'Wil')!;
    expect(wil.count).toBe(1);
    expect(wil.value).toBe(100);
  });

  it('puts what needs chasing at the top of a rep’s list', () => {
    const noah = rollupSalesByRep(sales, undefined, NOW).find((r) => r.repName === 'Noah')!;
    expect(noah.sales.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('groups by rep id so a renamed rep does not split into two rows', () => {
    const reps = rollupSalesByRep(
      [
        sale({ id: 'a', salesRepId: 'r1', salesRepName: 'Wil Teasdale' }),
        sale({ id: 'b', salesRepId: 'r1', salesRepName: 'Will Teasdale' }),
      ],
      undefined,
      NOW
    );
    expect(reps).toHaveLength(1);
    expect(reps[0].count).toBe(2);
  });
});
