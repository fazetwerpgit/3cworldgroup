import { beforeEach, describe, expect, it, vi } from 'vitest';

const { docs, runTransactionMock, dispatchMock } = vi.hoisted(() => {
  /** fiberOrders docs as stored now (after the report's upsert). */
  const docs = new Map<string, Record<string, unknown>>();
  const runTransactionMock = vi.fn(
    async (body: (transaction: unknown) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const result = await body({
        get: async (ref: { id: string }) => ({
          exists: docs.has(ref.id),
          get: (field: string) => docs.get(ref.id)?.[field],
        }),
        update: (ref: { id: string }, data: Record<string, unknown>) => {
          writes.push(() => docs.set(ref.id, { ...docs.get(ref.id), ...data }));
        },
      });
      for (const write of writes) write();
      return result;
    }
  );
  return { docs, runTransactionMock, dispatchMock: vi.fn() };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: (id: string) => ({ id }) }),
    runTransaction: runTransactionMock,
  },
}));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: dispatchMock }));

import { sendCarrierNotices } from './carrierNotices';
import type { FiberOrder } from '@/types/fiberOrder';

const NOW = new Date('2026-09-22T12:00:00.000Z');

const cancelled = {
  id: 'o-1',
  status: 'cancelled',
  matchedUserId: 'rep-1',
  address: '123 Main St',
  customerName: null,
  breakageReason: null,
} as unknown as FiberOrder;

/** What the webhook read before its upsert: the order was still pending. */
const beforeUpsert = new Map([['o-1', { status: 'pending_install', noticeStatus: null }]]);

beforeEach(() => {
  vi.clearAllMocks();
  docs.clear();
  docs.set('o-1', { status: 'cancelled' });
  dispatchMock.mockResolvedValue(undefined);
});

describe('sendCarrierNotices', () => {
  it('marks the order and tells the rep', async () => {
    const counts = await sendCarrierNotices({
      orders: [cancelled],
      stored: beforeUpsert,
      orderSales: new Map(),
      now: NOW,
    });

    expect(counts).toEqual({ found: 1, alreadySent: 0, sent: 1, summarized: 0, errors: 0 });
    expect(docs.get('o-1')?.carrierNotice).toEqual({ status: 'cancelled', at: NOW.toISOString() });
    expect(dispatchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rep-1',
        type: 'carrier_order_issue',
        title: 'Carrier cancelled an order',
        link: '/portal/sales',
      })
    );
  });

  it('tells the rep once when the same report is delivered twice at once', async () => {
    // Both deliveries read the order as pending before either wrote it.
    const input = { orders: [cancelled], stored: beforeUpsert, orderSales: new Map(), now: NOW };
    const first = await sendCarrierNotices(input);
    const second = await sendCarrierNotices(input);

    expect(first.sent).toBe(1);
    expect(second).toEqual({ found: 1, alreadySent: 1, sent: 0, summarized: 0, errors: 0 });
    expect(dispatchMock).toHaveBeenCalledOnce();
  });

  it('sends nothing for a notice it could not mark, and counts it', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    runTransactionMock.mockRejectedValueOnce(new Error('contention'));

    const counts = await sendCarrierNotices({
      orders: [cancelled],
      stored: beforeUpsert,
      orderSales: new Map(),
      now: NOW,
    });

    expect(counts).toMatchObject({ found: 1, sent: 0, errors: 1 });
    expect(dispatchMock).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
