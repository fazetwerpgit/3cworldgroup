import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

type Data = Record<string, unknown>;

const h = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  autoId: 0,
  events: [] as string[],
  followUps: vi.fn(),
  invalidate: vi.fn(async () => {}),
}));

vi.mock('@/lib/firebase/admin', () => {
  const key = (c: string, id: string) => `${c}/${id}`;
  const ref = (c: string, id: string) => ({
    path: key(c, id),
    get: async () => {
      const data = h.docs.get(key(c, id));
      return { exists: !!data, data: () => (data ? { ...data } : undefined) };
    },
    set: async (data: Data, opts?: { merge?: boolean }) => {
      const before = h.docs.get(key(c, id));
      h.docs.set(key(c, id), opts?.merge && before ? { ...before, ...data } : { ...data });
      h.events.push(`set ${key(c, id)} ${Object.keys(data).sort().join(',')}`);
    },
  });
  return {
    adminDb: {
      collection: (c: string) => ({
        doc: (id?: string) => ref(c, id ?? `auto${++h.autoId}`),
        add: async (data: Data) => ref(c, `auto${++h.autoId}`).set(data),
        get: async () => ({ docs: [] }),
      }),
      runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>) =>
        fn({
          get: (r: { get: () => Promise<unknown> }) => r.get(),
          set: (r: { path: string; set: (d: Data, o?: unknown) => Promise<void> }, data: Data, opts?: unknown) => {
            void r.set(data, opts as { merge?: boolean });
          },
        }),
    },
  };
});

vi.mock('@/lib/fiberReport/parseReport', () => ({
  parseFiberReport: vi.fn(async () => ({
    orders: [{ id: 'o1', repDealerId: '', repName: '', orderDate: '2026-10-13', status: 'active' }],
    rowCounts: { Sheet: 1 },
  })),
}));
vi.mock('@/lib/fiberReport/carrierNotices', () => ({ readStoredOrders: vi.fn(async () => new Map()) }));
vi.mock('@/lib/fiberReport/ordersCache', () => ({ invalidateFiberOrdersCache: h.invalidate }));
vi.mock('@/lib/fiberReport/reportFollowUps', () => ({ runReportFollowUps: h.followUps }));
vi.mock('@/lib/fiberReport/assignDealer', () => ({ assignDealerToUser: vi.fn() }));
vi.mock('@/lib/fiberReport/rematch', () => ({ rematchUnmatchedOrders: vi.fn() }));

import { POST } from './route';

function post() {
  process.env.POSTMARK_INBOUND_TOKEN = 't';
  return POST(
    new NextRequest('http://localhost/api/webhooks/inbound-report?token=t', {
      method: 'POST',
      body: JSON.stringify({
        From: 'carrier@x.com',
        Subject: 'Daily',
        Date: 'Tue, 13 Oct 2026 10:00:00 +0000',
        Attachments: [{ Name: 'r.xlsx', Content: Buffer.from('x').toString('base64') }],
      }),
    })
  );
}

function importLogs() {
  return [...h.docs.entries()].filter(([k]) => k.startsWith('fiberReportImports/')).map(([, v]) => v);
}

beforeEach(() => {
  h.docs.clear();
  h.events.length = 0;
  h.autoId = 0;
  h.followUps.mockReset();
  h.invalidate.mockClear();
});

describe('POST /api/webhooks/inbound-report', () => {
  it('writes the started marker, then lastReportAt and the stored stage before any follow-up runs', async () => {
    h.followUps.mockImplementation(async ({ progress }: { progress: (s: string, v: Data) => Promise<void> }) => {
      // At this point the report must already be recorded.
      expect(h.docs.get('config/fiberReportStatus')).toMatchObject({ lastReportAt: expect.any(String), lastUpserted: 1 });
      expect(importLogs()[0]).toMatchObject({ stage: 'stored', upserted: 1 });
      expect(h.invalidate).toHaveBeenCalledTimes(1);
      await progress('installDateSync', { installDateSync: null });
      await progress('done', {});
      return { installDateSync: null, carrierNotices: null, overdueAlerts: null, unloggedOrderNudges: null };
    });
    const res = await post();
    expect(await res.json()).toMatchObject({ ok: true, upserted: 1 });
    const started = h.events.findIndex((e) => e.startsWith('set fiberReportImports/') && e.includes('stage'));
    const status = h.events.findIndex((e) => e.startsWith('set config/fiberReportStatus') && e.includes('lastReportAt'));
    expect(started).toBeGreaterThanOrEqual(0);
    expect(status).toBeGreaterThan(started);
    expect(importLogs()).toHaveLength(1);
    expect(importLogs()[0]).toMatchObject({ stage: 'done', filename: 'r.xlsx', error: null });
  });

  it('a follow-up that never finishes still leaves lastReportAt and a log at its stage', async () => {
    h.followUps.mockImplementation(() => new Promise(() => {}));
    void post();
    await vi.waitFor(() => expect(h.followUps).toHaveBeenCalled());
    expect(h.docs.get('config/fiberReportStatus')).toMatchObject({ lastReportAt: expect.any(String) });
    expect(importLogs()).toEqual([expect.objectContaining({ stage: 'stored', upserted: 1 })]);
  });

  it('a crash after the claim updates the same log doc with the error', async () => {
    h.followUps.mockRejectedValue(new Error('boom'));
    const res = await post();
    expect(await res.json()).toEqual({ ok: false });
    expect(importLogs()).toEqual([expect.objectContaining({ error: 'boom', stage: 'stored' })]);
  });
});
