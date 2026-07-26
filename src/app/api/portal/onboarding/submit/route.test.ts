import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { userDocGetMock, progressGetMock, gateMock, setMock } = vi.hoisted(() => ({
  userDocGetMock: vi.fn(),
  progressGetMock: vi.fn(),
  gateMock: vi.fn(),
  setMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'users') {
        return { doc: vi.fn(() => ({ get: userDocGetMock })) };
      }
      return {
        doc: vi.fn(() => ({ get: progressGetMock, set: setMock })),
      };
    }),
  },
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedSelfOrManagement: gateMock,
}));
vi.mock('@/lib/onboarding/verifyStorageReference', () => ({
  verifyStorageReference: vi.fn(),
}));

import { POST } from './route';

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/portal/onboarding/submit', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  gateMock.mockResolvedValue({ ok: true, uid: 'u1', name: 'Sam Rep', isAdmin: false });
  userDocGetMock.mockResolvedValue({
    exists: true,
    data: () => ({ fieldRole: 'entry_level_rep', isIBO: false }),
  });
  progressGetMock.mockResolvedValue({ exists: false, data: () => undefined });
});

describe('POST /api/portal/onboarding/submit', () => {
  it('rejects a typed reference for a signature item', async () => {
    const response = await POST(
      request({ userId: 'u1', itemId: 'contract', reference: 'typed fake signature' })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'E-signature items are completed by the e-sign provider and do not accept typed references',
    });
    expect(setMock).not.toHaveBeenCalled();
  });
});
