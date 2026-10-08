import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Sale drafts from 3C Doors: idempotent per (rep, clientId), never reopened
// once finished or dismissed, and only ever the caller's own.

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
}));

// An in-memory saleDrafts collection: enough of the Admin SDK for these routes.
const store = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const queries = vi.hoisted(() => ({ wheres: [] as Array<[string, string, unknown]>, orderBy: [] as string[] }));

vi.mock('@/lib/firebase/admin', () => {
  type Ref = { id: string };
  const snap = (ref: Ref) => {
    const data = store.get(ref.id);
    return { id: ref.id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  };
  const query = (filters: Array<[string, unknown]>, order?: string, cap?: number) => ({
    where: (field: string, op: string, value: unknown) => {
      queries.wheres.push([field, op, value]);
      return query([...filters, [field, value]], order, cap);
    },
    orderBy: (field: string, dir: string) => {
      queries.orderBy.push(`${field} ${dir}`);
      return query(filters, field, cap);
    },
    limit: (n: number) => query(filters, order, n),
    get: async () => {
      let docs = [...store.entries()]
        .filter(([, data]) => filters.every(([field, value]) => data[field] === value))
        .map(([id, data]) => ({ id, data: () => ({ ...data }) }));
      if (order) {
        docs = docs.sort(
          (a, b) => (b.data()[order] as Date).getTime() - (a.data()[order] as Date).getTime()
        );
      }
      return { docs: docs.slice(0, cap ?? docs.length) };
    },
  });
  return {
    initError: null,
    adminDb: {
      collection: (name: string) => {
        if (name !== 'saleDrafts') throw new Error(`unexpected collection ${name}`);
        return { doc: (id: string) => ({ id }), ...query([]) };
      },
      runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          get: async (ref: Ref) => snap(ref),
          create: (ref: Ref, data: Record<string, unknown>) => {
            if (store.has(ref.id)) throw Object.assign(new Error('exists'), { code: 6 });
            store.set(ref.id, data);
          },
          update: (ref: Ref, data: Record<string, unknown>) => {
            store.set(ref.id, { ...store.get(ref.id), ...data });
          },
        }),
    },
  };
});

import { GET, POST } from './route';
import { DELETE } from './[id]/route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = vi.mocked(requireVerifiedUser);

const URL_BASE = 'http://localhost/api/portal/sales/drafts';
const post = (body: unknown) =>
  POST(new NextRequest(URL_BASE, { method: 'POST', body: JSON.stringify(body) }));
