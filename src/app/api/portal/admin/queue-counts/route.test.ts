import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The admin badge figures: count() aggregations only, never a listing of
// submissions, all in one response.
const fake = vi.hoisted(() => {
  const state = {
    gate: { ok: true, uid: 'admin-1', name: 'Ada Admin' } as Record<string, unknown>,
    counts: {} as Record<string, number>,
    failing: new Set<string>(),
    calls: [] as string[],
    oldest: null as string | null,
    since: null as Date | null,
  };
  const countOf = (name: string, label: string, value: () => number) => ({
    get: async () => {
      state.calls.push(label);
      if (state.failing.has(name)) throw new Error('unavailable');
      return { data: () => ({ count: value() }) };
    },
  });
  const adminDb = {
    collection: (name: string) => ({
      where: (field: string, op: string, value: unknown) => {
        if (field !== 'status' || op !== '==') throw new Error('unexpected filter');
        if (name === 'chatReports') {
          if (value !== 'open') throw new Error('unexpected status');
          return {
            count: () => countOf(name, 'count(chatReports)', () => state.counts.chatReports ?? 0),
            where: (_field: string, _op: string, since: { toDate: () => Date }) => {
              state.since = since.toDate();
              return { count: () => countOf(name, 'count(chatReports, recent)', () => state.counts.recent ?? 0) };
            },
            orderBy: () => ({
              limit: () => ({
                get: async () => ({
                  docs: state.oldest ? [{ data: () => ({ createdAt: { toDate: () => new Date(state.oldest!) } }) }] : [],
                }),
              }),
            }),
          };
        }
        if (value !== 'new') throw new Error('unexpected status');
        return { count: () => countOf(name, `count(${name})`, () => state.counts[name] ?? 0) };
      },
      get: async () => {
        throw new Error(`listed ${name}`);
      },
    }),
  };
  return { state, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => fake.state.gate),
}));

import { GET } from './route';

const req = () => new NextRequest('http://localhost/api/portal/admin/queue-counts');

beforeEach(() => {
  Object.assign(fake.state, {
    gate: { ok: true, uid: 'admin-1', name: 'Ada Admin' },
    counts: {},
    failing: new Set<string>(),
    calls: [],
    oldest: null,
    since: null,
  });
});

describe('GET /api/portal/admin/queue-counts', () => {
  it('refuses a caller who is not management, before any read', async () => {
    fake.state.gate = { ok: false, error: 'Forbidden', status: 403 };
    expect((await GET(req())).status).toBe(403);
    expect(fake.state.calls).toEqual([]);
  });

  it('counts every request queue and the chat reports with aggregations', async () => {
    fake.state.counts = { payrollDisputes: 2, bugReports: 5, chatReports: 3, recent: 1 };
    fake.state.oldest = '2026-10-10T08:00:00.000Z';
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      requests: {
        'payroll-dispute': 2,
        'expedite-order': 0,
        'leads-request': 0,
        'fiber-report': 0,
        'manager-interview': 0,
        'bug-report': 5,
      },
      chatReports: { open: 3, newToday: 1, oldestCreatedAt: '2026-10-10T08:00:00.000Z' },
      solarLeads: null,
    });
    expect(fake.state.calls).not.toContain('count(solarLeads)');
  });

  it('counts new solar leads for an admin only', async () => {
    fake.state.gate = { ok: true, uid: 'admin-1', name: 'Ada Admin', isAdmin: true };
    fake.state.counts = { solarLeads: 4 };
    expect((await (await GET(req())).json()).solarLeads).toBe(4);
    expect(fake.state.calls).toContain('count(solarLeads)');
  });

  it('answers null for solar leads when that count fails', async () => {
    fake.state.gate = { ok: true, uid: 'admin-1', name: 'Ada Admin', isAdmin: true };
    fake.state.failing = new Set(['solarLeads']);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const body = await (await GET(req())).json();
      expect(body.solarLeads).toBeNull();
      expect(body.requests['bug-report']).toBe(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('answers null for a queue that fails and keeps the others', async () => {
    fake.state.failing = new Set(['fiberReports', 'chatReports']);
    fake.state.counts = { leadsRequests: 4 };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const body = await (await GET(req())).json();
      expect(body.requests['fiber-report']).toBeNull();
      expect(body.requests['leads-request']).toBe(4);
      expect(body.chatReports).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  describe('chat reports new today', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it('counts from Chicago midnight, not a rolling 24 hours', async () => {
      // 9 AM Chicago (CDT) on Tue 2026-10-20: yesterday's 3 PM report is not today's.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-20T14:00:00.000Z'));
      await GET(req());
      expect(fake.state.since?.toISOString()).toBe('2026-10-20T05:00:00.000Z');
    });

    it('uses the Chicago day, not the UTC day, late in the evening', async () => {
      // 8 PM Chicago (CST) on Mon 2026-12-07 is already Tuesday in UTC.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-12-08T02:00:00.000Z'));
      await GET(req());
      expect(fake.state.since?.toISOString()).toBe('2026-12-07T06:00:00.000Z');
    });
  });
});
