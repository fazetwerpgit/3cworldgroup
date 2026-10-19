import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => {
  const mainAuth = { name: 'main-auth' };
  const mainApp = { name: '[DEFAULT]', options: { apiKey: 'k', projectId: 'p' } };
  const apps: Array<{ name: string; options: unknown }> = [mainApp];
  return {
    mainAuth,
    mainApp,
    apps,
    initializeApp: vi.fn((options: unknown, name: string) => {
      const created = { name, options };
      apps.push(created);
      return created;
    }),
    initializeAuth: vi.fn(),
    getAuth: vi.fn(),
    signIn: vi.fn(),
    signOut: vi.fn(async () => undefined),
  };
});

vi.mock('@/lib/firebase/config', () => ({ app: h.mainApp, auth: h.mainAuth }));
vi.mock('firebase/app', () => ({ getApps: () => h.apps, initializeApp: h.initializeApp }));
vi.mock('firebase/auth', () => ({
  inMemoryPersistence: { type: 'NONE' },
  initializeAuth: h.initializeAuth,
  getAuth: h.getAuth,
  signInWithEmailAndPassword: h.signIn,
  signOut: h.signOut,
}));

import { existingAccountToken } from './existingAccountToken';

describe('existingAccountToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.apps.splice(1);
  });

  it('signs in on a separate in-memory auth so the portal session on this device is untouched', async () => {
    const verifyAuth = { name: 'verify-auth' };
    h.initializeAuth.mockReturnValue(verifyAuth);
    h.signIn.mockResolvedValue({ user: { getIdToken: async () => 'id-token' } });

    await expect(existingAccountToken('casey@example.com', 'pw')).resolves.toBe('id-token');

    expect(h.initializeApp).toHaveBeenCalledWith(h.mainApp.options, 'onboard-verify');
    expect(h.initializeAuth).toHaveBeenCalledWith(expect.objectContaining({ name: 'onboard-verify' }), {
      persistence: { type: 'NONE' },
    });
    expect(h.signIn).toHaveBeenCalledWith(verifyAuth, 'casey@example.com', 'pw');
    expect(h.signOut).toHaveBeenCalledWith(verifyAuth);
    for (const call of [...h.signIn.mock.calls, ...h.signOut.mock.calls]) expect(call[0]).not.toBe(h.mainAuth);
  });

  it('reuses the verify app and its auth on a second try', async () => {
    const verifyAuth = { name: 'verify-auth' };
    h.initializeAuth.mockReturnValueOnce(verifyAuth).mockImplementation(() => {
      throw new Error('already-initialized');
    });
    h.getAuth.mockReturnValue(verifyAuth);
    h.signIn.mockResolvedValue({ user: { getIdToken: async () => 'id-token' } });

    await existingAccountToken('casey@example.com', 'pw');
    await existingAccountToken('casey@example.com', 'pw');

    expect(h.initializeApp).toHaveBeenCalledTimes(1);
    expect(h.signIn).toHaveBeenLastCalledWith(verifyAuth, 'casey@example.com', 'pw');
  });

  it('returns null on a wrong password and a friendly error on throttling', async () => {
    h.initializeAuth.mockReturnValue({});
    h.signIn.mockRejectedValueOnce({ code: 'auth/invalid-credential' });
    await expect(existingAccountToken('casey@example.com', 'bad')).resolves.toBeNull();
    h.signIn.mockRejectedValueOnce({ code: 'auth/too-many-requests' });
    await expect(existingAccountToken('casey@example.com', 'bad')).rejects.toThrow('Too many tries');
  });
});
