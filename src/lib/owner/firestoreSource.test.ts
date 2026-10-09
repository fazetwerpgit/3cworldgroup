import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FiberOrder, Sale } from '@/types';

// Sharon T., 149 Varsity Dr: a missed-install row beside her real order. The
// owner home reads sales through this projection; it must carry the order
// number so its join (companyBook) lands where the board's does.
const { selectMock, saleDocs, orders } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  saleDocs: [] as { id: string; data: () => Record<string, unknown> }[],
  orders: [] as unknown[],
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) =>
      name === 'sales'
        ? {
            where: () => ({
              select: (...fields: string[]) => {
                selectMock(...fields);
                return { get: async () => ({ docs: saleDocs }) };
              },
            }),
          }
        : { doc: () => ({ get: async () => ({ exists: false, data: () => ({}) }) }) },
  },
}));
vi.mock('@/lib/fiberReport/ordersCache', () => ({ getAllFiberOrders: vi.fn(async () => orders) }));

import { createFirestoreOwnerSource } from './firestoreSource';
import { companyBook } from './companySummary';
import { buildMergedBook } from '@/lib/sales/mergeBook';

const NOW = new Date('2026-10-09T17:00:00Z');

function carrier(overrides: Partial<FiberOrder>): FiberOrder {
  return {
    id: 'x', status: 'active', rawStatus: '', repDealerId: '4808955', repName: 'Jeremy McFarland', matchedUserId: 'miles',
    orderDate: '2026-10-05', estInstallDate: '2026-10-06', activationDate: '2026-10-07', cancellationDate: null,
    deactivationDate: null, fiberPlan: null, mrc: 60, address: '149 VARSITY DR', unit: null, city: null, state: null,
    zip: null, breakageReason: null, breakageNotes: null, customerName: null, sourceSheet: '', reportReceivedAt: '',
    updatedAt: '', ...overrides,
  };
}

beforeEach(() => {
  saleDocs.length = 0;
  orders.length = 0;
});

describe('owner home reads the order number, so it joins as the board does', () => {
  it('projects orderNumberOrBtn and agrees with the board on Sharon T.', async () => {
    const real = carrier({ id: 'TMO20261005Z30P4' });
    const miss = carrier({
      id: 'brk_c07a', status: 'breakage', orderDate: null, activationDate: null, estInstallDate: '2026-10-08',
      customerName: 'SHARON TIMMERMAN',
    });
    orders.push(miss, real);
    saleDocs.push({
      id: 'sharon',
      data: () => ({
        salesRepId: 'miles', salesRepName: 'Miles Scoonover', customerAddress: '149 VARSITY DR, HUNTSVILLE, TX 77340',
        orderNumberOrBtn: 'TMO20261005Z30P4', products: [], status: 'approved', totalValue: 60,
        saleDate: new Date('2026-10-05T17:00:00Z'), installDate: new Date('2026-10-06T17:00:00Z'),
      }),
    });

    const book = await createFirestoreOwnerSource().loadBook();
    expect(selectMock.mock.calls[0]).toContain('orderNumberOrBtn');
    expect(book.sales[0].orderNumberOrBtn).toBe('TMO20261005Z30P4');

    const board = buildMergedBook(book.sales as Sale[], book.orders, { now: NOW });
    const boardRow = board.rows.find((row) => row.key === 'sharon')!;
    expect(boardRow.order).toBe(real);
    expect(boardRow.counted).toBe(true);
    // The owner home counts her install off the same carrier row.
    const owner = companyBook(book.sales as Sale[], book.orders, NOW);
    expect(owner.installs.map((install) => install.saleId)).toEqual(['sharon']);
    expect(owner.installs[0].installDate.getDate()).toBe(7); // real's activation, not the miss
  });
});
