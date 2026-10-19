import { beforeEach, describe, expect, it, vi } from 'vitest';

type Data = Record<string, unknown>;

const store = vi.hoisted(() => ({
  tables: new Map<string, Map<string, Record<string, unknown>>>(),
  salesPageReads: 0,
  failSalesRead: false,
}));

function table(name: string) {
  if (!store.tables.has(name)) store.tables.set(name, new Map());
  return store.tables.get(name)!;
}

vi.mock('@/lib/firebase/admin', () => {
  const ref = (collection: string, id: string) => ({
    collection,
    id,
    get: async () => snap(collection, id),
    set: async (data: Data, opts?: { merge?: boolean }) => write(collection, id, data, opts),
  });
  const snap = (collection: string, id: string) => {
    const data = table(collection).get(id);
    return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  };
  const write = (collection: string, id: string, data: Data, opts?: { merge?: boolean }) => {
    const before = table(collection).get(id);
    table(collection).set(id, opts?.merge && before ? { ...before, ...data } : { ...data });
  };
  const salesQuery = (limit: number, after: string | null) => ({
    limit: (n: number) => salesQuery(n, after),
    startAfter: (id: string) => salesQuery(limit, id),
    get: async () => {
      store.salesPageReads += 1;
      if (store.failSalesRead) throw new Error('sales page timed out');
      const ids = [...table('sales').keys()].sort().filter((id) => after === null || id > after).slice(0, limit);
      return { docs: ids.map((id) => ({ id, data: () => ({ ...table('sales').get(id) }) })) };
    },
  });
  const adminDb = {
    collection: (name: string) => ({
      doc: (id: string) => ref(name, id),
      orderBy: () => salesQuery(Infinity, null),
    }),
    getAll: async (...refs: Array<{ collection: string; id: string }>) => refs.map((r) => snap(r.collection, r.id)),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
      fn({
        get: async (r: { collection: string; id: string }) => snap(r.collection, r.id),
        set: (r: { collection: string; id: string }, data: Data, opts?: { merge?: boolean }) => write(r.collection, r.id, data, opts),
      }),
    batch: () => {
      const ops: Array<() => void> = [];
      return {
        set: (r: { collection: string; id: string }, data: Data) => ops.push(() => write(r.collection, r.id, data)),
        commit: async () => ops.forEach((op) => op()),
      };
    },
  };
  return { adminDb };
});

vi.mock('@/lib/fiberReport/ordersCache', () => ({ getAllFiberOrders: vi.fn(async () => []) }));

import {
  DEBOUNCE_MS,
  META_DOC,
  MISSING_WAIT_MS,
  rebuildLeaderboardSnapshot,
  resetSnapshotRebuildForTests,
  SNAPSHOT_COLLECTION,
  loadBoardPeriod,
  loadCompanyTape,
  markLeaderboardDirty,
  snapshotState,
} from '@/lib/leaderboard/snapshotStore';
import { periodBounds } from '@/lib/leaderboard/periods';
import { SNAPSHOT_VERSION, snapshotValidKey } from '@/lib/leaderboard/snapshot';

const NOW = new Date('2026-10-14T17:30:00.000Z');

function sale(id: string, rep: string, at: Date, extra: Data = {}) {
  table('sales').set(id, { salesRepId: rep, salesRepName: `Rep ${rep}`, status: 'approved', saleDate: at, createdAt: at, totalPoints: 2, ...extra });
}

function weekRequest(now: Date, viewerUid = 'r1') {
  return { now, viewerUid, scope: 'approved' as const, periodId: 'week', start: periodBounds('week', now)!.start, end: null, withHistory: true };
}

beforeEach(() => {
  store.tables.clear();
  store.salesPageReads = 0;
  store.failSalesRead = false;
  resetSnapshotRebuildForTests();
});

