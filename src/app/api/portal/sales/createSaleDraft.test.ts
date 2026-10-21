import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// A sale finished from a 3C Doors draft (draftId) closes that draft — only the
// caller's own, only while open — and a failure to close never fails the sale.

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
  requireVerifiedRequester: vi.fn(),
}));

const drafts = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const state = vi.hoisted(() => ({ added: [] as Array<Record<string, unknown>>, txFails: false }));

vi.mock('@/lib/firebase/admin', () => ({
  initError: null,
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'sales') {
        return {
          add: vi.fn(async (doc: Record<string, unknown>) => {
            state.added.push(doc);
            return { id: 'sale1' };
          }),
        };
      }
      if (name === 'saleDrafts') return { doc: (id: string) => ({ id }) };
      if (name === 'users') {
        return { doc: vi.fn(() => ({ get: vi.fn(async () => ({ data: () => ({}) })) })) };
      }
      return { add: vi.fn(async () => ({ id: 'n1' })) };
    }),
    runTransaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => {
      if (state.txFails) throw new Error('unavailable');
      return fn({
        get: async (ref: { id: string }) => ({ data: () => drafts.get(ref.id) }),
        update: (ref: { id: string }, data: Record<string, unknown>) => {
          drafts.set(ref.id, { ...drafts.get(ref.id), ...data });
        },
      });
    }),
  },
}));

import { POST } from './route';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const mockUser = vi.mocked(requireVerifiedUser);

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest('http://localhost/api/portal/sales', { method: 'POST', body: JSON.stringify(body) }));

const sale = {
  customerAddress: '1 Main St, Springfield, MO 65801',
  productSold: 'TFiber 300',
  orderNumberOrBtn: 'ORD-1001',
  products: [{ productId: 'tfiber-300', productName: 'TFiber 300', quantity: 1, unitPrice: 45, totalPrice: 45, points: 3 }],
};

beforeEach(() => {
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Wil Teasdale', email: 'w@x.com', isOwner: false, isAdmin: false, demoAccount: false, aiConsent: { deepseek: false, gemini: false, gemini_voice: false }, solarRole: null });
  drafts.clear();
  drafts.set('r1_sold-1', { salesRepId: 'r1', status: 'open', saleId: null });
  drafts.set('r2_sold-1', { salesRepId: 'r2', status: 'open', saleId: null });
  state.added = [];
  state.txFails = false;
});

describe('POST /api/portal/sales with draftId', () => {
  it("closes the caller's open draft with the new sale's id", async () => {
    const res = await post({ ...sale, draftId: 'r1_sold-1' });
    expect(res.status).toBe(200);
    expect(drafts.get('r1_sold-1')).toMatchObject({ status: 'submitted', saleId: 'sale1' });
    // draftId is not a sale field.
    expect(state.added[0]).not.toHaveProperty('draftId');
  });

  it("leaves someone else's draft alone, and the sale still logs", async () => {
    const res = await post({ ...sale, draftId: 'r2_sold-1' });
    expect(res.status).toBe(200);
    expect(drafts.get('r2_sold-1')).toMatchObject({ status: 'open', saleId: null });
  });

  it('does not touch a draft that is no longer open', async () => {
    drafts.set('r1_sold-1', { salesRepId: 'r1', status: 'dismissed', saleId: null });
    await post({ ...sale, draftId: 'r1_sold-1' });
    expect(drafts.get('r1_sold-1')).toMatchObject({ status: 'dismissed', saleId: null });
  });

  it('rejects a malformed draftId before writing the sale', async () => {
    const res = await post({ ...sale, draftId: '../sales/x' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid draftId' });
    expect(state.added).toHaveLength(0);
  });

  it('still reports the sale as logged when closing the draft fails', async () => {
    state.txFails = true;
    const res = await post({ ...sale, draftId: 'r1_sold-1' });
    expect(res.status).toBe(200);
    expect(state.added).toHaveLength(1);
  });
});
