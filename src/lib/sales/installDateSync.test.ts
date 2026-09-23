import { beforeEach, describe, expect, it, vi } from 'vitest';

const { salesGetMock, updateMock, freshGetMock, getAllMock, collectionMock, dispatchMock } = vi.hoisted(() => {
  const salesGetMock = vi.fn();
  const updateMock = vi.fn();
  const freshGetMock = vi.fn();
  const getAllMock = vi.fn();
  const docMock = vi.fn((id: string) => ({
    id,
    update: (data: Record<string, unknown>, precondition?: unknown) =>
      precondition === undefined ? updateMock(id, data) : updateMock(id, data, precondition),
    get: () => freshGetMock(id),
  }));
  const collectionMock = vi.fn(() => ({ get: salesGetMock, doc: docMock }));
  const dispatchMock = vi.fn();
  return { salesGetMock, updateMock, freshGetMock, getAllMock, collectionMock, dispatchMock };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock, getAll: getAllMock },
}));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));

import { carrierOrderForSale, syncInstallDatesFromOrders } from './installDateSync';
import { dateToSaleDateInput, installDayKey } from './saleDate';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import type { FiberOrder } from '@/types/fiberOrder';

const NOW = new Date('2026-09-14T17:00:00.000Z');

/** A date at local noon, `offsetDays` from today — inside the one-year cap. */
function noon(offsetDays: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return date;
}

/** The report writes a plain calendar day; read it off the same helper the sync does. */
function reportDay(offsetDays: number): string {
  return installDayKey(noon(offsetDays))!;
}

