import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Proof screenshots on create: up to MAX_PROOF_SCREENSHOTS folders, every one
// the rep's own sale-proof upload, plus the legacy single field older clients send.
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: vi.fn(),
  requireVerifiedRequester: vi.fn(),
}));

vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn() }));

const state: {
  added: Array<Record<string, unknown>>;
  notifications: Array<Record<string, unknown>>;
  notificationFails: boolean;
} = { added: [], notifications: [], notificationFails: false };

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
      return {
        add: vi.fn(async (doc: Record<string, unknown>) => {
          if (state.notificationFails) throw new Error('notifications unavailable');
          state.notifications.push(doc);
          return { id: 'n1' };
        }),
      };
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

const PREFIX = 'form-attachments/r1/sale-proof/';
const SHOT_A = `${PREFIX}abcdef0123456789abcdef0123456789_a1b2c3/`;
const SHOT_B = `${PREFIX}abcdef0123456789abcdef0123456789_d4e5f6/`;

const baseBody = {
  customerAddress: '1 Main St, Springfield, MO 65801',
  productSold: 'Fiber 1 Gig',
  orderNumberOrBtn: 'ORD-1001',
  products: [{ productId: 'tfiber-300', productName: 'TFiber 300 (300 Mbps)', quantity: 1, unitPrice: 45, totalPrice: 45, points: 3 }],
};

beforeEach(() => {
  mockUser.mockReset();
  mockUser.mockResolvedValue({ ok: true, uid: 'r1', name: 'Wil Teasdale', email: 'w@x.com' });
  state.added = [];
  state.notifications = [];
  state.notificationFails = false;
});

describe('POST /api/portal/sales proof screenshots', () => {
  it('stores every screenshot, with the legacy field mirroring the first', async () => {
    const response = await POST(post({ ...baseBody, proofScreenshotPaths: [SHOT_A, SHOT_B] }));

    expect(response.status).toBe(200);
    expect(state.added[0].proofScreenshotPaths).toEqual([SHOT_A, SHOT_B]);
    expect(state.added[0].proofScreenshotPath).toBe(SHOT_A);
  });

  it('rejects more than four screenshots', async () => {
    const paths = [1, 2, 3, 4, 5].map((n) => `${PREFIX}slot_${n}/`);
    const response = await POST(post({ ...baseBody, proofScreenshotPaths: paths }));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/at most 4/);
    expect(state.added).toHaveLength(0);
  });

  it("rejects the sale when any one path is outside the rep's sale-proof folder", async () => {
    const response = await POST(
      post({ ...baseBody, proofScreenshotPaths: [SHOT_A, 'form-attachments/r2/sale-proof/x/'] })
    );

    expect(response.status).toBe(400);
    expect(state.added).toHaveLength(0);
  });

  it('rejects a path that climbs out of the folder', async () => {
    const response = await POST(
      post({ ...baseBody, proofScreenshotPaths: [SHOT_A, `${PREFIX}../../r2/sale-proof/x/`] })
    );

    expect(response.status).toBe(400);
    expect(state.added).toHaveLength(0);
  });

  it('rejects a non-array proofScreenshotPaths', async () => {
    const response = await POST(post({ ...baseBody, proofScreenshotPaths: SHOT_A }));

    expect(response.status).toBe(400);
    expect(state.added).toHaveLength(0);
  });

  it('still accepts the legacy single field from an older client', async () => {
    const response = await POST(post({ ...baseBody, proofScreenshotPath: SHOT_A }));

    expect(response.status).toBe(200);
    expect(state.added[0].proofScreenshotPaths).toEqual([SHOT_A]);
    expect(state.added[0].proofScreenshotPath).toBe(SHOT_A);
  });

  it('still rejects a legacy single path outside the folder', async () => {
    const response = await POST(post({ ...baseBody, proofScreenshotPath: 'form-attachments/r2/sale-proof/x/' }));

    expect(response.status).toBe(400);
    expect(state.added).toHaveLength(0);
  });

  it('accepts a screenshot with no order number', async () => {
    const response = await POST(
      post({ ...baseBody, orderNumberOrBtn: '', proofScreenshotPaths: [SHOT_A] })
    );

    expect(response.status).toBe(200);
    expect(state.added[0].orderNumberOrBtn).toBe('');
  });

  it('rejects a sale with neither an order number nor a screenshot', async () => {
    const response = await POST(
      post({ ...baseBody, orderNumberOrBtn: '  ', proofScreenshotPaths: [], proofScreenshotPath: '' })
    );

    expect(response.status).toBe(400);
    expect(state.added).toHaveLength(0);
  });

  it('stores empty proof fields when only an order number is given', async () => {
    const response = await POST(post(baseBody));

    expect(response.status).toBe(200);
    expect(state.added[0].proofScreenshotPaths).toEqual([]);
    expect(state.added[0].proofScreenshotPath).toBe('');
  });
});

describe('POST /api/portal/sales after the write', () => {
  it('confirms the sale without promising a pay date', async () => {
    const response = await POST(post(baseBody));
    expect(response.status).toBe(200);
    expect(state.notifications).toHaveLength(1);
    expect(String(state.notifications[0].message)).not.toMatch(/week|pay follows|paid/i);
  });

  it('still reports success when the notification write fails', async () => {
    state.notificationFails = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await POST(post(baseBody));
    errorSpy.mockRestore();
    expect(response.status).toBe(200);
    expect(state.added).toHaveLength(1);
    expect((await response.json()).success).toBe(true);
  });
});
