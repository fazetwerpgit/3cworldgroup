import { beforeEach, describe, expect, it, vi } from 'vitest';

const { defaultDispatch } = vi.hoisted(() => ({ defaultDispatch: vi.fn() }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: defaultDispatch }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: null }));

import { runOverdueInstallAlerts } from './installOverdueAlerts';

type Data = Record<string, unknown>;

/** An in-memory Firestore: plain reads, getAll, serialized transactions, create. */
function fakeDb(seed: Record<string, Record<string, Data>>) {
  const store = new Map<string, Map<string, Data>>();
  for (const [name, docs] of Object.entries(seed)) store.set(name, new Map(Object.entries(docs)));
  const coll = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const writes: Array<{ collection: string; id: string; data: Data }> = [];
  const snap = (name: string, id: string) => {
    const data = coll(name).get(id);
    return { id, exists: data !== undefined, data: () => data, get: (field: string) => data?.[field] };
  };
  const ref = (name: string, id: string) => ({
    id,
    collectionName: name,
    get: async () => snap(name, id),
    create: async (data: Data) => {
      if (coll(name).has(id)) throw Object.assign(new Error('exists'), { code: 6 });
      coll(name).set(id, data);
      writes.push({ collection: name, id, data });
    },
  });
  let queue: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (name: string) => ({
      get: async () => ({ docs: [...coll(name).keys()].map((id) => snap(name, id)) }),
      doc: (id: string) => ref(name, id),
    }),
    getAll: async (...refs: Array<{ id: string; collectionName: string }>) =>
      refs.map((r) => snap(r.collectionName, r.id)),
    runTransaction: <T>(body: (transaction: unknown) => Promise<T>): Promise<T> => {
      const result = queue.then(async () => {
        const pending: Array<() => void> = [];
        const value = await body({
          get: async (r: { collectionName: string; id: string }) => snap(r.collectionName, r.id),
          set: (r: { collectionName: string; id: string }, data: Data) => {
            pending.push(() => {
              coll(r.collectionName).set(r.id, data);
              writes.push({ collection: r.collectionName, id: r.id, data });
            });
          },
        });
        for (const write of pending) write();
        return value;
      });
      queue = result.catch(() => undefined);
      return result;
    },
  };
  return { db: db as unknown as FirebaseFirestore.Firestore, store, writes };
}

/** Noon Chicago on a day, as sale install dates are stored. */
const noon = (day: string) => new Date(`${day}T17:00:00Z`);
/** 9 AM Chicago, when the report lands. */
const morning = (day: string) => new Date(`${day}T14:00:00Z`);

function order(id: string, address: string, over: Data = {}): Data {
  return {
    status: 'pending_install',
    rawStatus: '',
    repDealerId: '1',
    repName: 'X',
    matchedUserId: 'cooper',
    orderDate: '2026-07-20',
    estInstallDate: '2026-08-01',
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
      cooper: { displayName: 'Cooper Smith', status: 'active', role: 'field' },
      gone: { displayName: 'Gone Rep', status: 'inactive', role: 'field' },
      jacob: { displayName: 'Jacob Myers', status: 'active', role: 'owner' },
      jeremy: { displayName: 'Jeremy', status: 'active', role: 'owner' },
      admin: { displayName: 'An Admin', status: 'active', role: 'admin' },
    },
    sales: {
      craig: {
        salesRepId: 'cooper',
        salesRepName: 'Cooper Smith',
        customerName: 'Craig Thompson',
        customerAddress: '12 Oak St',
        status: 'approved',
        saleDate: noon('2026-07-20'),
        installDate: noon('2026-08-01'),
        totalValue: 120,
        products: [],
      },
      orphan: {
        salesRepId: 'gone',
        salesRepName: 'Gone Rep',
        customerName: 'Olive Park',
        customerAddress: '40 Pine Ave',
        status: 'approved',
        saleDate: noon('2026-09-01'),
        installDate: noon('2026-09-20'),
        totalValue: 90,
        products: [],
      },
      fine: {
        salesRepId: 'cooper',
        salesRepName: 'Cooper Smith',
        customerName: 'Dana Lee',
        customerAddress: '7 Elm Rd',
        status: 'approved',
        saleDate: noon('2026-09-25'),
        installDate: noon('2026-10-14'),
        totalValue: 90,
        products: [],
      },
    },
    fiberOrders: {
      'o-craig': order('o-craig', '12 OAK ST'),
      'o-orphan': order('o-orphan', '40 PINE AVE', { matchedUserId: 'gone', orderDate: '2026-09-01', estInstallDate: '2026-09-20' }),
      'o-fine': order('o-fine', '7 ELM RD', { estInstallDate: '2026-10-14' }),
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.INSTALL_OVERDUE_ALERTS_OFF;
});

