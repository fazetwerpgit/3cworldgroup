import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  saleGetMock,
  saleDeleteMock,
  linkedGetMock,
  whereMock,
  batchUpdateMock,
  batchCommitMock,
  gateMock,
  requesterMock,
  saleUpdateMock,
  invalidateMock,
  deleteSentinel,
} = vi.hoisted(() => ({
  saleGetMock: vi.fn(),
  saleDeleteMock: vi.fn(),
  linkedGetMock: vi.fn(),
  whereMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  batchCommitMock: vi.fn(),
  gateMock: vi.fn(),
  requesterMock: vi.fn(),
  saleUpdateMock: vi.fn(),
  invalidateMock: vi.fn(),
  deleteSentinel: { __delete: true },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'fiberOrders') return { where: whereMock };
      return {
        doc: vi.fn(() => ({ get: saleGetMock, delete: saleDeleteMock, update: saleUpdateMock })),
      };
    }),
    batch: vi.fn(() => ({ update: batchUpdateMock, commit: batchCommitMock })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => deleteSentinel },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: gateMock,
  requireVerifiedRequester: requesterMock,
}));
vi.mock('@/lib/fiberReport/ordersCache', () => ({
  invalidateFiberOrdersCache: invalidateMock,
}));

import { DELETE, PUT } from './route';
import { dateToSaleDateInput } from '@/lib/sales/saleDate';

function del(id = 'sale-1') {
  return DELETE(
    new NextRequest(`http://localhost/api/portal/sales/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin' });
  requesterMock.mockResolvedValue({ ok: true, uid: 'rep-1', name: 'Rep One', isAdmin: false });
  saleUpdateMock.mockResolvedValue(undefined);
  saleGetMock.mockResolvedValue({ exists: true, data: () => ({ salesRepId: 'rep-1' }) });
  saleDeleteMock.mockResolvedValue(undefined);
  batchCommitMock.mockResolvedValue(undefined);
  whereMock.mockReturnValue({ get: linkedGetMock });
  linkedGetMock.mockResolvedValue({ empty: true, size: 0, docs: [] });
});

describe('DELETE /api/portal/sales/[id] saleLink cleanup', () => {
  it('clears saleLink on every order pointing at the deleted sale', async () => {
    const refA = { id: 'order-a' };
    const refB = { id: 'order-b' };
    linkedGetMock.mockResolvedValue({
      empty: false,
      size: 2,
      docs: [{ ref: refA }, { ref: refB }],
    });

    const response = await del('sale-1');
    const json = await response.json();

    expect(whereMock).toHaveBeenCalledWith('saleLink.saleId', '==', 'sale-1');
    expect(batchUpdateMock).toHaveBeenCalledTimes(2);
    expect(batchUpdateMock).toHaveBeenCalledWith(
      refA,
      { saleLink: deleteSentinel, updatedAt: expect.any(String) }
    );
    expect(batchCommitMock).toHaveBeenCalledOnce();
    expect(invalidateMock).toHaveBeenCalledOnce();
    expect(saleDeleteMock).toHaveBeenCalledOnce();
    expect(json).toEqual({ success: true, clearedLinks: 2 });
  });

  it('skips the batch when nothing links to the sale', async () => {
    const json = await (await del()).json();

    expect(batchUpdateMock).not.toHaveBeenCalled();
    expect(batchCommitMock).not.toHaveBeenCalled();
    expect(invalidateMock).not.toHaveBeenCalled();
    expect(saleDeleteMock).toHaveBeenCalledOnce();
    expect(json).toEqual({ success: true, clearedLinks: 0 });
  });

  it('leaves the sale in place when clearing the links fails', async () => {
    // Links are cleared BEFORE the delete precisely so a failure here cannot
    // strand a link behind a sale that is already gone.
    linkedGetMock.mockResolvedValue({ empty: false, size: 1, docs: [{ ref: { id: 'o' } }] });
    batchCommitMock.mockRejectedValue(new Error('firestore down'));

    const response = await del();

    expect(response.status).toBe(500);
    expect(saleDeleteMock).not.toHaveBeenCalled();
  });

  it('does not touch fiberOrders for an unknown sale', async () => {
    saleGetMock.mockResolvedValue({ exists: false, data: () => undefined });

    const response = await del('nope');

    expect(response.status).toBe(404);
    expect(whereMock).not.toHaveBeenCalled();
    expect(saleDeleteMock).not.toHaveBeenCalled();
  });
});

/** A day inside the install-date window, as the form sends it. */
function dayInput(offsetDays: number): string {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offsetDays);
  return dateToSaleDateInput(date);
}

function put(body: Record<string, unknown>, id = 'sale-1') {
  return PUT(
    new NextRequest(`http://localhost/api/portal/sales/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

describe('PUT /api/portal/sales/[id] install date provenance', () => {
  it('stamps the owning rep as the source when they move the date', async () => {
    saleGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ salesRepId: 'rep-1', installDate: new Date('2026-09-01T17:00:00.000Z') }),
    });

    const response = await put({ installDate: dayInput(7) });

    expect(response.status).toBe(200);
    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.installDateSource).toBe('rep');
    expect(written.installDateChangedAt).toBeInstanceOf(Date);
    expect(written.installDatePreviousDate).toEqual(new Date('2026-09-01T17:00:00.000Z'));
  });

  it('stamps admin when management edits another rep sale', async () => {
    requesterMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true });
    saleGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ salesRepId: 'rep-1', installDate: null }),
    });

    await put({ installDate: dayInput(7) });

    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.installDateSource).toBe('admin');
    expect(written.installDatePreviousDate).toBeNull();
  });

  it('does not restamp a re-save that leaves the day alone', async () => {
    const today = dayInput(0);
    saleGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ salesRepId: 'rep-1', installDate: new Date(`${today}T17:00:00.000Z`) }),
    });

    await put({ installDate: today, notes: 'typo fixed' });

    const written = saleUpdateMock.mock.calls[0][0];
    expect(written.notes).toBe('typo fixed');
    expect(written.installDateSource).toBeUndefined();
    expect(written.installDateChangedAt).toBeUndefined();
  });

  it('rejects an install date the parser refuses', async () => {
    saleGetMock.mockResolvedValue({ exists: true, data: () => ({ salesRepId: 'rep-1' }) });

    const response = await put({ installDate: '2026-02-31' });

    expect(response.status).toBe(400);
    expect(saleUpdateMock).not.toHaveBeenCalled();
  });
});
