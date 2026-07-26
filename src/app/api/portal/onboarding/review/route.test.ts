import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { docGetMock, docUpdateMock, gateMock } = vi.hoisted(() => ({
  docGetMock: vi.fn(),
  docUpdateMock: vi.fn(),
  gateMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => ({
      doc: vi.fn(() => ({ get: docGetMock, update: docUpdateMock })),
      where: vi.fn(() => ({ get: vi.fn() })),
      ...(name === 'users' ? {} : {}),
    })),
  },
  getOnboardingBucket: vi.fn(),
}));
vi.mock('@/types', () => ({
  ONBOARDING_ITEMS: [
    { id: 'contract', label: 'Contract', category: 'paperwork', sensitive: false, referenceKind: 'esign' },
  ],
}));
vi.mock('@/lib/onboarding/uploads', () => ({ isStorageItem: vi.fn(() => false) }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedManagement: gateMock }));
vi.mock('@/lib/alerts/dispatch', () => ({ dispatchToUser: vi.fn(async () => undefined) }));
vi.mock('@/lib/email/templates', () => ({
  appBaseUrl: vi.fn(() => 'http://localhost'),
  itemRejectedEmail: vi.fn(() => undefined),
}));
vi.mock('@/lib/onboarding/activation', () => ({ maybeFlagActivationReady: vi.fn(async () => undefined) }));

import { POST } from './route';

function request(status: 'approved' | 'rejected') {
  return new NextRequest('http://localhost/api/portal/onboarding/review', {
    method: 'POST',
    body: JSON.stringify({
      userId: 'user-1',
      itemId: 'contract',
      status,
      ...(status === 'rejected' ? { rejectionReason: 'Please use the provider envelope.' } : {}),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'manager-1', name: 'Manager', isAdmin: true });
  docGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ status: 'submitted' }),
    get: () => 'Rep',
  });
  docUpdateMock.mockResolvedValue(undefined);
});

describe('POST /api/portal/onboarding/review', () => {
  it('refuses approval for an e-sign item', async () => {
    const response = await POST(request('approved'));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('e-sign provider'),
    });
    expect(docUpdateMock).not.toHaveBeenCalled();
  });

  it('still allows rejection for an e-sign item', async () => {
    const response = await POST(request('rejected'));

    expect(response.status).toBe(200);
    expect(docUpdateMock).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });
});