describe('runOverdueInstallAlerts', () => {
  it('tells the active rep about each overdue sale and the owners once, with no money', async () => {
    const { db, store } = fakeDb(seed());
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const result = await runOverdueInstallAlerts({ db, now: morning('2026-10-09'), dispatch });

    expect(result.counts).toEqual({
      dryRun: false,
      overdue: 2,
      repAlertsDue: 1,
      repAlertsSent: 1,
      alreadySent: 0,
      skippedInactiveRep: 1,
      ownerSummary: 'sent',
      errors: 0,
    });
    expect(dispatch).toHaveBeenCalledTimes(3);
    expect(dispatch).toHaveBeenCalledWith({
      userId: 'cooper',
      type: 'install_overdue',
      title: 'Install overdue',
      message: 'Craig T. was due Aug 1 (69 days). Check with the customer or reschedule.',
      link: '/portal/sales/craig',
      metadata: { saleId: 'craig', daysOverdue: 69, alertCount: 1 },
    });
    for (const owner of ['jacob', 'jeremy']) {
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: owner,
          type: 'install_overdue_summary',
          title: 'Installs overdue',
          message: '2 overdue. Oldest: Craig T. (Cooper, 69 days)',
          link: '/portal/dashboard',
        })
      );
    }
    expect(JSON.stringify(dispatch.mock.calls)).not.toMatch(/\$|120|totalValue/);
    expect(store.get('installOverdueAlerts')!.get('craig')).toMatchObject({
      dueDay: '2026-08-01',
      lastAlertDay: '2026-10-09',
      count: 1,
    });
    expect(store.get('installOverdueDigests')!.has('2026-10-09')).toBe(true);
    // The sale itself is never written.
    expect(Object.keys(store.get('sales')!.get('craig')!)).not.toContain('lastOverdueAlertAt');
  });

  it('sends nothing more when the report is delivered again the same day', async () => {
    const { db } = fakeDb(seed());
    const dispatch = vi.fn().mockResolvedValue(undefined);
    await runOverdueInstallAlerts({ db, now: morning('2026-10-09'), dispatch });
    dispatch.mockClear();

    const again = await runOverdueInstallAlerts({ db, now: new Date('2026-10-09T20:00:00Z'), dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(again.counts).toMatchObject({ repAlertsSent: 0, alreadySent: 1, ownerSummary: 'already_sent', errors: 0 });
  });

  it('sends exactly once when two deliveries run at the same moment', async () => {
    const { db } = fakeDb(seed());
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const now = morning('2026-10-09');
    await Promise.all([
      runOverdueInstallAlerts({ db, now, dispatch }),
      runOverdueInstallAlerts({ db, now, dispatch }),
    ]);
    const byType = (type: string) => dispatch.mock.calls.filter(([input]) => input.type === type).length;
    expect(byType('install_overdue')).toBe(1);
    expect(byType('install_overdue_summary')).toBe(2); // one per owner, once
  });

  it('tells the owners daily but the rep only weekly', async () => {
    const { db } = fakeDb(seed());
    const dispatch = vi.fn().mockResolvedValue(undefined);
    await runOverdueInstallAlerts({ db, now: morning('2026-10-09'), dispatch });
    dispatch.mockClear();

    await runOverdueInstallAlerts({ db, now: morning('2026-10-15'), dispatch }); // 6 days on
    expect(dispatch.mock.calls.map(([input]) => input.type)).toEqual(['install_overdue_summary', 'install_overdue_summary']);
    dispatch.mockClear();

    await runOverdueInstallAlerts({ db, now: morning('2026-10-16'), dispatch }); // 7 days on
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'cooper',
        message: 'Craig T. was due Aug 1 (76 days). Check with the customer or reschedule.',
        metadata: { saleId: 'craig', daysOverdue: 76, alertCount: 2 },
      })
    );
  });

  it('stops once the carrier installs it, and tells the owners nothing when nothing is overdue', async () => {
    const data = seed();
    data.fiberOrders['o-craig'] = order('o-craig', '12 OAK ST', { status: 'active', activationDate: '2026-10-08' });
    data.fiberOrders['o-orphan'] = order('o-orphan', '40 PINE AVE', { matchedUserId: 'gone', orderDate: '2026-09-01', status: 'cancelled' });
    const { db, writes } = fakeDb(data);
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const result = await runOverdueInstallAlerts({ db, now: morning('2026-10-09'), dispatch });
    expect(result.counts).toMatchObject({ overdue: 0, ownerSummary: 'none' });
    expect(dispatch).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
  });

  it('a claim that fails sends nothing for that sale and is counted', async () => {
    const { db } = fakeDb(seed());
    const failing = Object.create(db) as FirebaseFirestore.Firestore;
    (failing as unknown as { runTransaction: () => Promise<never> }).runTransaction = () =>
      Promise.reject(new Error('contention'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const dispatch = vi.fn().mockResolvedValue(undefined);
    const result = await runOverdueInstallAlerts({ db: failing, now: morning('2026-10-09'), dispatch });
    expect(dispatch.mock.calls.every(([input]) => input.type === 'install_overdue_summary')).toBe(true);
    expect(result.counts).toMatchObject({ repAlertsSent: 0, errors: 1, ownerSummary: 'sent' });
  });

  it('dry run (INSTALL_OVERDUE_ALERTS_OFF) plans the same alerts and writes and sends nothing', async () => {
    process.env.INSTALL_OVERDUE_ALERTS_OFF = 'true';
    const { db, writes } = fakeDb(seed());
    const dispatch = vi.fn();
    const result = await runOverdueInstallAlerts({ db, now: morning('2026-10-09'), dispatch });
    expect(dispatch).not.toHaveBeenCalled();
    expect(defaultDispatch).not.toHaveBeenCalled();
    expect(writes).toEqual([]);
    expect(result.counts).toMatchObject({ dryRun: true, repAlertsDue: 1, repAlertsSent: 0, ownerSummary: 'dry_run' });
    expect(result.repAlerts.map((alert) => [alert.repName, alert.customer, alert.daysOverdue])).toEqual([
      ['Cooper Smith', 'Craig T.', 69],
    ]);
    expect(result.ownerAlert?.message).toBe('2 overdue. Oldest: Craig T. (Cooper, 69 days)');
  });
});
