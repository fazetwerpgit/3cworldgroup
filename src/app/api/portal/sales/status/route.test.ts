import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  collectionMock,
  configGetMock,
  userGetMock,
  ownOrdersGetMock,
  allOrdersGetMock,
  ownSalesGetMock,
  allSalesGetMock,
  gateMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  configGetMock: vi.fn(),
  userGetMock: vi.fn(),
  ownOrdersGetMock: vi.fn(),
  allOrdersGetMock: vi.fn(),
  ownSalesGetMock: vi.fn(),
  allSalesGetMock: vi.fn(),
  gateMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: gateMock,
}));

import { GET } from './route';
import { invalidateFiberOrdersCache } from '@/lib/fiberReport/ordersCache';

function request() {
  return new NextRequest('http://localhost/api/portal/sales/status');
}

function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
  // The all-scope fiberOrders read is served from a module-level cache, which
  // outlives a test. Clear it so each test sees its own mocked docs.
  invalidateFiberOrdersCache();
  gateMock.mockResolvedValue({
    ok: true,
    uid: 'caller-1',
    name: 'Caller',
    email: 'caller@example.com',
  });
  configGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ lastReportAt: '2026-08-25T12:00:00.000Z' }),
  });
  userGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });
  allOrdersGetMock.mockResolvedValue({
    docs: [
      doc('matched-old', { id: 'matched-old', matchedUserId: 'rep-1', orderDate: '2026-08-20' }),
      doc('unmatched', { id: 'unmatched', matchedUserId: null, orderDate: '2026-08-22' }),
      doc('matched-new', { id: 'matched-new', matchedUserId: 'rep-2', orderDate: '2026-08-24' }),
    ],
  });
  ownOrdersGetMock.mockResolvedValue({
    docs: [
      doc('other', { id: 'other', matchedUserId: 'caller-1', orderDate: '2026-08-20' }),
      doc('mine', { id: 'mine', matchedUserId: 'caller-1', orderDate: '2026-08-24' }),
    ],
  });
  ownSalesGetMock.mockResolvedValue({ docs: [] });
  allSalesGetMock.mockResolvedValue({ docs: [] });
  collectionMock.mockImplementation((name: string) => {
    if (name === 'users') return { doc: vi.fn(() => ({ get: userGetMock })) };
    if (name === 'config') return { doc: vi.fn(() => ({ get: configGetMock })) };
    if (name === 'fiberOrders') {
      return {
        get: allOrdersGetMock,
        where: vi.fn(() => ({ get: ownOrdersGetMock })),
      };
    }
    if (name === 'sales') {
      return {
        get: allSalesGetMock,
        where: vi.fn(() => ({ get: ownSalesGetMock })),
      };
    }
    throw new Error(`Unexpected collection: ${name}`);
  });
});