const list = () => GET(new NextRequest(URL_BASE));
const remove = (id: string) =>
  DELETE(new NextRequest(`${URL_BASE}/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) });

const asRep = (uid = 'r1') =>
  mockUser.mockResolvedValue({ ok: true, uid, name: 'Wil Teasdale', email: 'w@x.com', isOwner: false });

const soldAt = Date.now() - 60 * 60 * 1000;
const sold = { clientId: 'sold-1', address: '1 Main St, Springfield, MO', soldAt, source: 'knock', houseId: 'h1' };

beforeEach(() => {
  mockUser.mockReset();
  asRep();
  store.clear();
  queries.wheres = [];
  queries.orderBy = [];
});

describe('POST /api/portal/sales/drafts', () => {
  it('creates an open draft stamped with the caller', async () => {
    const res = await post(sold);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'r1_sold-1' });
    expect(store.get('r1_sold-1')).toMatchObject({
      salesRepId: 'r1',
      salesRepName: 'Wil Teasdale',
      clientId: 'sold-1',
      address: '1 Main St, Springfield, MO',
      soldAt: new Date(soldAt),
      customerName: null,
      planId: null,
      houseId: 'h1',
      source: 'knock',
      status: 'open',
      saleId: null,
    });
  });

  it('is idempotent: a repeat updates the same draft and keeps what it does not send', async () => {
    await post(sold);
    const createdAt = store.get('r1_sold-1')?.createdAt;
    const res = await post({ ...sold, customerName: 'Jane Doe', planId: 'tfiber-1gig' });
    expect(await res.json()).toEqual({ id: 'r1_sold-1' });
    expect(store.size).toBe(1);
    expect(store.get('r1_sold-1')).toMatchObject({
      customerName: 'Jane Doe',
      planId: 'tfiber-1gig',
      houseId: 'h1',
      status: 'open',
      createdAt,
    });

    await post(sold);
    expect(store.get('r1_sold-1')).toMatchObject({ customerName: 'Jane Doe', planId: 'tfiber-1gig' });

    await post({ ...sold, customerName: null, planId: null });
    expect(store.get('r1_sold-1')).toMatchObject({ customerName: null, planId: null });
  });

  it('keys the draft per rep, so two reps with the same clientId never share one', async () => {
    await post(sold);
    asRep('r2');
    expect(await (await post(sold)).json()).toEqual({ id: 'r2_sold-1' });
    expect(store.size).toBe(2);
  });

  it('never reopens a draft that was logged or dismissed', async () => {
    await post(sold);
    store.set('r1_sold-1', { ...store.get('r1_sold-1'), status: 'submitted', saleId: 's1' });
    const res = await post({ ...sold, customerName: 'Late Name' });
    expect(res.status).toBe(200);
    expect(store.get('r1_sold-1')).toMatchObject({ status: 'submitted', customerName: null });
  });

  it('rejects an invalid body with 400 and writes nothing', async () => {
    const res = await post({ ...sold, planId: 'not-a-plan' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Unknown planId' });
    expect(store.size).toBe(0);
  });

  it('passes the account gate through (pending hires are refused like sales)', async () => {
    mockUser.mockResolvedValue({ ok: false, error: 'Account is pending approval', status: 403 });
    const res = await post(sold);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Account is pending approval' });
    expect(store.size).toBe(0);
  });
});

describe('GET /api/portal/sales/drafts', () => {
  it("lists only the caller's open drafts, newest sale first", async () => {
    await post(sold);
    await post({ ...sold, clientId: 'sold-2', address: '2 Oak Ave', soldAt: soldAt + 1000 });
    await post({ ...sold, clientId: 'sold-3', address: '3 Elm Rd' });
    store.set('r1_sold-3', { ...store.get('r1_sold-3'), status: 'dismissed' });
    asRep('r2');
    await post({ ...sold, clientId: 'other', address: '9 Other St' });
    asRep('r1');

    const res = await list();
    const { drafts } = await res.json();
    expect(drafts.map((d: { address: string }) => d.address)).toEqual(['2 Oak Ave', '1 Main St, Springfield, MO']);
    expect(drafts[1]).toMatchObject({ id: 'r1_sold-1', clientId: 'sold-1', soldAt, status: 'open', houseId: 'h1' });
    expect(queries.wheres).toEqual([
      ['salesRepId', '==', 'r1'],
      ['status', '==', 'open'],
    ]);
    expect(queries.orderBy).toEqual(['soldAt desc']);
  });

  it('refuses an unauthenticated caller', async () => {
    mockUser.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await list()).status).toBe(401);
  });
});

describe('DELETE /api/portal/sales/drafts/[id]', () => {
  it('dismisses the draft (a tombstone, gone from the list) and is safe to repeat', async () => {
    await post(sold);
    const res = await remove('r1_sold-1');
    expect(res.status).toBe(200);
    expect(store.get('r1_sold-1')).toMatchObject({ status: 'dismissed' });
    expect((await list().then((r) => r.json())).drafts).toEqual([]);
    expect((await remove('r1_sold-1')).status).toBe(200);
    // The app's queue repeating the Sold afterwards does not bring it back.
    await post(sold);
    expect(store.get('r1_sold-1')).toMatchObject({ status: 'dismissed' });
  });

  it("reads someone else's draft as missing", async () => {
    await post(sold);
    asRep('r2');
    expect((await remove('r1_sold-1')).status).toBe(404);
    expect(store.get('r1_sold-1')).toMatchObject({ status: 'open' });
  });

  it('404s an unknown or malformed id and 409s a logged one', async () => {
    expect((await remove('nope')).status).toBe(404);
    expect((await remove('a.b')).status).toBe(404);
    await post(sold);
    store.set('r1_sold-1', { ...store.get('r1_sold-1'), status: 'submitted' });
    expect((await remove('r1_sold-1')).status).toBe(409);
  });
});