function order(overrides: Partial<FiberOrder> & Pick<FiberOrder, 'id'>): FiberOrder {
  return {
    status: 'pending_install',
    rawStatus: 'Pending Installation',
    repDealerId: '4721016',
    repName: 'Rep One',
    matchedUserId: 'rep-1',
    orderDate: '2026-09-01',
    estInstallDate: null,
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: null,
    mrc: null,
    address: '123 Main St',
    unit: null,
    city: null,
    state: null,
    zip: null,
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet: 'Orders',
    reportReceivedAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

type SaleDoc = {
  id: string;
  salesRepId?: string;
  customerName?: string;
  customerAddress?: string;
  saleDate?: Date | null;
  installDate?: Date | null;
  status?: string;
  installDateSource?: string;
  repEditOrderId?: string | null;
  repEditCarrierDate?: string | null;
};

function setSales(sales: SaleDoc[]): void {
  salesGetMock.mockResolvedValue({
    docs: sales.map(({ id, ...data }) => ({ id, data: () => data })),
  });
}

/** fiberOrders docs as stored: only what the sync reads back (the admin's saleLink). */
let storedLinks: Record<string, FiberOrder['saleLink']> = {};

beforeEach(() => {
  vi.clearAllMocks();
  updateMock.mockResolvedValue(undefined);
  dispatchMock.mockResolvedValue(undefined);
  storedLinks = {};
  getAllMock.mockImplementation(async (...refs: { id: string }[]) =>
    refs.map((ref) => ({
      id: ref.id,
      exists: ref.id in storedLinks,
      data: () => ({ saleLink: storedLinks[ref.id] }),
    }))
  );
  setSales([]);
});

/** carrierDateForSale's old shape: just the recorded day. */
function carrierDateForSale(sale: { id: string; data: Record<string, unknown> }, orders: FiberOrder[]) {
  return carrierOrderForSale(sale, orders)?.estInstallDate ?? null;
}

describe('syncInstallDatesFromOrders', () => {
  it('moves the sale to the carrier day at local noon and tells the rep once', async () => {
    const previous = noon(3);
    setSales([
      {
        id: 'sale-1',
        salesRepId: 'rep-1',
        customerName: 'Dana Reyes',
        customerAddress: '123 Main St',
        installDate: previous,
        status: 'approved',
      },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(10) })],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 1, unchanged: 0, errors: 0 });
    expect(updateMock).toHaveBeenCalledOnce();
    const [saleId, written] = updateMock.mock.calls[0];
    expect(saleId).toBe('sale-1');
    expect(written.installDateSource).toBe('report');
    expect(written.installDatePreviousDate).toBe(previous);
    expect(written.installDateChangedAt).toBe(NOW);
    expect(written.updatedAt).toBe(NOW);
    expect(dateToSaleDateInput(written.installDate as Date)).toBe(reportDay(10));
    expect((written.installDate as Date).getHours()).toBe(12);
    // Nothing else on the sale is the report's business.
    expect(Object.keys(written).sort()).toEqual([
      'installDate',
      'installDateChangedAt',
      'installDatePreviousDate',
      'installDateSource',
      'updatedAt',
    ]);

    expect(dispatchMock).toHaveBeenCalledOnce();
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rep-1',
        type: 'install_date_changed',
        title: 'Install date changed',
        link: '/portal/sales/sale-1',
      })
    );
    const message = dispatchMock.mock.calls[0][0].message as string;
    expect(message).toContain("Dana Reyes's install to");
    expect(message).toContain('(was ');
    expect(result.changes).toEqual([
      { saleId: 'sale-1', salesRepId: 'rep-1', previous, next: written.installDate },
    ]);
  });

  it('leaves the sale alone when the carrier names the same calendar day', async () => {
    const installDate = noon(5);
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: installDayKey(installDate)! })],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 0, unchanged: 1 });
    expect(updateMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('writes nothing when two sales share the order address', async () => {
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
      { id: 'sale-2', salesRepId: 'rep-2', customerAddress: '123 Main Street', installDate: noon(2) },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 0, skippedAmbiguous: 1 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('writes nothing when two dated orders claim the same sale', async () => {
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [
        order({ id: 'o-1', estInstallDate: reportDay(9) }),
        order({ id: 'o-2', estInstallDate: reportDay(11) }),
      ],
      now: NOW,
    });

    // Counted once per sale left alone.
    expect(result).toMatchObject({ checked: 2, updated: 0, skippedAmbiguous: 1 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('skips a cancelled sale', async () => {
    setSales([
      {
        id: 'sale-1',
        salesRepId: 'rep-1',
        customerAddress: '123 Main St',
        installDate: noon(2),
        status: 'cancelled',
      },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 0, skippedCancelled: 1 });
    expect(updateMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('follows saleLink instead of the address guess', async () => {
    setSales([
      { id: 'sale-address', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
      { id: 'sale-linked', salesRepId: 'rep-2', customerAddress: '900 Other Rd', installDate: noon(2) },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [
        order({
          id: 'o-1',
          estInstallDate: reportDay(9),
          saleLink: { saleId: 'sale-linked', by: 'admin-1', byName: 'Admin', at: NOW.toISOString() },
        }),
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 1 });
    expect(updateMock).toHaveBeenCalledOnce();
    expect(updateMock.mock.calls[0][0]).toBe('sale-linked');
    expect(dispatchMock.mock.calls[0][0].userId).toBe('rep-2');
  });

  it('respects an admin saying the order is not a sale', async () => {
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [
        order({
          id: 'o-1',
          estInstallDate: reportDay(9),
          saleLink: { saleId: null, by: 'admin-1', byName: 'Admin', at: NOW.toISOString() },
        }),
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 0, skippedAmbiguous: 0, unchanged: 0 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('counts a failed write and keeps going', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
      { id: 'sale-2', salesRepId: 'rep-2', customerAddress: '77 Oak Ave', installDate: noon(2) },
    ]);
    updateMock.mockImplementation((id: string) =>
      id === 'sale-1' ? Promise.reject(new Error('firestore down')) : Promise.resolve(undefined)
    );

    const result = await syncInstallDatesFromOrders({
      orders: [
        order({ id: 'o-1', address: '123 Main St', estInstallDate: reportDay(9) }),
        order({ id: 'o-2', address: '77 Oak Ave', estInstallDate: reportDay(9) }),
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 2, updated: 1, errors: 1 });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].saleId).toBe('sale-2');
    expect(dispatchMock).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('counts a failed notification without unwinding the date it already wrote', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
    ]);
    dispatchMock.mockRejectedValue(new Error('no bell'));

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 1, errors: 1 });
    expect(updateMock).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('ignores orders with no est install date', async () => {
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: null })],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 0, updated: 0 });
    expect(salesGetMock).toHaveBeenCalledOnce();
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('sets a first install date on a sale that never had one', async () => {
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: null },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 1 });
    expect(updateMock.mock.calls[0][1].installDatePreviousDate).toBeNull();
    expect(dispatchMock.mock.calls[0][0].message).not.toContain('(was ');
  });
});

