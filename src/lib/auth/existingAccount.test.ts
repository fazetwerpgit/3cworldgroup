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

import { findActivePortalAccount, findAnyAccount } from './existingAccount';

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

  it('returns null instead of throwing for a malformed email', async () => {
    getUserByEmailMock.mockRejectedValue({ code: 'auth/invalid-email' });

    await expect(findActivePortalAccount('not-an-email')).resolves.toBeNull();
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

describe('findAnyAccount', () => {
  const profilesWith = (ids: string[]) => {
    const where = vi.fn(() => ({
      limit: () => ({ get: async () => ({ docs: ids.map((id) => ({ id })) }) }),
    }));
    usersCollectionMock.mockReturnValue({ doc: vi.fn(() => ({ get: userDocGetMock })), where });
    return where;
  };

  it('finds a login even with no users doc', async () => {
    await expect(findAnyAccount('rep@example.com')).resolves.toEqual({ uid: 'user-1' });
  });

  it('finds a users doc with no login', async () => {
    getUserByEmailMock.mockRejectedValue({ code: 'auth/user-not-found' });
    const where = profilesWith(['profile-1']);
    await expect(findAnyAccount('rep@example.com')).resolves.toEqual({ uid: 'profile-1' });
    expect(where).toHaveBeenCalledWith('email', '==', 'rep@example.com');
  });

  it('returns null when neither exists', async () => {
    getUserByEmailMock.mockRejectedValue({ code: 'auth/user-not-found' });
    profilesWith([]);
    await expect(findAnyAccount('new@example.com')).resolves.toBeNull();
  });
});
