import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { gateMock, userGetMock, itemGetMock, itemSetMock, sendMock } = vi.hoisted(() => ({
  gateMock: vi.fn(),
  userGetMock: vi.fn(),
  itemGetMock: vi.fn(),
  itemSetMock: vi.fn(),
  sendMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => name === 'users'
        ? { get: userGetMock }
        : { get: itemGetMock, set: itemSetMock }),
    })),
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/esign/autoSend', () => ({ sendPendingEsignDocs: sendMock }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { delete: vi.fn(() => '__DELETE__') } }));

import { POST } from './route';

function request(body: unknown) {
  return new NextRequest('http://localhost/api/portal/onboarding/esign-send', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'admin', name: 'Admin', isAdmin: true });
  userGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ fieldRole: 'entry_rep', isIBO: false, status: 'active' }),
  });
  itemGetMock.mockResolvedValue({ exists: true, get: vi.fn(() => undefined) });
  itemSetMock.mockResolvedValue(undefined);
  sendMock.mockResolvedValue(['w9']);
});

describe('POST /api/portal/onboarding/esign-send', () => {
  it('sends a missing envelope after clearing a stale reference', async () => {
    const response = await POST(request({ userId: 'user-1', itemId: 'w9' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sent: true, sent_items: ['w9'] });
    expect(itemSetMock).toHaveBeenCalledWith(expect.objectContaining({
      reference: '__DELETE__', status: 'not_started',
    }), { merge: true });
    expect(sendMock).toHaveBeenCalledWith('user-1');
  });

  it('does not touch an item that already has an envelope', async () => {
    itemGetMock.mockResolvedValue({ exists: true, get: vi.fn((field: string) => field === 'esignEnvelopeId' ? 'env-1' : undefined) });

    const response = await POST(request({ userId: 'user-1', itemId: 'w9' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sent: false, reason: 'envelope_exists', envelopeId: 'env-1' });
    expect(itemSetMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rejects invalid item ids and missing users', async () => {
    expect((await POST(request({ userId: 'user-1', itemId: 'insurance' }))).status).toBe(400);
    userGetMock.mockResolvedValueOnce({ exists: false });
    expect((await POST(request({ userId: 'missing', itemId: 'w9' }))).status).toBe(404);
  });
});
