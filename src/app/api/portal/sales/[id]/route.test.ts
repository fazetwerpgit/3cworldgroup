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
  invalidateMock: vi.fn(),
  deleteSentinel: { __delete: true },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'fiberOrders') return { where: whereMock };
      return { doc: vi.fn(() => ({ get: saleGetMock, delete: saleDeleteMock })) };
    }),
    batch: vi.fn(() => ({ update: batchUpdateMock, commit: batchCommitMock })),
  },
}));
vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => deleteSentinel },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedAdmin: gateMock,
  requireVerifiedRequester: vi.fn(),
}));
vi.mock('@/lib/fiberReport/ordersCache', () => ({
  invalidateFiberOrdersCache: invalidateMock,
}));
vi.mock('@/lib/sales/saleDate', () => ({
  parseSaleDateInput: vi.fn(),
  parseInstallDateInput: vi.fn(),
}));

import { DELETE } from './route';

function del(id = 'sale-1') {
  return DELETE(
    new NextRequest(`http://localhost/api/portal/sales/${id}`, { method: 'DELETE' }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'admin-1', name: 'Admin' });
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