describe('rep-set install dates and the report', () => {
  const repEdited = (repEditCarrierDate: string | null): SaleDoc => ({
    id: 'sale-1',
    salesRepId: 'rep-1',
    customerName: 'Dana Reyes',
    customerAddress: '123 Main St',
    installDate: noon(12),
    status: 'approved',
    installDateSource: 'rep',
    repEditCarrierDate,
  });

  it("leaves the rep's date when the report still carries the date they corrected", async () => {
    setSales([repEdited(reportDay(5))]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(5) })],
      now: NOW,
    });

    expect(result).toMatchObject({ checked: 1, updated: 0, unchanged: 1 });
    expect(updateMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it("takes the carrier's news once its date moves after the rep's edit, and tells the rep", async () => {
    setSales([repEdited(reportDay(5))]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(15) })],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 1 });
    const [, written] = updateMock.mock.calls[0];
    expect(dateToSaleDateInput(written.installDate as Date)).toBe(reportDay(15));
    expect(written.installDateSource).toBe('report');
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('treats a first carrier date after a rep edit made with none on record as news', async () => {
    setSales([repEdited(null)]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(15) })],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 1 });
  });

  it('keeps moving report-set and unmarked dates as before', async () => {
    setSales([
      { ...repEdited(null), installDateSource: 'report', repEditCarrierDate: reportDay(15) },
    ]);

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(15) })],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 1 });
  });
});

