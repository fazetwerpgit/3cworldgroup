import { beforeEach, describe, expect, it, vi } from 'vitest';

const { defaultDispatch } = vi.hoisted(() => ({ defaultDispatch: vi.fn() }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: defaultDispatch }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: null }));

import { isCalloutNudgeHour, loadDaySales, repCalloutDay, runCalloutNudges } from './calloutNudges';

type Data = Record<string, unknown>;
type Filter = (data: Data) => boolean;

/** An in-memory Firestore keyed by path: subcollections, ==/>=/< filters, select, create. */
function fakeDb(seed: Record<string, Record<string, Data>>) {
  const store = new Map<string, Map<string, Data>>();
  for (const [path, docs] of Object.entries(seed)) store.set(path, new Map(Object.entries(docs)));
  const table = (path: string) => {
    if (!store.has(path)) store.set(path, new Map());
    return store.get(path)!;
  };
  const creates: Array<{ path: string; id: string; data: Data }> = [];
  const snap = (path: string, id: string) => {
    const data = table(path).get(id);
    return { id, exists: data !== undefined, data: () => data, get: (field: string) => data?.[field] };
  };
  const compare = (a: unknown, b: unknown) => {
    const value = (x: unknown) => (x instanceof Date ? x.getTime() : (x as number));
    return value(a) - value(b);
  };
  // select() projects like Firestore: a field it leaves out is not on the doc.
  const project = (data: Data, fields: string[] | null) =>
    fields ? Object.fromEntries(fields.filter((f) => f in data).map((f) => [f, data[f]])) : data;
  const query = (path: string, filters: Filter[], fields: string[] | null = null): Record<string, unknown> => ({
    where: (field: string, op: string, value: unknown) => {
      const test: Filter =
        op === '=='
          ? (data) => data[field] === value
          : op === '>='
            ? (data) => data[field] !== undefined && compare(data[field], value) >= 0
            : op === '<'
              ? (data) => data[field] !== undefined && compare(data[field], value) < 0
              : () => {
                  throw new Error(`fakeDb: unsupported op ${op}`);
                };
      return query(path, [...filters, test], fields);
    },
    select: (...picked: string[]) => query(path, filters, picked),
    get: async () => ({
      docs: [...table(path).keys()]
        .filter((id) => filters.every((f) => f(table(path).get(id)!)))
        .map((id) => {
          const data = project(table(path).get(id)!, fields);
          return { id, exists: true, data: () => data, get: (field: string) => data[field] };
        }),
    }),
  });
  const collection = (path: string) => ({
    ...query(path, []),
    doc: (id: string) => ({
      id,
      get: async () => snap(path, id),
      collection: (sub: string) => collection(`${path}/${id}/${sub}`),
      create: async (data: Data) => {
        if (table(path).has(id)) throw Object.assign(new Error('exists'), { code: 6 });
        table(path).set(id, data);
        creates.push({ path, id, data });
      },
    }),
  });
  return { db: { collection } as unknown as FirebaseFirestore.Firestore, creates };
}

/** A Chicago wall-clock time in October (CDT, UTC-5). */
const chicago = (day: string, time: string) => new Date(`${day}T${time}:00-05:00`);
/** How sale dates are stored: noon on the server (UTC on Vercel). */
const saleNoon = (day: string) => new Date(`${day}T12:00:00Z`);
/** 9 PM Friday Oct 9 in Chicago: the 02:00 UTC run. */
const NINE_PM = chicago('2026-10-09', '21:00');

const msg = (authorId: string, authorName: string, text: string, createdAt: Date, over: Data = {}): Data => ({
  channelId: 'all-company',
  authorId,
  authorName,
  authorRole: 'field',
  text,
  createdAt,
  ...over,
});

