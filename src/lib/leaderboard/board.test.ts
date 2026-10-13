import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale, SaleProduct } from '@/types';
import { fixtureOrder } from '@/lib/weeklyInstalls/fixtures';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import { countedSales } from '@/lib/sales/installBucket';
import { chargebackFor } from '@/lib/pay/chargeback';
import { boardSales, companyFiberBySale, tallyBoard } from './board';

const noon = (day: string) => new Date(`${day}T17:00:00.000Z`);
const product = (productId: string, points: number): SaleProduct => ({
  company: productId.split('-')[0],
  productId,
  productName: productId,
  quantity: 1,
  unitPrice: 0,
  totalPrice: 0,
  points,
});

function sale(id: string, rep: string, address: string, over: Partial<Sale> = {}): Sale {
  return {
    id,
    salesRepId: rep,
    salesRepName: rep === 'braeden' ? 'Braeden Carter' : 'Wil Teasdale',
    customerName: `Customer ${id}`,
    customerAddress: address,
    saleType: 'new_service',
    products: [product('tfiber-1gig', 8)],
    totalValue: 60,
    totalPoints: 8,
    status: 'approved',
    saleDate: noon('2026-10-02'),
    installDate: noon('2026-10-06'),
    createdAt: noon('2026-10-02'),
    updatedAt: noon('2026-10-02'),
    ...over,
  } as Sale;
}

const order = (address: string, rep: string, over: Partial<FiberOrder>): FiberOrder =>
  fixtureOrder({ id: `o-${address}`, address, matchedUserId: rep, orderDate: '2026-10-02', ...over });

// Braeden's October: one live, one the carrier cancelled before install (the
// Stephen N. case), one disconnected 10 days after install, one waiting.
// Wil's: one live 2 Gig, one churned long after a June install.
const SALES: Sale[] = [
  sale('b-live', 'braeden', '10 Oak St'),
  sale('b-cancel', 'braeden', '20 Oak St'),
  sale('b-churn', 'braeden', '30 Oak St'),
  sale('b-wait', 'braeden', '40 Oak St', { installDate: noon('2026-10-20') }),
  sale('w-live', 'wil', '50 Elm St', { products: [product('tfiber-2gig', 10)], totalPoints: 10 }),
  sale('w-old', 'wil', '60 Elm St', { saleDate: noon('2026-06-01'), installDate: noon('2026-06-05') }),
  sale('w-rejected', 'wil', '70 Elm St', { status: 'rejected' }),
];
const ORDERS: FiberOrder[] = [
  order('10 Oak St', 'braeden', { status: 'active', activationDate: '2026-10-06' }),
  order('20 Oak St', 'braeden', { status: 'cancelled', cancellationDate: '2026-10-05' }),
  order('30 Oak St', 'braeden', { status: 'churned', activationDate: '2026-10-06', deactivationDate: '2026-10-16' }),
  order('40 Oak St', 'braeden', { status: 'pending_install', estInstallDate: '2026-10-20' }),
  order('50 Elm St', 'wil', { status: 'active', activationDate: '2026-10-06' }),
  order('60 Elm St', 'wil', { status: 'churned', orderDate: '2026-06-01', activationDate: '2026-06-05', deactivationDate: '2026-10-08' }),
];

const OCT = noon('2026-10-01').getTime() - 17 * 3_600_000 + 5 * 3_600_000; // Oct 1, 00:00 CDT

describe('leaderboard join parity', () => {
  const fiberBySale = companyFiberBySale(SALES, ORDERS);

  it('joins each sale to the same carrier order as the rep’s own estimate does', () => {
    for (const rep of ['braeden', 'wil']) {
      const own = SALES.filter((s) => s.salesRepId === rep);
      const estimateJoin = matchFiberOrdersToSales(own, ORDERS.filter((o) => o.matchedUserId === rep));
      for (const s of own) expect(fiberBySale.get(s.id!)?.id).toBe(estimateJoin.get(s.id!)?.id);
    }
  });

  it('counts what the estimate counts, less a disconnect within 120 days', () => {
    const board = boardSales(SALES, fiberBySale, 'approved').map((s) => s.id);
    const estimate = countedSales(SALES, fiberBySale)
      .filter((s) => !chargebackFor(s, fiberBySale.get(s.id!)))
      .map((s) => s.id);
    expect(board).toEqual(estimate);
    // The carrier cancel and the 10-day churn are off; the old churn (125 days) and the waiting install stay.
    expect(board).toEqual(['b-live', 'b-wait', 'w-live', 'w-old']);
  });

  it('tallies points and plan mix per rep for the period only', () => {
    const { totals, allSales, periodSales } = tallyBoard(boardSales(SALES, fiberBySale, 'approved'), OCT);
    const byRep = Object.fromEntries(totals.map((t) => [t.salesRepId, t]));
    expect(byRep.braeden).toMatchObject({ totalSales: 2, totalPoints: 16, planMix: [{ tier: '1 Gig', count: 2 }] });
    expect(byRep.wil).toMatchObject({ totalSales: 1, totalPoints: 10, planMix: [{ tier: '2 Gig', count: 1 }] });
    expect(allSales).toHaveLength(4);
    expect(periodSales).toHaveLength(3);
  });

  it('stops at the end of a closed window', () => {
    const october = new Date('2026-10-01T05:00:00.000Z').getTime();
    const november = new Date('2026-11-01T05:00:00.000Z').getTime();
    const late = sale('late', 'wil', '9 Late St', { saleDate: noon('2026-11-01') });
    const { totals, allSales, periodSales } = tallyBoard(
      boardSales([...SALES, late], companyFiberBySale([...SALES, late], []), 'approved'),
      october,
      november
    );
    expect(periodSales.some((s) => s.saleDate.getTime() >= november)).toBe(false);
    expect(allSales.some((s) => s.saleDate.getTime() >= november)).toBe(true);
    expect(totals.find((t) => t.salesRepId === 'wil')?.totalSales).toBe(
      tallyBoard(boardSales(SALES, companyFiberBySale(SALES, []), 'approved'), october).totals.find((t) => t.salesRepId === 'wil')?.totalSales
    );
  });

  it('still ranks the portal’s own counts when the carrier report is missing', () => {
    const board = boardSales(SALES, companyFiberBySale(SALES, []), 'approved').map((s) => s.id);
    expect(board).toEqual(['b-live', 'b-cancel', 'b-churn', 'b-wait', 'w-live', 'w-old']);
  });
});
