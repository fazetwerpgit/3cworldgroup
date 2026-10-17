import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// A demo account's sales are stamped `demoAccount: true` on create, so every
// cross-user view can drop them; and the order-number guard never names a
// demo account to a real rep, nor a real rep to the demo account.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
  requireVerifiedRequester: vi.fn(),
}));

type Doc = { id: string; data: Record<string, unknown> };

const state: { docs: Doc[]; added: Array<Record<string, unknown>>; user: Record<string, unknown> } = {
  docs: [],
  added: [],
  user: {},
};

vi.mock('@/lib/firebase/admin', () => ({
  initError: null,
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'sales') {
        return {
          where: vi.fn((field: string, op: string, value: unknown) => {
            const hits = state.docs.filter((doc) =>
              op === 'in' ? Array.isArray(value) && value.includes(doc.data[field]) : doc.data[field] === value
            );
            return {
              limit: vi.fn(() => ({
                get: vi.fn(async () => ({
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
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ data: () => state.user })) })) };
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

const baseBody = {
  customerAddress: '1 Main St, Springfield, MO 65801',
  customerName: 'Maria Lopez',
  productSold: 'TFiber 300',
  orderNumberOrBtn: 'ORD1001',
  products: [{ productId: 'tfiber-300', productName: 'TFiber 300 (300 Mbps)', quantity: 1, unitPrice: 45, totalPrice: 45, points: 3 }],
};

function existing(id: string, data: Record<string, unknown>) {
  state.docs.push({
    id,
    data: { status: 'approved', orderNumberKey: 'ORD1001', orderNumberOrBtn: 'ORD1001', createdAt: new Date(2026, 8, 14), ...data },
  });
}

beforeEach(() => {
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Wil Teasdale', email: 'w@x.com', isAdmin: false });
  state.docs = [];
  state.added = [];
  state.user = { reportsToId: 'm1' };
});

describe('POST /api/portal/sales — demo accounts', () => {
  it('stamps demoAccount: true on a sale logged by a demo account', async () => {
    state.user = { demoAccount: true };
    mockUser.mockResolvedValue({ ok: true, uid: 'demo', name: 'App Review', email: 'r@x.com', isAdmin: false });

    const response = await POST(post(baseBody));

    expect(response.status).toBe(200);
    expect(state.added).toHaveLength(1);
    expect(state.added[0]).toMatchObject({ salesRepId: 'demo', demoAccount: true });
  });

  it('writes no demo stamp for a real rep (nor for a non-boolean flag)', async () => {
    state.user = { reportsToId: 'm1', demoAccount: 'true' };

    await POST(post(baseBody));

    expect(state.added).toHaveLength(1);
    expect(state.added[0]).not.toHaveProperty('demoAccount');
  });

  it("never reports a demo account's sale as a real rep's duplicate", async () => {
    existing('s-demo', { salesRepId: 'demo', salesRepName: 'App Review', demoAccount: true });

    const response = await POST(post(baseBody));

    expect(response.status).toBe(200);
    expect(state.added).toHaveLength(1);
  });

  it("never names a real rep to a demo account, but still catches the demo account's own repeat", async () => {
    state.user = { demoAccount: true };
    mockUser.mockResolvedValue({ ok: true, uid: 'demo', name: 'App Review', email: 'r@x.com', isAdmin: false });
    existing('s-real', { salesRepId: 'r2', salesRepName: 'Dana Whitfield' });

    expect((await POST(post(baseBody))).status).toBe(200);

    existing('s-demo', { salesRepId: 'demo', salesRepName: 'App Review', demoAccount: true });
    const repeat = await POST(post(baseBody));
    expect(repeat.status).toBe(409);
    expect(await repeat.json()).toMatchObject({ existingSaleId: 's-demo', existingIsMine: true });
  });
});