describe('several carrier rows at one door', () => {
  const sale = { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) };

  it('follows the order the carrier moved past a missed install, not the miss', async () => {
    setSales([sale]);
    const miss = order({ id: 'brk', status: 'breakage', estInstallDate: reportDay(1) });
    const moved = order({ id: 'o-1', orderDate: reportDay(-10), estInstallDate: reportDay(9) });

    for (const orders of [[miss, moved], [moved, miss]]) {
      vi.clearAllMocks();
      updateMock.mockResolvedValue(undefined);
      const result = await syncInstallDatesFromOrders({ orders, now: NOW });

      expect(result).toMatchObject({ updated: 1, skippedAmbiguous: 0 });
      expect(updateMock).toHaveBeenCalledTimes(1);
      expect(installDayKey(updateMock.mock.calls[0][1].installDate)).toBe(reportDay(9));
    }
  });

  it('writes nothing from an active row, even over an older miss', async () => {
    // The page reads the activation date for an installed order; the est day
    // on an active row is history and never moves a sale.
    setSales([sale]);
    const result = await syncInstallDatesFromOrders({
      orders: [
        order({ id: 'brk', status: 'breakage', estInstallDate: reportDay(1) }),
        order({ id: 'o-1', status: 'active', estInstallDate: reportDay(4), activationDate: reportDay(4) }),
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 0, skippedAmbiguous: 0 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('follows the miss while the order still shows the missed day', async () => {
    setSales([sale]);
    const result = await syncInstallDatesFromOrders({
      orders: [
        order({ id: 'o-1', orderDate: reportDay(-10), estInstallDate: reportDay(5) }),
        order({ id: 'brk', status: 'breakage', estInstallDate: reportDay(5) }),
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 1, skippedAmbiguous: 0 });
    expect(installDayKey(updateMock.mock.calls[0][1].installDate)).toBe(reportDay(5));
  });

  it('writes nothing when the rows are two different units', async () => {
    setSales([sale]);
    const result = await syncInstallDatesFromOrders({
      orders: [
        order({ id: 'o-1', unit: 'Apt 1', orderDate: reportDay(-10), estInstallDate: reportDay(9) }),
        order({ id: 'brk', unit: 'Apt 2', status: 'breakage', estInstallDate: reportDay(1) }),
      ],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 0, skippedAmbiguous: 1 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("keeps a rep's date when both rows come back unchanged, and takes the move", async () => {
    // The rep rescheduled after the miss; the current row then was the miss.
    const repSale = {
      ...sale,
      installDate: noon(6),
      installDateSource: 'rep',
      repEditCarrierDate: reportDay(1),
    };
    const miss = order({ id: 'brk', status: 'breakage', estInstallDate: reportDay(1) });
    setSales([repSale]);

    const same = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', orderDate: reportDay(-10), estInstallDate: reportDay(1) }), miss],
      now: NOW,
    });
    expect(same).toMatchObject({ updated: 0, unchanged: 1, skippedAmbiguous: 0 });
    expect(updateMock).not.toHaveBeenCalled();

    const moved = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', orderDate: reportDay(-10), estInstallDate: reportDay(9) }), miss],
      now: NOW,
    });
    expect(moved).toMatchObject({ updated: 1, skippedAmbiguous: 0 });
    expect(installDayKey(updateMock.mock.calls[0][1].installDate)).toBe(reportDay(9));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it("records the current row's day for a rep edit", () => {
    const data = { customerAddress: '123 Main St', salesRepId: 'rep-1' };
    expect(
      carrierDateForSale({ id: 'sale-1', data }, [
        order({ id: 'brk', status: 'breakage', estInstallDate: '2026-10-02' }),
        order({ id: 'o-1', orderDate: '2026-09-20', estInstallDate: '2026-10-08' }),
      ])
    ).toBe('2026-10-08');
  });
});

describe('carrierDateForSale', () => {
  const sale = { id: 'sale-1', data: { customerAddress: '123 Main St', salesRepId: 'rep-1' } };

  it('reads the date off the one dated order that is this sale', () => {
    expect(carrierDateForSale(sale, [order({ id: 'o-1', estInstallDate: '2026-10-02' })])).toBe('2026-10-02');
  });

  it('follows an admin link over the address', () => {
    const linked = order({
      id: 'o-2',
      address: '9 Elsewhere Rd',
      estInstallDate: '2026-10-09',
      saleLink: { saleId: 'sale-1', by: 'a1', byName: 'Admin', at: NOW.toISOString() },
    });
    expect(carrierDateForSale(sale, [linked])).toBe('2026-10-09');
  });

  it('is null with no dated order, or with two claiming the sale', () => {
    expect(carrierDateForSale(sale, [order({ id: 'o-1' })])).toBeNull();
    expect(
      carrierDateForSale(sale, [
        order({ id: 'o-1', estInstallDate: '2026-10-02' }),
        order({ id: 'o-3', estInstallDate: '2026-10-05' }),
      ])
    ).toBeNull();
  });
});

describe('the report and a door with history', () => {
  const sale = { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) };

  it("never pushes an old install's day onto a newer sale at the same door", async () => {
    setSales([{ ...sale, installDate: noon(8) }]);
    const result = await syncInstallDatesFromOrders({
      orders: [
        order({ id: 'old', status: 'active', orderDate: reportDay(-200), estInstallDate: reportDay(-190), activationDate: reportDay(-190) }),
        order({ id: 'new', orderDate: reportDay(-3), estInstallDate: reportDay(10) }),
      ],
      now: NOW,
    });

    expect(result.updated).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('agrees with the page when the newest order has no date yet', async () => {
    setSales([sale]);
    const miss = order({ id: 'brk', status: 'breakage', orderDate: null, estInstallDate: reportDay(1) });
    const reorder = order({ id: 'new', orderDate: reportDay(3), estInstallDate: null });

    expect(matchFiberOrdersToSales([sale], [miss, reorder]).get('sale-1')).toBe(reorder);
    const result = await syncInstallDatesFromOrders({ orders: [miss, reorder], now: NOW });

    expect(result.updated).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe('a re-order at a door with an old install', () => {
  it("moves the new sale to the new order's day, not the old install's", async () => {
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', saleDate: noon(-2), installDate: noon(2) },
    ]);
    const result = await syncInstallDatesFromOrders({
      orders: [
        order({ id: 'old', status: 'active', orderDate: reportDay(-200), estInstallDate: reportDay(-190), activationDate: reportDay(-190) }),
        order({ id: 'new', orderDate: reportDay(-2), estInstallDate: reportDay(10) }),
      ],
      now: NOW,
    });

    expect(result.updated).toBe(1);
    expect(installDayKey(updateMock.mock.calls[0][1].installDate)).toBe(reportDay(10));
  });
});

describe('a person-set date and a batch that differs from what they saw', () => {
  // The rep's edit read every stored order and recorded the miss; the next
  // batch carries only the stale order row, still on the missed day.
  const repSale = {
    id: 'sale-1',
    salesRepId: 'rep-1',
    customerAddress: '123 Main St',
    installDate: noon(6),
    installDateSource: 'rep',
    repEditOrderId: 'brk',
    repEditCarrierDate: reportDay(1),
  };

  it('keeps the date when a different row carries nothing newer', async () => {
    setSales([repSale]);
    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', orderDate: reportDay(-10), estInstallDate: reportDay(1) })],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 0, unchanged: 1 });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('takes a different row that was moved past the recorded day', async () => {
    setSales([repSale]);
    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', orderDate: reportDay(-10), estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(result.updated).toBe(1);
    expect(installDayKey(updateMock.mock.calls[0][1].installDate)).toBe(reportDay(9));
    expect(dispatchMock).toHaveBeenCalledTimes(1);
  });

  it('takes the recorded row once its own day changes, even to an earlier one', async () => {
    setSales([{ ...repSale, repEditOrderId: 'o-1', repEditCarrierDate: reportDay(4) }]);
    const same = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(4) })],
      now: NOW,
    });
    expect(same.updated).toBe(0);

    const moved = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(3) })],
      now: NOW,
    });
    expect(moved.updated).toBe(1);
    expect(installDayKey(updateMock.mock.calls[0][1].installDate)).toBe(reportDay(3));
  });

  it("protects an admin's reschedule the same way, and leaves older admin dates as before", async () => {
    setSales([{ ...repSale, installDateSource: 'admin' }]);
    const kept = await syncInstallDatesFromOrders({
      orders: [order({ id: 'brk', status: 'breakage', estInstallDate: reportDay(1) })],
      now: NOW,
    });
    expect(kept).toMatchObject({ updated: 0, unchanged: 1 });

    setSales([{ id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(6), installDateSource: 'admin' }]);
    const legacy = await syncInstallDatesFromOrders({
      orders: [order({ id: 'brk', status: 'breakage', estInstallDate: reportDay(1) })],
      now: NOW,
    });
    expect(legacy.updated).toBe(1);
  });
});

