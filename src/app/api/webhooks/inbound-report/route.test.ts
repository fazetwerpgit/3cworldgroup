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
import { readStoredOrders } from '@/lib/fiberReport/carrierNotices';

function post(overrides: Data = {}) {
  process.env.POSTMARK_INBOUND_TOKEN = 't';
  return POST(
    new NextRequest('http://localhost/api/webhooks/inbound-report?token=t', {
      method: 'POST',
      body: JSON.stringify({
        From: 'carrier@x.com',
        Subject: 'Daily',
        Date: 'Tue, 13 Oct 2026 10:00:00 +0000',
        Attachments: [{ Name: 'r.xlsx', Content: Buffer.from('x').toString('base64') }],
        ...overrides,
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
  delete process.env.FIBER_REPORT_SENDERS;
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

  it('a report superseded mid-run leaves the newer report\'s freshness alone and logs what it really wrote', async () => {
    const newer = { lastReportSentAt: '2026-10-14T10:00:00.000Z', lastReportAsOf: '2026-10-14', lastReportAt: 'newer', lastFilename: 'new.xlsx', lastUpserted: 9 };
    vi.mocked(readStoredOrders).mockImplementationOnce(async () => {
      // A newer report claims and finishes while this one is matching reps.
      h.docs.set('config/fiberReportStatus', { ...newer });
      return new Map();
    });
    const res = await post();
    expect(await res.json()).toMatchObject({ ok: true, upserted: 0 });
    expect(h.docs.get('config/fiberReportStatus')).toEqual(newer);
    expect(h.docs.has('fiberOrders/o1')).toBe(false);
    expect(importLogs()).toEqual([expect.objectContaining({ upserted: 0, stage: 'done' })]);
    expect(h.followUps).not.toHaveBeenCalled();
  });

  it('a future-dated mail does not freeze the reports after it', async () => {
    h.followUps.mockResolvedValue({ installDateSync: null });
    await post({ Date: 'Fri, 01 Jan 2027 00:00:00 +0000' });
    expect(h.docs.get('config/fiberReportStatus')?.lastReportSentAt ?? null).not.toBe('2027-01-01T00:00:00.000Z');
    const res = await post({ Date: new Date().toUTCString() });
    expect(await res.json()).toMatchObject({ ok: true, upserted: 1 });
  });

  it('refuses a report from a sender not on FIBER_REPORT_SENDERS', async () => {
    process.env.FIBER_REPORT_SENDERS = 'reports@carrier.com, @carrier-mail.com';
    const res = await post({ From: 'Someone <someone@evil.com>' });
    expect(await res.json()).toEqual({ ok: true, skipped: 'sender_not_allowed' });
    expect(h.docs.has('fiberOrders/o1')).toBe(false);
    expect(h.docs.get('config/fiberReportStatus')).toBeUndefined();
    expect(importLogs()).toEqual([expect.objectContaining({ error: 'refused: sender not allowed' })]);
    expect(h.followUps).not.toHaveBeenCalled();
  });

  it('accepts a listed sender address or domain', async () => {
    process.env.FIBER_REPORT_SENDERS = 'reports@carrier.com, @carrier-mail.com';
    h.followUps.mockResolvedValue({ installDateSync: null });
    expect(await (await post({ From: 'Carrier <Reports@Carrier.com>' })).json()).toMatchObject({ ok: true, upserted: 1 });
    h.docs.clear();
    expect(await (await post({ From: 'x', FromFull: { Email: 'daily@carrier-mail.com' } })).json()).toMatchObject({ ok: true, upserted: 1 });
  });
});
