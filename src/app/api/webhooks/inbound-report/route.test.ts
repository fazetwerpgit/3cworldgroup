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
} = vi.hoisted(() => {
  const addMock = vi.fn();
  const setMock = vi.fn();
  const docGetMock = vi.fn();
  const collectionGetMock = vi.fn();
  const batchSetMock = vi.fn();
  const batchCommitMock = vi.fn();
  const syncMock = vi.fn();
  const collectionMock = vi.fn((name: string) => ({
    add: addMock,
    get: collectionGetMock,
    doc: vi.fn((id?: string) => ({ id, set: setMock, get: docGetMock })),
    name,
  }));
  return {
    addMock,
    setMock,
    docGetMock,
    collectionGetMock,
    collectionMock,
    batchSetMock,
    batchCommitMock,
    syncMock,
  };
});

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: collectionMock,
    batch: () => ({ set: batchSetMock, commit: batchCommitMock }),
  },
}));
vi.mock('@/lib/fiberReport/parseReport', () => ({
  parseFiberReport: vi.fn(),
}));
vi.mock('@/lib/sales/installDateSync', () => ({
  syncInstallDatesFromOrders: syncMock,
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
    // `changes` is the caller's detail, not something the webhook echoes back.
    const { changes: _changes, ...counts } = NO_CHANGES;
    expect(json).toEqual({
      ok: true,
      upserted: 1,
      installDateSync: { ...counts, checked: 1, updated: 1 },
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
    expect(batchSetMock).toHaveBeenCalledOnce();
    expect(batchCommitMock).toHaveBeenCalledOnce();
    expect(addMock).toHaveBeenCalledWith(
      expect.objectContaining({ error: null, upserted: 1, installDateSync: null })
    );
    consoleError.mockRestore();
  });
});