describe("the admin's stored saleLink", () => {
  it('honours "not any sale" stored on the order, though the parsed row has none', async () => {
    setSales([{ id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) }]);
    storedLinks = { 'o-1': { saleId: null, by: 'a1', byName: 'Admin', at: NOW.toISOString() } };

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(getAllMock).toHaveBeenCalled();
    expect(result.updated).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('follows a stored link to the sale it names', async () => {
    setSales([
      { id: 'sale-1', salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) },
      { id: 'sale-2', salesRepId: 'rep-2', customerAddress: '9 Elsewhere Rd', installDate: noon(2) },
    ]);
    storedLinks = { 'o-1': { saleId: 'sale-2', by: 'a1', byName: 'Admin', at: NOW.toISOString() } };

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(result.updated).toBe(1);
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(updateMock.mock.calls[0][0]).toBe('sale-2');
  });
});

describe('a sale that changes while the report runs', () => {
  const updateTime = { isEqual: () => false, label: 'read-1' };
  const freshTime = { isEqual: () => false, label: 'read-2' };

  function setSaleWithTime(data: Record<string, unknown>) {
    salesGetMock.mockResolvedValue({ docs: [{ id: 'sale-1', updateTime, data: () => data }] });
  }
  const base = { salesRepId: 'rep-1', customerAddress: '123 Main St', installDate: noon(2) };
  const stale = Object.assign(new Error('stale'), { code: 9 });

  it('writes only if the sale is as it was read', async () => {
    setSaleWithTime(base);
    await syncInstallDatesFromOrders({ orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })], now: NOW });

    expect(updateMock.mock.calls[0][2]).toEqual({ lastUpdateTime: updateTime });
  });

  it("re-reads and keeps a rep's date set mid-run", async () => {
    setSaleWithTime(base);
    updateMock.mockRejectedValueOnce(stale);
    freshGetMock.mockResolvedValue({
      id: 'sale-1',
      exists: true,
      updateTime: freshTime,
      data: () => ({
        ...base,
        installDate: noon(12),
        installDateSource: 'rep',
        repEditOrderId: 'o-1',
        repEditCarrierDate: reportDay(9),
      }),
    });

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ updated: 0, unchanged: 1, errors: 0 });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('re-reads and writes when the change was something else', async () => {
    setSaleWithTime(base);
    updateMock.mockRejectedValueOnce(stale);
    freshGetMock.mockResolvedValue({
      id: 'sale-1',
      exists: true,
      updateTime: freshTime,
      data: () => ({ ...base, notes: 'called the customer' }),
    });

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(result).toMatchObject({ updated: 1, errors: 0 });
    expect(updateMock.mock.calls[1][2]).toEqual({ lastUpdateTime: freshTime });
  });

  it('counts an error when it changes again', async () => {
    setSaleWithTime(base);
    updateMock.mockRejectedValue(stale);
    freshGetMock.mockResolvedValue({ id: 'sale-1', exists: true, updateTime: freshTime, data: () => base });

    const result = await syncInstallDatesFromOrders({
      orders: [order({ id: 'o-1', estInstallDate: reportDay(9) })],
      now: NOW,
    });

    expect(updateMock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ updated: 0, errors: 1 });
  });
});
