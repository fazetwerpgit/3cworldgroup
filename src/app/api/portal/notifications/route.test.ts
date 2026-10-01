import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
  const state = { missingIndex: false, orderedCalls: 0, unorderedCalls: 0 };
  // 60 notifications, stored oldest-first, so an unordered read of a small window returns the OLD ones.
  const docs = Array.from({ length: 60 }, (_, i) => ({
    id: `n${i}`,
    data: () => ({
      userId: 'u1', type: 'info', title: `Note ${i}`, message: '', read: false,
      createdAt: { toDate: () => new Date(Date.UTC(2026, 8, 1, 0, i)) },
    }),
  }));
  const where = () => ({
    orderBy: () => ({
      limit: (n: number) => ({
        get: async () => {
          state.orderedCalls++;
          if (state.missingIndex) throw Object.assign(new Error('The query requires an index'), { code: 9 });
          return { docs: [...docs].reverse().slice(0, n) };
        },
      }),
    }),
    limit: (n: number) => ({
      get: async () => {
        state.unorderedCalls++;
        return { docs: docs.slice(0, n) };
      },
    }),
    where: () => ({ count: () => ({ get: async () => ({ data: () => ({ count: 60 }) }) }) }),
  });
  return { adminDb: { collection: () => ({ where }) }, state };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
  requireVerifiedRequester: vi.fn(),
  requireVerifiedSelfOrManagement: vi.fn(async () => ({ ok: true, uid: 'u1' })),
}));

import { GET } from './route';

function get(limit: number) {
  return GET(new NextRequest(`http://localhost/api/portal/notifications?userId=u1&limit=${limit}`));
}

beforeEach(() => {
  db.state.missingIndex = false;
  db.state.orderedCalls = 0;
  db.state.unorderedCalls = 0;
});

describe('GET /api/portal/notifications', () => {
  it('returns the newest notifications, not an arbitrary slice, when the user has more than the window', async () => {
    const body = await (await get(5)).json();

    expect(body.notifications.map((n: { title: string }) => n.title)).toEqual([
      'Note 59', 'Note 58', 'Note 57', 'Note 56', 'Note 55',
    ]);
    expect(db.state.unorderedCalls).toBe(0);
  });

  it('keeps the bell working before the createdAt index is built, by falling back to the unordered read', async () => {
    db.state.missingIndex = true;

    const response = await get(5);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notifications).toHaveLength(5);
    expect(db.state.unorderedCalls).toBe(1);
  });
});