describe('leaderboard snapshot store', () => {
  it('builds on the first read, then serves the stored docs without reading sales', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    sale('b', 'r2', new Date('2026-10-13T16:00:00.000Z'));

    const first = await loadBoardPeriod(weekRequest(NOW));
    expect(first.source).toBe('rebuilt');
    expect(first.payload.totals.map((t) => t.salesRepId).sort()).toEqual(['r1', 'r2']);
    expect(table(SNAPSHOT_COLLECTION).get(META_DOC)).toMatchObject({ version: SNAPSHOT_VERSION, validKey: snapshotValidKey(NOW) });

    const reads = store.salesPageReads;
    const second = await loadBoardPeriod(weekRequest(new Date(NOW.getTime() + 5_000)));
    expect(second.source).toBe('snapshot');
    expect(second.payload).toEqual(first.payload);
    expect(store.salesPageReads).toBe(reads);
  });

  it('debounces a dirty mark: serves the old board inside 30 s, rebuilds after', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    await loadBoardPeriod(weekRequest(NOW));

    sale('b', 'r2', new Date('2026-10-14T15:00:00.000Z'));
    await markLeaderboardDirty(NOW.getTime() + 1_000);

    const soon = await loadBoardPeriod(weekRequest(new Date(NOW.getTime() + 10_000)));
    expect(soon.source).toBe('snapshot');
    expect(soon.payload.totals).toHaveLength(1);

    const later = await loadBoardPeriod(weekRequest(new Date(NOW.getTime() + DEBOUNCE_MS + 1_000)));
    expect(later.source).toBe('rebuilt');
    expect(later.payload.totals).toHaveLength(2);
  });

  it('rebuilds right away when the last build is older than the debounce', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    await loadBoardPeriod(weekRequest(NOW));
    sale('b', 'r2', new Date('2026-10-14T15:00:00.000Z'));
    const t = NOW.getTime() + 10 * 60_000;
    await markLeaderboardDirty(t);
    const next = await loadBoardPeriod(weekRequest(new Date(t + 500)));
    expect(next.source).toBe('rebuilt');
    expect(next.payload.totals).toHaveLength(2);
  });

  it('keeps a write that lands during a build dirty', () => {
    const meta = { version: SNAPSHOT_VERSION, builtAtMs: 2_000, buildStartedMs: 1_000, validKey: 'k', dirtyAtMs: 1_500 };
    expect(snapshotState(meta, 3_000, 'k')).toBe('stale');
    expect(snapshotState({ ...meta, dirtyAtMs: 900 }, 3_000, 'k')).toBe('fresh');
    expect(snapshotState({ ...meta, dirtyAtMs: 900 }, 3_000, 'other-day')).toBe('missing');
    expect(snapshotState({ ...meta, dirtyAtMs: 900 }, 2_000 + 61 * 60_000, 'k')).toBe('stale');
  });

  it('rebuilds on a new day (rank history and week bounds are day-based)', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    await loadBoardPeriod(weekRequest(NOW));
    const tomorrow = new Date(NOW.getTime() + 24 * 3_600_000);
    expect((await loadBoardPeriod(weekRequest(tomorrow))).source).toBe('rebuilt');
  });

  it('reads every sale across pages (no 5,000 cap)', async () => {
    for (let i = 0; i < 2500; i++) sale(`s${String(i).padStart(5, '0')}`, `r${i % 7}`, new Date('2026-10-13T15:00:00.000Z'));
    const result = await loadBoardPeriod(weekRequest(NOW));
    expect(result.payload.totals.reduce((sum, t) => sum + t.totalSales, 0)).toBe(2500);
    expect(store.salesPageReads).toBe(3);
  });

  it('builds a demo account its own board live; everyone else never sees demo sales', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    sale('d', 'demo', new Date('2026-10-13T15:00:00.000Z'), { demoAccount: true });
    const shared = await loadBoardPeriod(weekRequest(NOW, 'r1'));
    expect(shared.payload.totals.map((t) => t.salesRepId)).toEqual(['r1']);
    const demo = await loadBoardPeriod(weekRequest(NOW, 'demo'));
    expect(demo.source).toBe('live');
    expect(demo.payload.totals.map((t) => t.salesRepId).sort()).toEqual(['demo', 'r1']);
  });

  it('reads a month with no counted sales as an empty board', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    await loadBoardPeriod(weekRequest(NOW));
    const start = new Date('2026-03-01T06:00:00.000Z');
    const result = await loadBoardPeriod({ ...weekRequest(NOW), periodId: 'month-2026-03', start, end: new Date('2026-04-01T05:00:00.000Z'), withHistory: false });
    expect(result.source).toBe('snapshot');
    expect(result.payload).toMatchObject({ totals: [], history: null, startMs: start.getTime() });
  });

  it('serves the company tape from the snapshot meta, approved sales only, no sales read', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'), { totalValue: 80 });
    sale('b', 'r1', new Date('2026-10-12T15:00:00.000Z'), { totalValue: 80 });
    sale('c', 'r2', new Date('2026-10-13T15:00:00.000Z'), { status: 'pending' });
    sale('d', 'demo', new Date('2026-10-13T15:00:00.000Z'), { demoAccount: true });
    await loadBoardPeriod(weekRequest(NOW));
    const reads = store.salesPageReads;
    const tape = await loadCompanyTape(new Date(NOW.getTime() + 1_000), 'r2');
    expect(tape).toMatchObject({ mtdCount: 2, mtdMonthlyValue: 160, topRep: { repName: 'Rep r1', count: 2 } });
    expect(store.salesPageReads).toBe(reads);
    // The demo account still sees its own sale on its tape (built live).
    expect((await loadCompanyTape(new Date(NOW.getTime() + 2_000), 'demo')).mtdCount).toBe(3);
  });
});

