import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createUserMock, userSetMock, notificationAddMock } = vi.hoisted(() => ({
  createUserMock: vi.fn(),
  userSetMock: vi.fn(),
  notificationAddMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { createUser: createUserMock },
  adminDb: {
    collection: vi.fn((name: string) => {
      if (name === 'users') {
        return { doc: vi.fn(() => ({ set: userSetMock })) };
      }
      if (name === 'notifications') {
        return { add: notificationAddMock };
      }
      throw new Error(`Unexpected collection: ${name}`);
    }),
  },
}));

import { NextRequest } from 'next/server';
import { POST } from './route';

function request() {
  return new NextRequest('http://localhost/api/portal/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: 'rep@example.com',
      password: 'password',
      displayName: 'Rep',
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  createUserMock.mockResolvedValue({
    uid: 'user-1',
    email: 'rep@example.com',
    displayName: 'Rep',
  });
  userSetMock.mockResolvedValue(undefined);
  notificationAddMock.mockResolvedValue(undefined);
});

describe('POST /api/portal/auth/signup', () => {
  it('returns an actionable account_exists response for an existing email', async () => {
    createUserMock.mockRejectedValue({ code: 'auth/email-already-exists' });

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: 'You already have a portal account. Sign in instead, or reset your password from the login page.',
      code: 'account_exists',
    });
  });
});
