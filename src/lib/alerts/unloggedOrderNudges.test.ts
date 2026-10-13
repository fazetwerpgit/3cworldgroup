import { beforeEach, describe, expect, it, vi } from 'vitest';

const { defaultDispatch } = vi.hoisted(() => ({ defaultDispatch: vi.fn() }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: defaultDispatch }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: null }));

import { runUnloggedOrderNudges } from './unloggedOrderNudges';
import { unloggedOrdersPush } from '@/lib/sales/unloggedOrders';

type Data = Record<string, unknown>;

/** An in-memory Firestore: plain reads, getAll, create. */
function fakeDb(seed: Record<string, Record<string, Data>>) {
  const store = new Map<string, Map<string, Data>>();
  for (const [name, docs] of Object.entries(seed)) store.set(name, new Map(Object.entries(docs)));
  const coll = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const creates: Array<{ collection: string; id: string; data: Data }> = [];
  const snap = (name: string, id: string) => {
    const data = coll(name).get(id);
    return { id, exists: data !== undefined, data: () => data, get: (field: string) => data?.[field] };
  };
  const db = {
    collection: (name: string) => ({
      get: async () => ({ docs: [...coll(name).keys()].map((id) => snap(name, id)) }),
      doc: (id: string) => ({
        id,
        collectionName: name,
        get: async () => snap(name, id),
        create: async (data: Data) => {
          if (coll(name).has(id)) throw Object.assign(new Error('exists'), { code: 6 });
          coll(name).set(id, data);
          creates.push({ collection: name, id, data });
        },
      }),
    }),
    getAll: async (...refs: Array<{ id: string; collectionName: string }>) => refs.map((r) => snap(r.collectionName, r.id)),
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, store, creates };
}

/** 9 AM Chicago Monday Oct 12, when the report lands. */
const MORNING = new Date('2026-10-12T14:00:00Z');
const noon = (day: string) => new Date(`${day}T17:00:00Z`);

function order(id: string, address: string, over: Data = {}): Data {
  return {
    status: 'pending_install',
    rawStatus: '',
    repDealerId: '1',
    repName: 'X',
    matchedUserId: 'miles',
    orderDate: '2026-10-09',
    estInstallDate: '2026-10-20',
    activationDate: null,
    address,
    customerName: null,
    breakageReason: null,
    ...over,
    id,
  };
}