describe('a failed rebuild of a stale snapshot', () => {
  it('serves the stored board and tape instead of failing the request', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    const first = await loadBoardPeriod(weekRequest(NOW));
    sale('b', 'r2', new Date('2026-10-14T15:00:00.000Z'));
    const t = NOW.getTime() + DEBOUNCE_MS + 5_000;
    await markLeaderboardDirty(t);

    store.failSalesRead = true;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const board = await loadBoardPeriod(weekRequest(new Date(t + 500)));
      expect(board.source).toBe('snapshot');
      expect(board.payload).toEqual(first.payload);
      const tape = await loadCompanyTape(new Date(t + 1_000), 'r1');
      expect(tape).toMatchObject({ mtdCount: 1 });
    } finally {
      errors.mockRestore();
    }
  });

  it('still fails a request with nothing stored to serve', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    store.failSalesRead = true;
    await expect(loadBoardPeriod(weekRequest(NOW))).rejects.toThrow('sales page timed out');
  });
});

describe('a demo viewer\'s live board is cached per viewer', () => {
  it('reads sales once per debounce, not once per request, and picks up a new sale after it', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    sale('d', 'demo', new Date('2026-10-13T15:00:00.000Z'), { demoAccount: true });
    await loadBoardPeriod(weekRequest(NOW, 'r1'));

    const reads = store.salesPageReads;
    const first = await loadBoardPeriod(weekRequest(new Date(NOW.getTime() + 1_000), 'demo'));
    expect(first.payload.totals.map((t) => t.salesRepId).sort()).toEqual(['demo', 'r1']);
    await loadBoardPeriod(weekRequest(new Date(NOW.getTime() + 2_000), 'demo'));
    await loadCompanyTape(new Date(NOW.getTime() + 3_000), 'demo');
    await loadBoardPeriod({ ...weekRequest(new Date(NOW.getTime() + 4_000), 'demo'), periodId: 'year', start: periodBounds('year', NOW)!.start });
    expect(store.salesPageReads).toBe(reads + 1);

    // The demo account logs another sale: shown once the debounce has passed.
    sale('d2', 'demo', new Date('2026-10-14T15:00:00.000Z'), { demoAccount: true });
    await markLeaderboardDirty(NOW.getTime() + 5_000);
    const soon = await loadBoardPeriod(weekRequest(new Date(NOW.getTime() + 6_000), 'demo'));
    expect(store.salesPageReads).toBe(reads + 1);
    expect(soon.payload.totals.find((t) => t.salesRepId === 'demo')?.totalSales).toBe(1);
    const later = await loadBoardPeriod(weekRequest(new Date(NOW.getTime() + 1_000 + DEBOUNCE_MS), 'demo'));
    expect(later.payload.totals.find((t) => t.salesRepId === 'demo')?.totalSales).toBe(2);
  });
});

describe('a missing snapshot is rebuilt behind the lease', () => {
  it('concurrent first-ever requests share ONE full sales read and all get the board', async () => {
    sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
    sale('b', 'r2', new Date('2026-10-13T16:00:00.000Z'));

    const results = await Promise.all([
      loadBoardPeriod(weekRequest(NOW)),
      loadBoardPeriod(weekRequest(NOW, 'r2')),
      loadCompanyTape(NOW, 'r1'),
      loadBoardPeriod(weekRequest(NOW)),
    ]);

    expect(store.salesPageReads).toBe(1);
    for (const result of [results[0], results[1], results[3]] as Awaited<ReturnType<typeof loadBoardPeriod>>[]) {
      expect(result.payload.totals.map((t) => t.salesRepId).sort()).toEqual(['r1', 'r2']);
    }
  });

  it('another instance holds the lease: waits, then serves what that build stored (no sales read here)', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
      table(SNAPSHOT_COLLECTION).set(META_DOC, { leaseUntilMs: NOW.getTime() + 60_000 });

      const pending = loadBoardPeriod(weekRequest(NOW));
      await vi.advanceTimersByTimeAsync(500);
      // The lease holder's build lands (its one sales read).
      await rebuildLeaderboardSnapshot(NOW);
      const readsByHolder = store.salesPageReads;
      await vi.advanceTimersByTimeAsync(1_000);

      const result = await pending;
      expect(result.source).toBe('snapshot');
      expect(result.payload.totals.map((t) => t.salesRepId)).toEqual(['r1']);
      expect(store.salesPageReads).toBe(readsByHolder);
    } finally {
      vi.useRealTimers();
    }
  });

  it("the holder never finishes: builds once live after the wait, so a first request still gets data", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      sale('a', 'r1', new Date('2026-10-13T15:00:00.000Z'));
      table(SNAPSHOT_COLLECTION).set(META_DOC, { leaseUntilMs: NOW.getTime() + 60_000 });

      const pending = Promise.all([loadBoardPeriod(weekRequest(NOW)), loadBoardPeriod(weekRequest(NOW))]);
      await vi.advanceTimersByTimeAsync(MISSING_WAIT_MS + 1_000);
      const [one, two] = await pending;

      expect(one.source).toBe('live');
      expect(one.payload.totals.map((t) => t.salesRepId)).toEqual(['r1']);
      expect(two.payload).toEqual(one.payload);
      expect(store.salesPageReads).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
