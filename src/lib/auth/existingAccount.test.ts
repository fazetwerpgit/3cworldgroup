import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getUserByEmailMock, userDocGetMock, usersCollectionMock } = vi.hoisted(() => ({
  getUserByEmailMock: vi.fn(),
  userDocGetMock: vi.fn(),
  usersCollectionMock: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  adminAuth: { getUserByEmail: getUserByEmailMock },
  adminDb: {
    collection: usersCollectionMock,
  },
}));

import { findActivePortalAccount } from './existingAccount';

beforeEach(() => {
  vi.clearAllMocks();
  usersCollectionMock.mockReturnValue({
    doc: vi.fn(() => ({ get: userDocGetMock })),
  });
  getUserByEmailMock.mockResolvedValue({ uid: 'user-1' });
  userDocGetMock.mockResolvedValue({ exists: false, data: () => undefined });
});

describe('findActivePortalAccount', () => {
  it('returns the uid for an active portal profile', async () => {
    userDocGetMock.mockResolvedValue({ exists: true, data: () => ({ status: 'active' }) });

    await expect(findActivePortalAccount('rep@example.com')).resolves.toEqual({ uid: 'user-1' });
    expect(getUserByEmailMock).toHaveBeenCalledWith('rep@example.com');
  });

  it('returns null when Firebase Auth has no matching email', async () => {
    getUserByEmailMock.mockRejectedValue({ code: 'auth/user-not-found' });

    await expect(findActivePortalAccount('missing@example.com')).resolves.toBeNull();
    expect(userDocGetMock).not.toHaveBeenCalled();
  });

  it('returns null when the users profile is missing', async () => {
    await expect(findActivePortalAccount('rep@example.com')).resolves.toBeNull();
  });

  it('returns null for a pending profile so onboarding can proceed', async () => {
    userDocGetMock.mockResolvedValue({ exists: true, data: () => ({ status: 'pending' }) });

    await expect(findActivePortalAccount('rep@example.com')).resolves.toBeNull();
  });

  it('rethrows unexpected Auth errors', async () => {
    const error = new Error('Auth unavailable');
    getUserByEmailMock.mockRejectedValue(error);

    await expect(findActivePortalAccount('rep@example.com')).rejects.toBe(error);
  });
});
