import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// The order-number guard on create: a rep backfilling sales logged one T-Fiber
// order three times, each submit under its own idempotency key. The order
// number is what makes them one sale.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
  requireVerifiedRequester: vi.fn(),
}));

type Doc = { id: string; data: Record<string, unknown> };

const state: {
  docs: Doc[];
  added: Array<Record<string, unknown>>;
  queries: Array<{ field: string; op: string; value: unknown }>;
} = { docs: [], added: [], queries: [] };

function matches(doc: Doc, field: string, op: string, value: unknown) {
  const stored = doc.data[field];
  if (op === '==') return stored === value;
  if (op === 'in') return Array.isArray(value) && value.includes(stored);
  throw new Error(`unexpected op ${op}`);
}

vi.mock('@/lib/firebase/admin', () => ({
  initError: null,
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'sales') {
        return {
          where: vi.fn((field: string, op: string, value: unknown) => {
            state.queries.push({ field, op, value });
            const hits = state.docs.filter((doc) => matches(doc, field, op, value));
            return {
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
                  size: hits.length,
                  empty: hits.length === 0,
                  forEach: (fn: (d: { id: string; data: () => Record<string, unknown> }) => void) =>
                    hits.forEach((doc) => fn({ id: doc.id, data: () => doc.data })),
                })),
              })),
            };
          }),
          add: vi.fn(async (doc: Record<string, unknown>) => {
            state.added.push(doc);
            return { id: 'new-sale' };
          }),
        };
      }
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({ get: vi.fn(async () => ({ data: () => ({ reportsToId: 'm1' }) })) })),
        };
      }
      return { add: vi.fn(async () => ({ id: 'n1' })) };
    }),
  },
}));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;

function post(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/sales', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const stamp = (date: Date) => ({ toDate: () => date });

const baseBody = {
  customerAddress: '1 Main St, Springfield, MO 65801',
  customerName: 'Maria Lopez',
  productSold: 'TFiber 300',
  orderNumberOrBtn: 'ord-1001',
  products: [{ productId: 'tfiber-300', productName: 'TFiber 300 (300 Mbps)', quantity: 1, unitPrice: 45, totalPrice: 45, points: 3 }],
};

function existing(id: string, data: Record<string, unknown>) {
  state.docs.push({
    id,
    data: {
      salesRepId: 'r2',
      salesRepName: 'Dana Whitfield',
      customerName: 'Maria Lopez',
      status: 'approved',
      saleDate: stamp(new Date(2026, 8, 14, 12)),
      createdAt: stamp(new Date(2026, 8, 14, 13)),
      ...data,
    },
  });
}

beforeEach(() => {
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Wil Teasdale', email: 'w@x.com', isAdmin: false });
  state.docs = [];
  state.added = [];
  state.queries = [];
});

describe('POST /api/portal/sales order-number duplicate guard', () => {
  it('answers 409 and writes nothing when a live sale has the same order number', async () => {
    existing('s-old', { orderNumberOrBtn: 'ORD 1001', orderNumberKey: 'ORD1001' });

    const response = await POST(post(baseBody));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body).toMatchObject({
      duplicateOrder: true,
      existingRepName: 'Dana W.',
      existingCustomerFirstName: null,
      existingIsMine: false,
      // Another rep's sale is named, never linked, and its customer stays private.
      existingSaleId: null,
    });
    expect(body.existingSaleDate).toBe(new Date(2026, 8, 14, 12).toISOString());
    expect(state.added).toHaveLength(0);
  });

  it("links the existing sale when it is the rep's own", async () => {
    existing('s-mine', { salesRepId: 'r1', salesRepName: 'Wil Teasdale', orderNumberKey: 'ORD1001', orderNumberOrBtn: 'ORD1001' });

    const response = await POST(post(baseBody));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ existingSaleId: 's-mine', existingIsMine: true, existingRepName: 'Wil T.' });
  });

  it('links the existing sale for an admin', async () => {
    mockUser.mockResolvedValue({ ok: true, uid: 'a1', name: 'Jacob Myers', email: 'j@x.com', isAdmin: true });
    existing('s-old', { orderNumberKey: 'ORD1001', orderNumberOrBtn: 'ORD1001' });

    const response = await POST(post(baseBody));

    expect((await response.json()).existingSaleId).toBe('s-old');
  });

  it('finds an older sale that predates orderNumberKey by its raw order number', async () => {
    existing('s-legacy', { orderNumberOrBtn: 'ORD-1001' });

    const response = await POST(post({ ...baseBody, orderNumberOrBtn: ' ord-1001 ' }));

    expect(response.status).toBe(409);
    expect(state.added).toHaveLength(0);
    // Single-field queries only: no composite index needed.
    expect(state.queries.map((q) => q.field).sort()).toEqual(['orderNumberKey', 'orderNumberOrBtn']);
  });

  it('creates the sale when the rep logs it anyway (allowDuplicate)', async () => {
    existing('s-old', { orderNumberKey: 'ORD1001', orderNumberOrBtn: 'ORD1001' });

    const response = await POST(post({ ...baseBody, allowDuplicate: true }));

    expect(response.status).toBe(200);
    expect(state.added).toHaveLength(1);
    expect(state.queries).toHaveLength(0);
  });

  it('creates the sale and skips the check when there is no order number', async () => {
    existing('s-blank', { orderNumberKey: '', orderNumberOrBtn: '' });
    const SHOT = 'form-attachments/r1/sale-proof/abcdef0123456789abcdef0123456789_a1b2c3/';

    const response = await POST(post({ ...baseBody, orderNumberOrBtn: '', proofScreenshotPaths: [SHOT] }));

    expect(response.status).toBe(200);
    expect(state.added).toHaveLength(1);
    expect(state.queries).toHaveLength(0);
  });

  it('creates the sale when the only match was cancelled', async () => {
    existing('s-cancelled', { orderNumberKey: 'ORD1001', orderNumberOrBtn: 'ORD1001', status: 'cancelled' });

    const response = await POST(post(baseBody));

    expect(response.status).toBe(200);
    expect(state.added).toHaveLength(1);
  });

  it('creates the sale when the only match was rejected', async () => {
    existing('s-rejected', { orderNumberKey: 'ORD1001', orderNumberOrBtn: 'ORD1001', status: 'rejected' });

    const response = await POST(post(baseBody));

    expect(response.status).toBe(200);
    expect(state.added).toHaveLength(1);
  });

  it('stores the normalized key on the new sale', async () => {
    const response = await POST(post({ ...baseBody, orderNumberOrBtn: ' ord - 1001 ' }));

    expect(response.status).toBe(200);
    expect(state.added[0].orderNumberKey).toBe('ORD1001');
  });
});
