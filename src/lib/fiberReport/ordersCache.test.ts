import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  orders: [] as Array<{ id: string; data: Record<string, unknown> }>,
  fullReads: 0,
  statusWrites: [] as Array<Record<string, unknown>>,
}));
const markDirty = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => ({
      get: async () => {
        if (name === 'fiberOrders') db.fullReads += 1;
        return { docs: db.orders.map((o) => ({ id: o.id, data: () => o.data })) };
      },
      doc: () => ({
        set: async (data: Record<string, unknown>) => {
          db.statusWrites.push(data);
        },
      }),
    }),
  },
}));
vi.mock('@/lib/leaderboard/snapshotStore', () => ({ markLeaderboardDirty: markDirty }));

import {
  fiberOrdersCacheKey,
  getAllFiberOrders,
  invalidateFiberOrdersCache,
  resetFiberOrdersCacheForTests,
} from '@/lib/fiberReport/ordersCache';

beforeEach(() => {
  resetFiberOrdersCacheForTests();
  db.orders = [{ id: 'o1', data: { status: 'active' } }];
  db.fullReads = 0;
  db.statusWrites = [];
  markDirty.mockClear();
  vi.useRealTimers();
});

describe('fiberOrders cache', () => {
  it('keys on lastReportAt and ordersRev', () => {
    expect(fiberOrdersCacheKey({ lastReportAt: 'r1', ordersRev: 4 })).toBe('r1|4');
    expect(fiberOrdersCacheKey({ lastReportAt: 'r1' })).toBe('r1|0');
    expect(fiberOrdersCacheKey('r1')).toBe('r1|0');
    expect(fiberOrdersCacheKey(null)).toBe('|0');
  });

  it('reads the collection once per key, not every 5 minutes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-14T12:00:00Z'));
    const status = { lastReportAt: 'r1', ordersRev: 1 };
    await getAllFiberOrders(status);
    vi.setSystemTime(new Date('2026-10-14T12:30:00Z'));
    await getAllFiberOrders(status);
    expect(db.fullReads).toBe(1);
    // The hour backstop for writes nothing stamped.
    vi.setSystemTime(new Date('2026-10-14T13:01:00Z'));
    await getAllFiberOrders(status);
    expect(db.fullReads).toBe(2);
  });

  it('re-reads when another instance bumped ordersRev, or a new report landed', async () => {
    await getAllFiberOrders({ lastReportAt: 'r1', ordersRev: 1 });
    db.orders = [{ id: 'o1', data: { status: 'cancelled' } }];
    const bumped = await getAllFiberOrders({ lastReportAt: 'r1', ordersRev: 2 });
    expect(bumped[0]).toMatchObject({ status: 'cancelled' });
    await getAllFiberOrders({ lastReportAt: 'r2', ordersRev: 2 });
    expect(db.fullReads).toBe(3);
  });

  it('honours fresh', async () => {
    await getAllFiberOrders('r1');
    await getAllFiberOrders('r1', { fresh: true });
    expect(db.fullReads).toBe(2);
  });

  it('invalidate drops the local copy, bumps ordersRev for every instance and marks the board dirty', async () => {
    await getAllFiberOrders('r1');
    await invalidateFiberOrdersCache();
    expect(db.statusWrites).toHaveLength(1);
    expect(Object.keys(db.statusWrites[0])).toEqual(['ordersRev']);
    expect(markDirty).toHaveBeenCalledTimes(1);
    await getAllFiberOrders('r1');
    expect(db.fullReads).toBe(2);
  });
});
