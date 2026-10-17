import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The nav-badge figures come from count() aggregations and a one-doc read of
// the oldest open report, never from listing the queue.
const fake = vi.hoisted(() => {
  const state = {
    gate: { ok: true, uid: 'admin-1', name: 'Ada Admin' } as Record<string, unknown>,
    open: 0,
    recent: 0,
    oldest: null as string | null,
    fail: false,
    calls: [] as string[],
  };
  const openQuery = {
    count: () => ({
      get: async () => {
        state.calls.push('count(open)');
        if (state.fail) throw new Error('unavailable');
        return { data: () => ({ count: state.open }) };
      },
    }),
    where: (field: string, op: string) => ({
      count: () => ({
        get: async () => {
          state.calls.push(`count(open, ${field} ${op})`);
          return { data: () => ({ count: state.recent }) };
        },
      }),
    }),
    orderBy: (field: string, dir: string) => ({
      limit: (n: number) => ({
        get: async () => {
          state.calls.push(`list(open, ${field} ${dir}, ${n})`);
          return {
            docs: state.oldest ? [{ data: () => ({ createdAt: { toDate: () => new Date(state.oldest!) } }) }] : [],
          };
        },
      }),
    }),
  };
  const adminDb = {
    collection: (name: string) => {
      if (name !== 'chatReports') throw new Error(`Unexpected collection: ${name}`);
      return {
        where: (field: string, op: string, value: unknown) => {
          if (field !== 'status' || op !== '==' || value !== 'open') throw new Error('unexpected filter');
          return openQuery;
        },
      };
    },
  };
  return { state, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => fake.state.gate),
}));

import { GET } from './route';

const req = () =>
  new NextRequest('http://localhost/api/portal/admin/chat-reports/count', { headers: { Authorization: 'Bearer t' } });

beforeEach(() => {
  Object.assign(fake.state, {
    gate: { ok: true, uid: 'admin-1', name: 'Ada Admin' },
    open: 0,
    recent: 0,
    oldest: null,
    fail: false,
    calls: [],
  });
});

describe('GET /api/portal/admin/chat-reports/count', () => {
  it('refuses a caller who is not management', async () => {
    fake.state.gate = { ok: false, error: 'Forbidden: management access required', status: 403 };
    expect((await GET(req())).status).toBe(403);
    expect(fake.state.calls).toEqual([]);
  });

  it('answers the open count, the last-24h count and the oldest open time', async () => {
    Object.assign(fake.state, { open: 7, recent: 2, oldest: '2026-10-10T08:00:00.000Z' });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ open: 7, newToday: 2, oldestCreatedAt: '2026-10-10T08:00:00.000Z' });
    expect(fake.state.calls.sort()).toEqual(['count(open)', 'count(open, createdAt >=)', 'list(open, createdAt asc, 1)']);
  });

  it('answers zero and no oldest time for an empty queue', async () => {
    expect(await (await GET(req())).json()).toEqual({ open: 0, newToday: 0, oldestCreatedAt: null });
  });

  it('answers 500 when Firestore fails', async () => {
    fake.state.fail = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect((await GET(req())).status).toBe(500);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