describe('GET /api/portal/sales/status', () => {
  it('gives admins all matched orders and separates unmatched orders', async () => {
    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope).toBe('all');
    expect(json.lastReportAt).toBe('2026-08-25T12:00:00.000Z');
    expect(json).not.toHaveProperty('submittedTotal');
    expect(json.orders.map((order: { id: string }) => order.id)).toEqual([
      'matched-new',
      'matched-old',
    ]);
    expect(json.unmatched.map((order: { id: string }) => order.id)).toEqual(['unmatched']);
    expect(ownOrdersGetMock).not.toHaveBeenCalled();
    expect(allSalesGetMock).toHaveBeenCalledOnce();
  });

  it('gives non-admin users only their matched orders', async () => {
    userGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'rep' }) });

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope).toBe('own');
    expect(json.orders.map((order: { id: string }) => order.id)).toEqual(['mine', 'other']);
    expect(json).not.toHaveProperty('unmatched');
    expect(json.submittedTotal).toBe(0);
    expect(allOrdersGetMock).not.toHaveBeenCalled();
    expect(ownSalesGetMock).toHaveBeenCalledOnce();
  });

  it('attaches a matching own sale name and reports submitted sales total', async () => {
    userGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'rep' }) });
    ownOrdersGetMock.mockResolvedValue({
      docs: [
        doc('mine', {
          id: 'mine',
          matchedUserId: 'caller-1',
          orderDate: '2026-08-24',
          address: '5780 Hall St SE',
        }),
        doc('other-address', {
          id: 'other-address',
          matchedUserId: 'caller-1',
          orderDate: '2026-08-23',
          address: '12 Other St',
        }),
      ],
    });
    ownSalesGetMock.mockResolvedValue({
      docs: [
        doc('sale-1', {
          salesRepId: 'caller-1',
          customerName: '  Alice Example  ',
          customerAddress: '5780 Hall St SE, Grand Rapids MI',
          createdAt: { toDate: () => new Date('2026-08-25T12:00:00.000Z') },
        }),
        doc('sale-2', {
          salesRepId: 'caller-1',
          customerName: 'Other Customer',
          customerAddress: '90 Unrelated Ave',
          createdAt: { toDate: () => new Date('2026-08-25T13:00:00.000Z') },
        }),
      ],
    });

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope).toBe('own');
    expect(json.submittedTotal).toBe(2);
    expect(json.orders.find((order: { id: string }) => order.id === 'mine').loggedCustomerName)
      .toBe('Alice Example');
    expect(json.orders.find((order: { id: string }) => order.id === 'other-address').loggedCustomerName)
      .toBeNull();
  });

  it('attaches all-scope names only for the matching rep and leaves unmatched orders unnamed', async () => {
    allOrdersGetMock.mockResolvedValue({
      docs: [
        doc('matched-rep-1', {
          id: 'matched-rep-1',
          matchedUserId: 'rep-1',
          orderDate: '2026-08-24',
          address: '5780 hall st se',
        }),
        doc('matched-rep-2', {
          id: 'matched-rep-2',
          matchedUserId: 'rep-2',
          orderDate: '2026-08-23',
          address: '12 Other St',
        }),
        doc('unmatched', {
          id: 'unmatched',
          matchedUserId: null,
          orderDate: '2026-08-22',
          address: '5780 hall st se',
        }),
      ],
    });
    allSalesGetMock.mockResolvedValue({
      docs: [
        doc('sale-rep-1', {
          salesRepId: 'rep-1',
          customerName: 'Alice Example',
          customerAddress: '5780 Hall St SE, Grand Rapids MI',
        }),
        doc('sale-other-rep', {
          salesRepId: 'other-rep',
          customerName: 'Wrong Rep',
          customerAddress: '5780 Hall St SE',
        }),
      ],
    });

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope).toBe('all');
    expect(json.orders.find((order: { id: string }) => order.id === 'matched-rep-1').loggedCustomerName)
      .toBe('Alice Example');
    expect(json.orders.find((order: { id: string }) => order.id === 'matched-rep-2').loggedCustomerName)
      .toBeNull();
    expect(json.unmatched[0]).not.toHaveProperty('loggedCustomerName');
    expect(allSalesGetMock).toHaveBeenCalledOnce();
  });

  it('serves the second all-scope load from cache, and re-reads once the cache is dropped', async () => {
    await GET(request());
    await GET(request());
    expect(allOrdersGetMock).toHaveBeenCalledOnce();

    invalidateFiberOrdersCache();
    await GET(request());
    expect(allOrdersGetMock).toHaveBeenCalledTimes(2);
  });

  it('bypasses the cache for ?fresh=1 so a post-write refetch cannot be served stale', async () => {
    await GET(request());
    await GET(request());
    expect(allOrdersGetMock).toHaveBeenCalledOnce();

    // The write happened on another instance, so this one's cache was never
    // invalidated — fresh=1 is the only thing that gets past it.
    await GET(new NextRequest('http://localhost/api/portal/sales/status?fresh=1'));
    expect(allOrdersGetMock).toHaveBeenCalledTimes(2);

    // and the fresh read repopulated the cache, so the next ordinary load hits it.
    await GET(request());
    expect(allOrdersGetMock).toHaveBeenCalledTimes(2);
  });

  it('re-reads when a new carrier report lands, without waiting for the TTL', async () => {
    await GET(request());
    configGetMock.mockResolvedValue({
      exists: true,
      data: () => ({ lastReportAt: '2026-08-26T12:00:00.000Z' }),
    });
    await GET(request());
    expect(allOrdersGetMock).toHaveBeenCalledTimes(2);
  });
});
