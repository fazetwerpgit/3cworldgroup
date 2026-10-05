import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  addMock,
  setMock,
  docGetMock,
  collectionGetMock,
  collectionMock,
  batchSetMock,
  batchCommitMock,
  syncMock,
  readStoredMock,
  sendNoticesMock,
  runTransaction,
} = vi.hoisted(() => {
  const addMock = vi.fn();
  const setMock = vi.fn();
  const docGetMock = vi.fn();
  const collectionGetMock = vi.fn();
  const batchSetMock = vi.fn();
  const batchCommitMock = vi.fn();
  const syncMock = vi.fn();
  const readStoredMock = vi.fn();
  const sendNoticesMock = vi.fn();
  const collectionMock = vi.fn((name: string) => ({
    add: addMock,
    get: collectionGetMock,
    doc: vi.fn((id?: string) => ({ id, set: setMock, get: docGetMock })),
    name,
  }));
  // Transactions run one at a time, as Firestore serializes them, reading and
  // writing through the same doc mocks as plain gets and sets.
  type DocMock = { get: () => Promise<unknown>; set: (data: unknown, options?: unknown) => Promise<unknown> };
  let queue: Promise<unknown> = Promise.resolve();
  const runTransaction = <T>(run: (transaction: unknown) => Promise<T>): Promise<T> => {
    const result = queue.then(() =>
      run({
        get: (ref: DocMock) => ref.get(),
        set: (ref: DocMock, data: unknown, options?: unknown) => {
          void ref.set(data, options);
        },
      })
    );
    queue = result.catch(() => undefined);
    return result;
  };
  return {
    addMock,
    setMock,
    docGetMock,
    collectionGetMock,
    collectionMock,
    batchSetMock,
    batchCommitMock,
    syncMock,
    readStoredMock,
    sendNoticesMock,
    runTransaction,
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: collectionMock,
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
    runTransaction,
  },
}));
vi.mock('@/lib/fiberReport/parseReport', () => ({
  parseFiberReport: vi.fn(),
}));
vi.mock('@/lib/sales/installDateSync', () => ({
  syncInstallDatesFromOrders: syncMock,
}));
vi.mock('@/lib/fiberReport/carrierNotices', () => ({
  readStoredOrders: readStoredMock,
  sendCarrierNotices: sendNoticesMock,
}));

import { POST } from './route';
import { parseFiberReport } from '@/lib/fiberReport/parseReport';

const NO_CHANGES = {
  checked: 0,
  updated: 0,
  skippedAmbiguous: 0,
  skippedCancelled: 0,
  unchanged: 0,
  errors: 0,
  changes: [],
  orderSales: new Map(),
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.POSTMARK_INBOUND_TOKEN = 'test-token';
  addMock.mockResolvedValue({ id: 'import-1' });
  setMock.mockResolvedValue(undefined);
  docGetMock.mockResolvedValue({ exists: true, data: () => ({}) });
  collectionGetMock.mockResolvedValue({ docs: [] });
  batchCommitMock.mockResolvedValue(undefined);
  syncMock.mockResolvedValue(NO_CHANGES);
  readStoredMock.mockResolvedValue(new Map());
  sendNoticesMock.mockResolvedValue({ found: 0, alreadySent: 0, sent: 0, summarized: 0, errors: 0 });
});

/** One parsed order, posted as a report with an xlsx attachment. */
function postReport() {
  vi.mocked(parseFiberReport).mockResolvedValue({
    orders: [
      {
        id: 'TMO20260824UZMTV',
        repDealerId: '4721016',
        repName: 'Rep One',
        address: '123 Main St',
        estInstallDate: '2026-09-20',
      },
    ],
    rowCounts: { Orders: 1 },
  } as unknown as Awaited<ReturnType<typeof parseFiberReport>>);

  return POST(
    new NextRequest('http://localhost/api/webhooks/inbound-report?token=test-token', {
      method: 'POST',
      body: JSON.stringify({
        From: 'carrier@example.com',
        Subject: 'Daily report',
        Attachments: [{ Name: 'report.xlsx', Content: Buffer.from('x').toString('base64') }],
      }),
    })
  );
}

describe('POST /api/webhooks/inbound-report', () => {
  it('rejects a missing or incorrect token', async () => {
    const missing = await POST(
      new NextRequest('http://localhost/api/webhooks/inbound-report', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );
    const wrong = await POST(
      new NextRequest('http://localhost/api/webhooks/inbound-report?token=wrong', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    );

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('logs a forwarding email without an xlsx and returns skipped', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/webhooks/inbound-report?token=test-token', {
        method: 'POST',
        body: JSON.stringify({ From: 'forwarder@example.com', Subject: 'Verify forwarding' }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, skipped: true });
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmail: 'forwarder@example.com',
        subject: 'Verify forwarding',
        error: 'no xlsx attachment',
      })
    );
    expect(setMock).toHaveBeenCalledWith(
      { from: 'forwarder@example.com', subject: 'Verify forwarding', receivedAt: expect.any(String) },
      { merge: true }
    );
  });
});

