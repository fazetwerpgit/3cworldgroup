import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  collectionMock,
  configGetMock,
  userGetMock,
  ownOrdersGetMock,
  allOrdersGetMock,
  gateMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  configGetMock: vi.fn(),
  userGetMock: vi.fn(),
  ownOrdersGetMock: vi.fn(),
  allOrdersGetMock: vi.fn(),
  gateMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: gateMock,
}));

import { GET } from './route';

function request() {
  return new NextRequest('http://localhost/api/portal/sales/status');
}

function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data };
}

beforeEach(() => {
  vi.clearAllMocks();
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
  collectionMock.mockImplementation((name: string) => {
    if (name === 'users') return { doc: vi.fn(() => ({ get: userGetMock })) };
    if (name === 'config') return { doc: vi.fn(() => ({ get: configGetMock })) };
    if (name === 'fiberOrders') {
      return {
        get: allOrdersGetMock,
        where: vi.fn(() => ({ get: ownOrdersGetMock })),
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
    expect(json.orders.map((order: { id: string }) => order.id)).toEqual([
      'matched-new',
      'matched-old',
    ]);
    expect(json.unmatched.map((order: { id: string }) => order.id)).toEqual(['unmatched']);
    expect(ownOrdersGetMock).not.toHaveBeenCalled();
  });

  it('gives non-admin users only their matched orders', async () => {
    userGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'rep' }) });

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.scope).toBe('own');
    expect(json.orders.map((order: { id: string }) => order.id)).toEqual(['mine', 'other']);
    expect(json).not.toHaveProperty('unmatched');
    expect(allOrdersGetMock).not.toHaveBeenCalled();
  });
});