function seed() {
  return {
    users: {
      miles: { displayName: 'Miles Rivera', status: 'active', role: 'field' },
      mason: { displayName: 'Mason Smith', status: 'active', role: 'field' },
      noah: { displayName: 'Noah Kent', status: 'active', role: 'field' },
      gone: { displayName: 'Gone Rep', status: 'inactive', role: 'field' },
    },
    sales: {
      logged: {
        salesRepId: 'mason',
        salesRepName: 'Mason Smith',
        customerName: 'Craig Thompson',
        customerAddress: '12 Oak St',
        status: 'approved',
        saleDate: noon('2026-10-08'),
        installDate: noon('2026-10-20'),
        totalValue: 120,
        products: [],
      },
    },
    fiberOrders: {
      // Miles: three orders from Friday, none logged.
      a: order('a', '101 MAPLE ST'),
      b: order('b', '102 MAPLE ST', { status: 'pre_sale' }),
      c: order('c', '103 MAPLE ST', { status: 'active', activationDate: '2026-10-11' }),
      // Mason: one unlogged, one his sale claims.
      d: order('d', '1205 SOUTHWOOD DR', { matchedUserId: 'mason', orderDate: '2026-10-11' }),
      e: order('e', '12 OAK ST', { matchedUserId: 'mason', orderDate: '2026-10-08' }),
      // Never told: carrier cancelled, a missed install, too old, no date, nobody's, an inactive rep's.
      f: order('f', '104 MAPLE ST', { status: 'cancelled' }),
      g: order('g', '105 MAPLE ST', { status: 'breakage', breakageReason: 'CX Missed — Customer Not Home' }),
      h: order('h', '106 MAPLE ST', { orderDate: '2026-09-01' }),
      i: order('i', '107 MAPLE ST', { orderDate: null, estInstallDate: null }),
      j: order('j', '108 MAPLE ST', { matchedUserId: null }),
      k: order('k', '109 MAPLE ST', { matchedUserId: 'gone' }),
      // An admin said "Not a sale".
      l: order('l', '110 MAPLE ST', { saleLink: { saleId: null, by: 'jacob', byName: 'Jacob', at: '2026-10-10' } }),
    },
    config: { fiberReportStatus: { lastReportAsOf: '2026-10-11' } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.UNLOGGED_ORDER_NUDGE_OFF;
});

describe('runUnloggedOrderNudges', () => {
  it('tells each rep once about their live, recent orders no sale claims', async () => {
    const { db, creates } = fakeDb(seed());
    const dispatch = vi.fn(async () => {});

    const { counts } = await runUnloggedOrderNudges({ db, now: MORNING, dispatch });

    expect(counts).toEqual({
      dryRun: false,
      found: 5,
      alreadySent: 0,
      skippedInactiveRep: 1,
      ordersTold: 4,
      repsTold: 2,
      errors: 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith({
      userId: 'miles',
      type: 'unlogged_orders',
      title: 'Orders not in the portal',
      message: "T-Fiber has 3 of your orders that aren't logged yet. Log them so they count on the board and in your pay estimate.",
      link: '/portal/sales/new/bulk',
      metadata: { orderIds: ['a', 'b', 'c'] },
    });
    expect(dispatch).toHaveBeenCalledWith({
      userId: 'mason',
      type: 'unlogged_orders',
      title: 'Orders not in the portal',
      message:
        "T-Fiber has an order of yours that isn't logged yet (1205 Southwood Dr). Log it so it counts on the board and in your pay estimate.",
      link: '/portal/sales/new',
      metadata: { orderIds: ['d'] },
    });
    expect(creates.map((write) => `${write.collection}/${write.id}`).sort()).toEqual([
      'unloggedOrderNudges/a',
      'unloggedOrderNudges/b',
      'unloggedOrderNudges/c',
      'unloggedOrderNudges/d',
    ]);
  });

  it('never tells the same order twice, and tells only the new one in a later report', async () => {
    const data = seed();
    const { db, store } = fakeDb(data);
    const dispatch = vi.fn(async () => {});

    await runUnloggedOrderNudges({ db, now: MORNING, dispatch });
    store.get('fiberOrders')!.set('m', order('m', '111 MAPLE ST', { orderDate: '2026-10-12' }));
    dispatch.mockClear();
    const { counts } = await runUnloggedOrderNudges({ db, now: new Date('2026-10-13T14:00:00Z'), dispatch });

    expect(counts).toMatchObject({ alreadySent: 4, ordersTold: 1, repsTold: 1 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'miles', metadata: { orderIds: ['m'] }, message: expect.stringContaining('(111 Maple St)') })
    );
  });

  it('a second delivery of the same report sends nothing', async () => {
    const { db } = fakeDb(seed());
    const dispatch = vi.fn(async () => {});

    await Promise.all([
      runUnloggedOrderNudges({ db, now: MORNING, dispatch }),
      runUnloggedOrderNudges({ db, now: MORNING, dispatch }),
    ]);

    expect(dispatch).toHaveBeenCalledTimes(2); // one per rep, not per delivery
  });

  it('is a dry run with UNLOGGED_ORDER_NUDGE_OFF=true', async () => {
    process.env.UNLOGGED_ORDER_NUDGE_OFF = 'true';
    const { db, creates } = fakeDb(seed());
    const dispatch = vi.fn(async () => {});

    const result = await runUnloggedOrderNudges({ db, now: MORNING, dispatch });

    expect(result.counts.dryRun).toBe(true);
    expect(result.pushes.map((push) => [push.repId, push.orderIds])).toEqual([
      ['miles', ['a', 'b', 'c']],
      ['mason', ['d']],
    ]);
    expect(dispatch).not.toHaveBeenCalled();
    expect(creates).toEqual([]);
  });
});

describe('unloggedOrdersPush', () => {
  const one = { orderId: 'x', repId: 'noah', repName: 'Noah Kent', street: '1205 Southwood Dr', orderDate: '2026-10-11', status: 'pre_sale' as const };

  it('names the street for one order and counts several', () => {
    expect(unloggedOrdersPush([one]).message).toBe(
      "T-Fiber has an order of yours that isn't logged yet (1205 Southwood Dr). Log it so it counts on the board and in your pay estimate."
    );
    expect(unloggedOrdersPush([one, one]).message).toBe(
      "T-Fiber has 2 of your orders that aren't logged yet. Log them so they count on the board and in your pay estimate."
    );
  });
});