function seed() {
  return {
    users: {
      miles: { displayName: 'Miles Rivera', status: 'active' },
      mason: { displayName: 'Mason Smith', status: 'active' },
      noah: { displayName: 'Noah Kent', status: 'active' },
      gone: { displayName: 'Gone Rep', status: 'inactive' },
    },
    'chatChannels/all-company/messages': {
      m1: msg('miles', 'Miles Rivera', '1 gig', chicago('2026-10-09', '14:05')),
      m2: msg('miles', 'Miles Rivera', '1gig', chicago('2026-10-09', '15:10')),
      m3: msg('miles', 'Miles Rivera', '2 gig', chicago('2026-10-09', '16:20')),
      m4: msg('miles', 'Miles Rivera', '2 gig', chicago('2026-10-09', '17:45')),
      // Mason called out one and logged it: nothing to tell.
      m5: msg('mason', 'Mason Smith', '500 mb', chicago('2026-10-09', '12:00')),
      // Noah's callout was deleted.
      m6: msg('noah', 'Noah Kent', '1 gig', chicago('2026-10-09', '13:00'), { deletedAt: chicago('2026-10-09', '13:01') }),
      // Yesterday's does not count today.
      m7: msg('noah', 'Noah Kent', '2 gig', chicago('2026-10-08', '13:00')),
      m8: msg('gone', 'Gone Rep', '1 gig', chicago('2026-10-09', '13:00')),
    },
    sales: {
      s1: { salesRepId: 'mason', saleDate: saleNoon('2026-10-09'), createdAt: chicago('2026-10-09', '12:30') },
      s2: { salesRepId: 'miles', saleDate: saleNoon('2026-10-09'), createdAt: chicago('2026-10-09', '19:00') },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CALLOUT_NUDGE_OFF;
});

describe('runCalloutNudges', () => {
  it('never nudges a demo account, as if it were not active', async () => {
    const data = seed();
    (data.users as Record<string, Data>).demo = { displayName: 'App Review', status: 'active', demoAccount: true };
    (data['chatChannels/all-company/messages'] as Record<string, Data>).m9 = msg('demo', 'App Review', '1 gig', chicago('2026-10-09', '13:30'));
    const { db } = fakeDb(data);
    const dispatch = vi.fn(async () => {});

    const summary = await runCalloutNudges({ db, now: NINE_PM, dispatch });

    expect(summary).toMatchObject({ short: 3, skippedInactiveRep: 2, sent: 1 });
    expect(dispatch.mock.calls.map((call) => (call as unknown as [{ userId: string }])[0].userId)).toEqual(['miles']);
  });

  it('pushes each active rep still short today once, with the counts', async () => {
    const { db, creates } = fakeDb(seed());
    const dispatch = vi.fn(async () => {});

    const summary = await runCalloutNudges({ db, now: NINE_PM, dispatch });

    expect(summary).toMatchObject({ day: '2026-10-09', dryRun: false, short: 2, skippedInactiveRep: 1, sent: 1, alreadySent: 0, errors: 0 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      userId: 'miles',
      type: 'unlogged_callouts',
      title: "Log today's sales?",
      message:
        'You called out 4 sales today and logged 1. Logging puts them on the board, in your pay estimate and on install reminders.',
      link: '/portal/sales/new/bulk',
      metadata: { day: '2026-10-09', callouts: 4, logged: 1 },
    });
    expect(creates).toEqual([
      { path: 'calloutNudges', id: 'miles_2026-10-09', data: expect.objectContaining({ repId: 'miles', day: '2026-10-09' }) },
    ]);
  });

  it('sends once however many times it runs that day', async () => {
    const { db } = fakeDb(seed());
    const dispatch = vi.fn(async () => {});

    await runCalloutNudges({ db, now: NINE_PM, dispatch });
    const again = await runCalloutNudges({ db, now: chicago('2026-10-09', '21:40'), dispatch });

    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(again).toMatchObject({ sent: 0, alreadySent: 1 });
  });

  it('sends nothing to a rep who logged them all', async () => {
    const data = seed();
    Object.assign(data.sales, {
      s3: { salesRepId: 'miles', saleDate: saleNoon('2026-10-09') },
      s4: { salesRepId: 'miles', saleDate: saleNoon('2026-10-09') },
      s5: { salesRepId: 'miles', saleDate: saleNoon('2026-10-09') },
    });
    const { db, creates } = fakeDb(data);
    const dispatch = vi.fn(async () => {});

    const summary = await runCalloutNudges({ db, now: NINE_PM, dispatch });

    expect(summary.short).toBe(1); // only the inactive rep
    expect(dispatch).not.toHaveBeenCalled();
    expect(creates).toEqual([]);
  });

  it('is a dry run with CALLOUT_NUDGE_OFF=true: plans, claims nothing, sends nothing', async () => {
    process.env.CALLOUT_NUDGE_OFF = 'true';
    const { db, creates } = fakeDb(seed());
    const dispatch = vi.fn(async () => {});

    const summary = await runCalloutNudges({ db, now: NINE_PM, dispatch });

    expect(summary.dryRun).toBe(true);
    expect(summary.pushes.map((push) => push.repId)).toEqual(['miles']);
    expect(dispatch).not.toHaveBeenCalled();
    expect(creates).toEqual([]);
  });

  it('sends nothing when the claim fails', async () => {
    const { db } = fakeDb(seed());
    const failing = {
      collection: (name: string) => {
        const real = (db as unknown as { collection: (n: string) => Record<string, unknown> }).collection(name);
        if (name !== 'calloutNudges') return real;
        return { ...real, doc: () => ({ create: async () => Promise.reject(new Error('unavailable')) }) };
      },
    } as unknown as FirebaseFirestore.Firestore;
    const dispatch = vi.fn(async () => {});

    const summary = await runCalloutNudges({ db: failing, now: NINE_PM, dispatch });

    expect(dispatch).not.toHaveBeenCalled();
    expect(summary.errors).toBe(1);
  });
});

describe('repCalloutDay', () => {
  it("counts only the caller's own callouts and sales for today", async () => {
    const { db } = fakeDb(seed());
    expect(await repCalloutDay(db, 'miles', chicago('2026-10-09', '18:00'))).toEqual({
      repId: 'miles',
      repName: 'Miles Rivera',
      day: '2026-10-09',
      callouts: 4,
      logged: 1,
      gap: 3,
    });
    expect(await repCalloutDay(db, 'noah', chicago('2026-10-09', '18:00'))).toMatchObject({ callouts: 0, gap: 0 });
  });

  it('starts fresh after Chicago midnight', async () => {
    const { db } = fakeDb(seed());
    expect(await repCalloutDay(db, 'miles', chicago('2026-10-10', '00:05'))).toMatchObject({
      day: '2026-10-10',
      callouts: 0,
      gap: 0,
    });
  });
});

describe('loadDaySales — demo accounts', () => {
  it("drops a demo account's sale (the select carries the stamp, so the filter sees it)", async () => {
    const data = seed();
    (data.sales as Record<string, Data>).s3 = {
      salesRepId: 'demo',
      saleDate: saleNoon('2026-10-09'),
      createdAt: chicago('2026-10-09', '13:00'),
      demoAccount: true,
    };
    const { db } = fakeDb(data);

    const sales = await loadDaySales(db, '2026-10-09');

    expect(sales.map((sale) => sale.salesRepId).sort()).toEqual(['mason', 'miles']);
  });
});

describe('isCalloutNudgeHour', () => {
  it('is 9 PM Chicago in summer and winter time', () => {
    expect(isCalloutNudgeHour(new Date('2026-10-10T02:00:00Z'))).toBe(true); // CDT
    expect(isCalloutNudgeHour(new Date('2026-10-10T03:00:00Z'))).toBe(false);
    expect(isCalloutNudgeHour(new Date('2026-12-10T03:00:00Z'))).toBe(true); // CST
    expect(isCalloutNudgeHour(new Date('2026-12-10T02:00:00Z'))).toBe(false);
  });
});
