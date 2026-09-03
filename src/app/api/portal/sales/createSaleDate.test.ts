import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Covers what the new sale form now sends: an explicit sale date. Kept out of
// route.test.ts, which is scoped to the GET date range.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
  requireVerifiedRequester: vi.fn(),
}));

vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn() }));

const state: { added: Array<Record<string, unknown>> } = { added: [] };

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
      if (name === 'users') {
        return {
          doc: vi.fn(() => ({
            get: vi.fn(async () => ({ data: () => ({ reportsToId: 'm1' }) })),
          })),
          // No admin-level users, so the push fan-out stays out of the way.
          where: vi.fn(() => ({ get: vi.fn(async () => ({ docs: [] })) })),
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

function dateInput(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const baseBody = {
  customerAddress: '1 Main St, Springfield, MO 65801',
  productSold: 'Fiber 1 Gig',
  orderNumberOrBtn: 'ORD-1001',
  products: [{ productId: 'p1', productName: 'Fiber 1 Gig', quantity: 1, unitPrice: 70, totalPrice: 70, points: 3 }],
  totalValue: 70,
};

beforeEach(() => {
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Wil Teasdale', email: 'w@x.com' });
  state.added = [];
});

describe('POST /api/portal/sales sale date', () => {
  it('keeps an explicit past sale date instead of stamping today', async () => {
    const response = await POST(post({ ...baseBody, saleDate: '2026-08-12' }));
    expect(response.status).toBe(200);

    const stored = state.added[0].saleDate as Date;
    expect(stored).toBeInstanceOf(Date);
    expect(stored.getFullYear()).toBe(2026);
    expect(stored.getMonth()).toBe(7);
    expect(stored.getDate()).toBe(12);
    // The sale date is the rep's, the created stamp is the upload's — they
    // must be allowed to differ, which is the whole point of the field.
    expect((state.added[0].createdAt as Date).getTime()).toBeGreaterThan(stored.getTime());
  });

  it('still falls back to now when an older client omits the sale date', async () => {
    const before = Date.now();
    const response = await POST(post(baseBody));
    expect(response.status).toBe(200);

    const stored = state.added[0].saleDate as Date;
    expect(stored).toBeInstanceOf(Date);
    expect(stored.getTime()).toBeGreaterThanOrEqual(before);
    expect(stored.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('dates the sale to an install that already happened in a past month', async () => {
    // Jacob's rule: back-entering a sale whose install is in a past month must
    // land in that month, not in the month it was uploaded.
    const lastMonth = new Date();
    lastMonth.setDate(1);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(15);

    const response = await POST(post({ ...baseBody, installDate: dateInput(lastMonth) }));
    expect(response.status).toBe(200);

    const stored = state.added[0].saleDate as Date;
    expect(stored.getFullYear()).toBe(lastMonth.getFullYear());
    expect(stored.getMonth()).toBe(lastMonth.getMonth());
    expect(stored.getDate()).toBe(15);
  });

  it('keeps a future install on today — sold now, installs later', async () => {
    const nextMonth = new Date();
    nextMonth.setDate(1);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    nextMonth.setDate(10);

    const response = await POST(post({ ...baseBody, installDate: dateInput(nextMonth) }));
    expect(response.status).toBe(200);

    const stored = state.added[0].saleDate as Date;
    expect(dateInput(stored)).toBe(dateInput(new Date()));
  });

  it('keeps an install scheduled for today on today', async () => {
    const response = await POST(post({ ...baseBody, installDate: dateInput(new Date()) }));
    expect(response.status).toBe(200);

    const stored = state.added[0].saleDate as Date;
    expect(dateInput(stored)).toBe(dateInput(new Date()));
  });

  it('lets an explicit sale date win over the install-date inference', async () => {
    const lastMonth = new Date();
    lastMonth.setDate(1);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(20);
    const earlier = new Date(lastMonth);
    earlier.setDate(2);

    const response = await POST(
      post({ ...baseBody, saleDate: dateInput(earlier), installDate: dateInput(lastMonth) })
    );
    expect(response.status).toBe(200);

    expect(dateInput(state.added[0].saleDate as Date)).toBe(dateInput(earlier));
  });

  it('rejects a sale dated after its own install', async () => {
    const lastMonth = new Date();
    lastMonth.setDate(1);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    lastMonth.setDate(10);
    const afterInstall = new Date(lastMonth);
    afterInstall.setDate(11);

    const response = await POST(
      post({ ...baseBody, saleDate: dateInput(afterInstall), installDate: dateInput(lastMonth) })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Sale date cannot be after the install date');
    expect(state.added).toHaveLength(0);
  });

  it('rejects a future sale date', async () => {
    const next = new Date();
    next.setDate(next.getDate() + 3);

    const response = await POST(post({ ...baseBody, saleDate: dateInput(next) }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('Sale date cannot be in the future');
    expect(state.added).toHaveLength(0);
  });
});
