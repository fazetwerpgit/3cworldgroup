import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  collectionMock,
  batchMock,
  batchUpdateMock,
  batchCommitMock,
  gateMock,
  callerGetMock,
  targetGetMock,
  usersGetMock,
  configGetMock,
  configSetMock,
  assignOrdersGetMock,
  rematchOrdersGetMock,
} = vi.hoisted(() => ({
  collectionMock: vi.fn(),
  batchMock: vi.fn(),
  batchUpdateMock: vi.fn(),
  batchCommitMock: vi.fn(),
  gateMock: vi.fn(),
  callerGetMock: vi.fn(),
  targetGetMock: vi.fn(),
  usersGetMock: vi.fn(),
  configGetMock: vi.fn(),
  configSetMock: vi.fn(),
  assignOrdersGetMock: vi.fn(),
  rematchOrdersGetMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: { collection: collectionMock, batch: batchMock },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedUser: gateMock,
}));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/portal/sales/status/assign', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function doc(id: string, data: Record<string, unknown>) {
  return { id, data: () => data, ref: { id } };
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({
    ok: true,
    uid: 'caller-1',
    name: 'Caller',
    email: 'caller@example.com',
  });
  callerGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'admin' }) });
  targetGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'rep' }) });
  usersGetMock.mockResolvedValue({
    docs: [doc('rep-1', { displayName: "Cooper O'Tool" })],
  });
  configGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ map: { existing: 'existing-user' } }),
  });
  configSetMock.mockResolvedValue(undefined);
  batchCommitMock.mockResolvedValue(undefined);
  batchMock.mockReturnValue({ update: batchUpdateMock, commit: batchCommitMock });
  assignOrdersGetMock.mockResolvedValue({
    docs: [doc('order-1', { repDealerId: 'dealer-1', matchedUserId: null })],
  });
  rematchOrdersGetMock.mockResolvedValue({
    docs: [doc('order-2', { repDealerId: 'dealer-2', repName: 'Cooper Otool', matchedUserId: null })],
  });

  const users = {
    doc: vi.fn((id: string) => ({ get: id === 'caller-1' ? callerGetMock : targetGetMock })),
    get: usersGetMock,
  };
  const config = { doc: vi.fn(() => ({ get: configGetMock, set: configSetMock })) };
  const fiberOrders = {
    where: vi.fn((field: string) => ({
      get: field === 'repDealerId' ? assignOrdersGetMock : rematchOrdersGetMock,
    })),
    doc: vi.fn((id: string) => ({ id })),
  };
  collectionMock.mockImplementation((name: string) => {
    if (name === 'users') return users;
    if (name === 'config') return config;
    if (name === 'fiberOrders') return fiberOrders;
    throw new Error(`Unexpected collection: ${name}`);
  });
});

describe('POST /api/portal/sales/status/assign', () => {
  it('rejects non-admin callers', async () => {
    callerGetMock.mockResolvedValue({ exists: true, data: () => ({ role: 'rep' }) });

    const response = await POST(request({ action: 'rematch' }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
  });

  it('assigns a dealer and updates its existing orders', async () => {
    const response = await POST(request({ action: 'assign', dealerId: ' dealer-1 ', userId: ' rep-1 ' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, updated: 1 });
    expect(configSetMock).toHaveBeenCalledWith(
      { map: { existing: 'existing-user', 'dealer-1': 'rep-1' } },
      { merge: true },
    );
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { id: 'order-1' },
      expect.objectContaining({ matchedUserId: 'rep-1', updatedAt: expect.any(String) }),
    );
    expect(batchCommitMock).toHaveBeenCalledTimes(1);
  });

  it('rematches unmatched orders by normalized display name and learns the dealer map', async () => {
    const response = await POST(request({ action: 'rematch' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ ok: true, updated: 1, stillUnmatched: 0 });
    expect(batchUpdateMock).toHaveBeenCalledWith(
      { id: 'order-2' },
      expect.objectContaining({ matchedUserId: 'rep-1', updatedAt: expect.any(String) }),
    );
    expect(configSetMock).toHaveBeenCalledWith(
      { map: { existing: 'existing-user', 'dealer-2': 'rep-1' } },
      { merge: true },
    );
  });
});