describe('POST /api/webhooks/inbound-report install-date sync', () => {
  it('syncs the upserted orders and reports the counts', async () => {
    syncMock.mockResolvedValue({
      ...NO_CHANGES,
      checked: 1,
      updated: 1,
      changes: [{ saleId: 'sale-1', salesRepId: 'rep-1', previous: null, next: new Date() }],
    });

    const response = await postReport();
    const json = await response.json();

    expect(syncMock).toHaveBeenCalledWith({
      orders: [expect.objectContaining({ id: 'TMO20260824UZMTV' })],
      now: expect.any(Date),
    });
    // `changes` and `orderSales` are the caller's detail, not something the webhook echoes back.
    expect(json).toEqual({
      ok: true,
      upserted: 1,
      installDateSync: {
        checked: 1,
        updated: 1,
        skippedAmbiguous: 0,
        skippedCancelled: 0,
        unchanged: 0,
        errors: 0,
      },
    });
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({
        error: null,
        installDateSync: expect.objectContaining({ updated: 1 }),
      })
    );
  });

  it('still stores the report when the sync throws', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    syncMock.mockRejectedValue(new Error('sales read failed'));

    const response = await postReport();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, upserted: 1, installDateSync: null });
    // The orders were written before the sync ran, and the import log still
    // records a clean import: the report itself did not fail.
    expect(setMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'TMO20260824UZMTV' }),
      { merge: true }
    );
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: null, upserted: 1, installDateSync: null })
    );
    consoleError.mockRestore();
  });

  it('still stores the report when the carrier notices throw', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    sendNoticesMock.mockRejectedValue(new Error('bell down'));

    const response = await postReport();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, upserted: 1 });
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: null, upserted: 1, carrierNotices: null })
    );
    consoleError.mockRestore();
  });
});

describe('POST /api/webhooks/inbound-report overlapping deliveries', () => {
  const OLDER = { id: 'older', date: 'Tue, 22 Sep 2026 08:00:00 +0000', sentAt: '2026-09-22T08:00:00.000Z' };
  const NEWER = { id: 'newer', date: 'Wed, 23 Sep 2026 08:00:00 +0000', sentAt: '2026-09-23T08:00:00.000Z' };
  let status: Record<string, unknown>;

  function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => { resolve = done; });
    return { promise, resolve };
  }

  /** config/fiberReportStatus as one shared doc; every other doc reads empty. */
  beforeEach(() => {
    status = {};
    docGetMock.mockImplementation(async () => ({ exists: true, data: () => ({ ...status }) }));
    setMock.mockImplementation(async (data: Record<string, unknown>) => {
      Object.assign(status, data);
    });
  });

  function post(report: typeof OLDER) {
    return POST(
      new NextRequest('http://localhost/api/webhooks/inbound-report?token=test-token', {
        method: 'POST',
        body: JSON.stringify({
          Date: report.date,
          Attachments: [{ Name: 'report.xlsx', Content: Buffer.from(report.id).toString('base64') }],
        }),
      })
    ).then(async (response) => ({ response, json: await response.json() }));
  }

  function parseAs(gates: Partial<Record<string, Promise<void>>> = {}) {
    vi.mocked(parseFiberReport).mockImplementation(async (buffer: Buffer) => {
      const id = buffer.toString();
      await gates[id];
      return {
        orders: [{ id, repDealerId: '', repName: '', address: '1 Main St' }],
        rowCounts: { Orders: 1 },
      } as unknown as Awaited<ReturnType<typeof parseFiberReport>>;
    });
  }

  const syncedIds = () => syncMock.mock.calls.map(([input]) => input.orders[0].id);

  it('skips an older report that arrives while a newer one is loading', async () => {
    // The newer report is mid-sync when the older one reads the status doc.
    const newerSyncing = deferred();
    const olderReadStatus = deferred();
    let olderParsed = false;
    docGetMock.mockImplementation(async () => {
      const snapshot = { ...status };
      if (olderParsed) olderReadStatus.resolve();
      return { exists: true, data: () => snapshot };
    });
    syncMock.mockImplementation(async ({ orders }: { orders: { id: string }[] }) => {
      if (orders[0].id === NEWER.id) {
        newerSyncing.resolve();
        await olderReadStatus.promise;
      }
      return NO_CHANGES;
    });
    parseAs({ [OLDER.id]: newerSyncing.promise.then(() => { olderParsed = true; }) });

    const [, older] = await Promise.all([post(NEWER), post(OLDER)]);

    expect(older.json).toEqual({ ok: true, skipped: 'older_report' });
    expect(syncedIds()).toEqual([NEWER.id]);
    expect(status.lastReportSentAt).toBe(NEWER.sentAt);
  });

  it('does not sync an older report a newer one overtook, nor move the stamp back', async () => {
    const newerClaimed = deferred();
    setMock.mockImplementation(async (data: Record<string, unknown>) => {
      Object.assign(status, data);
      if (status.lastReportSentAt === NEWER.sentAt) newerClaimed.resolve();
    });
    readStoredMock.mockImplementation(async (orders: { id: string }[]) => {
      if (orders[0].id === OLDER.id) await newerClaimed.promise;
      return new Map();
    });
    parseAs();

    await Promise.all([post(OLDER), post(NEWER)]);

    expect(syncedIds()).toEqual([NEWER.id]);
    expect(status.lastReportSentAt).toBe(NEWER.sentAt);
  });

  it("does not write an older report's rows once a newer one has claimed", async () => {
    // The older report claims first; the newer claims while the older is still
    // reading the stored orders, before any older row is written.
    const newerClaimed = deferred();
    setMock.mockImplementation(async (data: Record<string, unknown>) => {
      Object.assign(status, data);
      if (status.lastReportSentAt === NEWER.sentAt) newerClaimed.resolve();
    });
    readStoredMock.mockImplementation(async (orders: { id: string }[]) => {
      if (orders[0].id === OLDER.id) await newerClaimed.promise;
      return new Map();
    });
    parseAs();

    await Promise.all([post(OLDER), post(NEWER)]);

    const writtenIds = setMock.mock.calls.flatMap(([data]) =>
      data && typeof data === 'object' && 'id' in data ? [data.id] : []
    );
    expect(writtenIds).toEqual([NEWER.id]);
  });
});
