import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const db = vi.hoisted(() => {
  const state = { missingIndex: false, orderedCalls: 0, unorderedCalls: 0, lastLimit: 0 };
  // 60 notifications, stored oldest-first, so an unordered read of a small window returns the OLD ones.
  const docs = Array.from({ length: 60 }, (_, i) => ({
    id: `n${i}`,
    data: () => ({
      userId: 'u1', type: 'info', title: `Note ${i}`, message: '', read: false,
      createdAt: { toDate: () => new Date(Date.UTC(2026, 8, 1, 0, i)) },
    }),
  }));
  const where = () => ({
    // Honour the field and direction like Firestore, so ascending or a wrong field
    // returns the OLDEST window and the newest-first test fails.
    orderBy: (field: string, direction: 'asc' | 'desc' = 'asc') => ({
      limit: (n: number) => ({
        get: async () => {
          state.orderedCalls++;
          state.lastLimit = n;
          if (state.missingIndex) throw Object.assign(new Error('The query requires an index'), { code: 9 });
          const time = (doc: (typeof docs)[number]) => {
            const value = (doc.data() as Record<string, unknown>)[field];
            return value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
              ? value.toDate().getTime()
              : 0;
          };
          const sorted = [...docs].sort((a, b) => (direction === 'desc' ? time(b) - time(a) : time(a) - time(b)));
          return { docs: sorted.slice(0, n) };
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
  const added: Record<string, unknown>[] = [];
  const add = async (doc: Record<string, unknown>) => {
    added.push(doc);
    return { id: `new${added.length}` };
  };
  return { adminDb: { collection: () => ({ where, add }) }, state, added };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: db.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
  requireVerifiedRequester: vi.fn(),
  requireVerifiedSelfOrManagement: vi.fn(async () => ({ ok: true, uid: 'u1' })),
}));

import { GET, POST, PUT } from './route';
import { requireVerifiedManagement, requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';

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

  it('400s a non-numeric limit instead of crashing', async () => {
    const res = await GET(new NextRequest('http://localhost/api/portal/notifications?userId=u1&limit=abc'));
    expect(res.status).toBe(400);
  });
});

describe('PUT /api/portal/notifications', () => {
  it('treats an empty notificationIds list as nothing to mark, not a 500', async () => {
    vi.mocked(requireVerifiedRequester).mockResolvedValue({ ok: true, uid: 'u1', isManagement: false } as never);
    const res = await PUT(
      new NextRequest('http://localhost/api/portal/notifications', {
        method: 'PUT',
        body: JSON.stringify({ notificationIds: [] }),
      })
    );
    expect(res.status).toBe(200);
  });
});

describe('GET /api/portal/notifications read cost', () => {
  it('countOnly returns just the unread count, without reading the list', async () => {
    const res = await GET(new NextRequest('http://localhost/api/portal/notifications?userId=u1&countOnly=true'));
    const body = await res.json();
    expect(body).toEqual({ unreadCount: 60 });
    expect(db.state.orderedCalls).toBe(0);
    expect(db.state.unorderedCalls).toBe(0);
  });

  it('caps a huge limit at 100', async () => {
    await get(100000);
    expect(db.state.lastLimit).toBe(100);
  });

  it('reads only the page (not 2x) when the ordered query serves it', async () => {
    await get(20);
    expect(db.state.lastLimit).toBe(20);
  });
});

describe('POST /api/portal/notifications link', () => {
  function post(link: unknown) {
    vi.mocked(requireVerifiedManagement).mockResolvedValue({ ok: true, uid: 'ops1' } as never);
    return POST(new NextRequest('http://localhost/api/portal/notifications', {
      method: 'POST',
      body: JSON.stringify({ userId: 'owner1', type: 'sale_approved', title: 'Sale Approved', message: 'tap', link }),
    }));
  }

  beforeEach(() => {
    db.added.length = 0;
  });

  it.each([
    'javascript:fetch(`/api/portal/owner/summary`)',
    'https://phish.example/login',
    '//phish.example',
    '/\\phish.example',
  ])('rejects %s and stores nothing', async (link) => {
    const response = await post(link);
    expect(response.status).toBe(400);
    expect(db.added).toHaveLength(0);
  });

  it('stores a portal path link', async () => {
    const response = await post('/portal/sales/abc');
    expect(response.status).toBe(200);
    expect(db.added[0].link).toBe('/portal/sales/abc');
  });

  it('stores null when no link is given', async () => {
    const response = await post(undefined);
    expect(response.status).toBe(200);
    expect(db.added[0].link).toBeNull();
  });
});
