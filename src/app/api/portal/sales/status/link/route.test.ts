import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { docs, updateMock, collectionMock, requireVerifiedUserMock, invalidateMock, deleteSentinel } = vi.hoisted(() => {
  // path -> { exists } for users/*, fiberOrders/*, sales/*
  const docs = new Map<string, { exists: boolean; data?: Record<string, unknown> }>();
  const updateMock = vi.fn();
  const collectionMock = vi.fn((collection: string) => ({
    doc: (id: string) => {
      const key = `${collection}/${id}`;
      const entry = docs.get(key) ?? { exists: false };
      return {
        get: async () => ({ exists: entry.exists, data: () => entry.data ?? {} }),
        update: updateMock,
      };
    },
  }));
  return {
    docs,
    updateMock,
    collectionMock,
    requireVerifiedUserMock: vi.fn(),
    invalidateMock: vi.fn(),
    deleteSentinel: { __delete: true },
  };
});

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { delete: () => deleteSentinel },
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: requireVerifiedUserMock,
}));
vi.mock('@/lib/fiberReport/ordersCache', () => ({
  invalidateFiberOrdersCache: invalidateMock,
}));

import { POST } from './route';

function post(body: unknown) {
  return POST(
    new NextRequest('http://localhost/api/portal/sales/status/link', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  docs.clear();
  docs.set('users/admin-1', { exists: true, data: { role: 'admin', displayName: 'Jacob' } });
  docs.set('users/rep-1', { exists: true, data: { role: 'sales_rep', displayName: 'Rep' } });
  docs.set('fiberOrders/TMO1', { exists: true });
  docs.set('sales/sale-1', { exists: true });
  updateMock.mockResolvedValue(undefined);
  requireVerifiedUserMock.mockResolvedValue({
    ok: true,
    uid: 'admin-1',
    name: 'Jacob',
    email: 'jacob@example.com',
  });
});

describe('POST /api/portal/sales/status/link', () => {
  it('rejects an unverified caller with the gate status', async () => {
    requireVerifiedUserMock.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const response = await post({ orderId: 'TMO1', saleId: 'sale-1' });
    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('forbids a non admin/owner caller', async () => {
    requireVerifiedUserMock.mockResolvedValue({ ok: true, uid: 'rep-1', name: 'Rep', email: '' });
    const response = await post({ orderId: 'TMO1', saleId: 'sale-1' });
    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a body with no orderId or a non-string, non-null saleId', async () => {
    const noOrder = await post({ saleId: 'sale-1' });
    const badSale = await post({ orderId: 'TMO1' });
    expect(noOrder.status).toBe(400);
    expect(badSale.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('404s an unknown order and an unknown sale', async () => {
    const noOrder = await post({ orderId: 'nope', saleId: 'sale-1' });
    const noSale = await post({ orderId: 'TMO1', saleId: 'nope' });
    expect(noOrder.status).toBe(404);
    expect(noSale.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('writes only saleLink and updatedAt, and invalidates the orders cache', async () => {
    const response = await post({ orderId: 'TMO1', saleId: 'sale-1' });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(updateMock).toHaveBeenCalledTimes(1);
    const written = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['saleLink', 'updatedAt']);
    expect(written.saleLink).toEqual({
      saleId: 'sale-1',
      by: 'admin-1',
      byName: 'Jacob',
      at: expect.any(String),
    });
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it('accepts an explicit null saleId without touching the sales collection', async () => {
    const response = await post({ orderId: 'TMO1', saleId: null });
    expect(response.status).toBe(200);
    expect((updateMock.mock.calls[0][0] as { saleLink: { saleId: null } }).saleLink.saleId).toBeNull();
    expect(collectionMock).not.toHaveBeenCalledWith('sales');
  });

  it('removes the field entirely for clear: true, handing the order back to the address guess', async () => {
    const response = await post({ orderId: 'TMO1', clear: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    const written = updateMock.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(written).sort()).toEqual(['saleLink', 'updatedAt']);
    // Deleted, not written as a null saleId — a null would keep suppressing the guess.
    expect(written.saleLink).toBe(deleteSentinel);
    expect(collectionMock).not.toHaveBeenCalledWith('sales');
    expect(invalidateMock).toHaveBeenCalledTimes(1);
  });

  it('404s clear: true on an unknown order', async () => {
    const response = await post({ orderId: 'nope', clear: true });
    expect(response.status).toBe(404);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('rejects a body carrying both clear and saleId, and a non-true clear', async () => {
    const both = await post({ orderId: 'TMO1', clear: true, saleId: 'sale-1' });
    const bothNull = await post({ orderId: 'TMO1', clear: true, saleId: null });
    const notTrue = await post({ orderId: 'TMO1', clear: false });

    expect(both.status).toBe(400);
    expect(bothNull.status).toBe(400);
    expect(notTrue.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('forbids clear: true for a non admin/owner caller', async () => {
    requireVerifiedUserMock.mockResolvedValue({ ok: true, uid: 'rep-1', name: 'Rep', email: '' });
    const response = await post({ orderId: 'TMO1', clear: true });
    expect(response.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
