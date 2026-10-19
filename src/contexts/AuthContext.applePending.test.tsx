// @vitest-environment jsdom
//
// First sign-in with Apple or Google (no profile yet), an Apple ID that shared
// no email, and the pending account's ID token parked for "Delete my request"
// (App Store 5.1.1(v)) once the pending account is signed out.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({
  authListener: null as ((user: unknown) => void) | null,
  profile: null as Record<string, unknown> | null,
  setDocFails: false,
  appleName: undefined as string | undefined,
  auth: { currentUser: null as unknown },
}));

vi.mock('@/lib/firebase/config', () => ({ auth: fb.auth, db: {}, isFirebaseConfigured: () => true }));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, cb: (user: unknown) => void) => {
    fb.authListener = cb;
    return () => {
      fb.authListener = null;
    };
  },
  signOut: vi.fn(async () => undefined),
  signInWithEmailAndPassword: vi.fn(),
  createUserWithEmailAndPassword: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  sendEmailVerification: vi.fn(async () => undefined),
  updateProfile: vi.fn(async () => undefined),
  updatePassword: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: vi.fn(async () => ({ exists: () => fb.profile !== null, data: () => fb.profile })),
  onSnapshot: vi.fn(() => () => {}),
  setDoc: vi.fn(async () => {
    if (fb.setDocFails) throw new Error('PERMISSION_DENIED');
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));
vi.mock('@/lib/app/nativeAuth', () => ({
  takePendingDisplayName: vi.fn(() => {
    const name = fb.appleName;
    fb.appleName = undefined;
    return name;
  }),
}));
vi.mock('@/lib/push/enablePushOnDevice', () => ({ unregisterPushOnDevice: vi.fn(async () => undefined) }));
vi.mock('@/lib/app/nativePush', () => ({ unregisterNativePush: vi.fn(async () => undefined) }));
vi.mock('@/components/portal/owner/preloadOwnerDashboard', () => ({ preloadOwnerDashboard: vi.fn() }));

import { AuthProvider, useAuth, type AuthContextType } from './AuthContext';
import { signOut as firebaseSignOut, createUserWithEmailAndPassword } from 'firebase/auth';
import { setDoc } from 'firebase/firestore';
import { clearPendingIdToken, pendingIdTokenForDelete } from '@/lib/auth/pendingSession';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ctx: { current: AuthContextType | null } = { current: null };

function Probe() {
  const value = useAuth();
  useEffect(() => {
    ctx.current = value;
  });
  return null;
}

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => new Response('{}'));

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
}

type Session = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerData: Array<{ providerId: string }>;
  getIdToken: () => Promise<string>;
  delete?: () => Promise<void>;
};

function session(over: Partial<Session> = {}): Session {
  return {
    uid: 'u-new',
    email: 'Pat@PrivateRelay.AppleID.com',
    displayName: null,
    photoURL: null,
    providerData: [{ providerId: 'apple.com' }],
    getIdToken: vi.fn(async () => 'id-token-1'),
    ...over,
  };
}

async function signInAs(user: Session) {
  fb.auth.currentUser = user;
  await act(async () => {
    fb.authListener?.(user);
  });
}

const fetchedUrls = () => fetchMock.mock.calls.map((c) => c[0]);

beforeEach(() => {
  window.localStorage.clear();
  fb.profile = null;
  fb.setDocFails = false;
  fb.appleName = undefined;
  fb.auth.currentUser = null;
  ctx.current = null;
  clearPendingIdToken();
  vi.mocked(firebaseSignOut).mockClear();
  vi.mocked(setDoc).mockClear();
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('first sign-in with Apple (no profile yet)', () => {
  it("creates the pending profile with the name Apple shared, alerts the owner, parks the token and signs out", async () => {
    fb.appleName = 'Pat Rivera';
    await mount();
    await signInAs(session());
    expect(setDoc).toHaveBeenCalledWith('users/u-new', {
      email: 'pat@privaterelay.appleid.com',
      displayName: 'Pat Rivera',
      status: 'pending',
      createdAt: 'SERVER_TS',
    });
    // The Google/Apple first sign-in sends no team code.
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/auth/signup-notify', {
      method: 'POST',
      headers: { Authorization: 'Bearer id-token-1' },
    });
    expect(pendingIdTokenForDelete()).toBe('id-token-1');
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(ctx.current).toMatchObject({ user: null, loading: false, error: null, pendingApproval: true });
  });

  it("prefers the account's own name, and falls back to Apple's when that is blank", async () => {
    fb.appleName = 'Apple Name';
    await mount();
    await signInAs(session({ displayName: 'Firebase Name' }));
    expect(vi.mocked(setDoc).mock.calls[0][1]).toMatchObject({ displayName: 'Firebase Name' });

    fb.appleName = 'Apple Name';
    await signInAs(session({ uid: 'u-2', displayName: '   ' }));
    expect(vi.mocked(setDoc).mock.calls[1][1]).toMatchObject({ displayName: 'Apple Name' });
  });

  it('caps the name at 100 characters and leaves it off when there is none', async () => {
    await mount();
    await signInAs(session({ displayName: 'N'.repeat(150) }));
    expect((vi.mocked(setDoc).mock.calls[0][1] as { displayName: string }).displayName).toHaveLength(100);

    await signInAs(session({ uid: 'u-3' }));
    expect(vi.mocked(setDoc).mock.calls[1][1]).toEqual({ email: 'pat@privaterelay.appleid.com', status: 'pending', createdAt: 'SERVER_TS' });
  });

  it('still lands on the pending screen when the token cannot be read (nothing parked, no alert)', async () => {
    await mount();
    await signInAs(session({ getIdToken: vi.fn(async () => Promise.reject(new Error('network'))) }));
    expect(pendingIdTokenForDelete()).toBeNull();
    expect(fetchedUrls()).not.toContain('/api/portal/auth/signup-notify');
    expect(ctx.current).toMatchObject({ pendingApproval: true, error: null });
  });

  it('signs out with the missing-profile message when the profile write is refused', async () => {
    fb.setDocFails = true;
    await mount();
    await signInAs(session());
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(pendingIdTokenForDelete()).toBeNull();
    expect(ctx.current).toMatchObject({
      user: null,
      pendingApproval: false,
      error: 'User profile not found. Please contact an administrator.',
    });
  });
});

describe('an Apple ID that shared no email', () => {
  it('cannot start an account: signed out with a message naming Apple, nothing written', async () => {
    await mount();
    await signInAs(session({ email: null }));
    expect(setDoc).not.toHaveBeenCalled();
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(ctx.current?.error).toBe(
      "Your Apple ID didn't share an email address, so we can't set up your account. Use Google or your company email instead."
    );
    expect(ctx.current?.pendingApproval).toBe(false);
  });

  it('gives any other provider the plain missing-profile message', async () => {
    await mount();
    await signInAs(session({ email: null, providerData: [{ providerId: 'phone' }] }));
    expect(ctx.current?.error).toBe('User profile not found. Please contact an administrator.');
  });
});

describe('a pending account waiting on a role', () => {
  it('parks its ID token, signs out and shows the pending screen; clearPendingApproval drops the token', async () => {
    fb.profile = { email: 'pat@x.com', displayName: 'Pat', status: 'pending' };
    await mount();
    await signInAs(session({ providerData: [{ providerId: 'google.com' }], getIdToken: vi.fn(async () => 'id-pending') }));
    expect(pendingIdTokenForDelete()).toBe('id-pending');
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(ctx.current).toMatchObject({ user: null, pendingApproval: true });
    expect(setDoc).not.toHaveBeenCalled();

    await act(async () => ctx.current!.clearPendingApproval());
    expect(pendingIdTokenForDelete()).toBeNull();
    expect(ctx.current?.pendingApproval).toBe(false);
  });

  it('parks null (not a stale token) when the token read fails', async () => {
    fb.profile = { email: 'pat@x.com', status: 'pending' };
    await mount();
    await signInAs(session({ getIdToken: vi.fn(async () => 'old') }));
    expect(pendingIdTokenForDelete()).toBe('old');
    await signInAs(session({ getIdToken: vi.fn(async () => Promise.reject(new Error('expired'))) }));
    expect(pendingIdTokenForDelete()).toBeNull();
    expect(ctx.current?.pendingApproval).toBe(true);
  });

  it('keeps a pending hire that already has a role signed in (onboarding), with nothing parked', async () => {
    fb.profile = { email: 'pat@x.com', status: 'pending', fieldRole: 'entry_rep' };
    await mount();
    await signInAs(session());
    expect(firebaseSignOut).not.toHaveBeenCalled();
    expect(pendingIdTokenForDelete()).toBeNull();
    expect(ctx.current?.user?.uid).toBe('u-new');
  });
});

describe('team-code signup', () => {
  it('sends the code with the owner alert, parks the token and signs out to the pending screen', async () => {
    const created = session({ uid: 'u-signup', email: 'sam@x.com', getIdToken: vi.fn(async () => 'id-signup') });
    vi.mocked(createUserWithEmailAndPassword).mockResolvedValueOnce({ user: created } as never);
    await mount();
    await act(async () => ctx.current!.signUp('Sam@X.com', 'pw-123456', 'Sam', '3cteam'));
    expect(setDoc).toHaveBeenCalledWith('users/u-signup', { email: 'sam@x.com', displayName: 'Sam', status: 'pending', createdAt: 'SERVER_TS' });
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/auth/signup-notify', {
      method: 'POST',
      headers: { Authorization: 'Bearer id-signup', 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: '3cteam' }),
    });
    expect(pendingIdTokenForDelete()).toBe('id-signup');
    expect(ctx.current).toMatchObject({ pendingApproval: true, loading: false });
  });
});

describe('avatar sync on an active sign-in', () => {
  it("asks the server to copy the provider photo only when it differs from the stored one", async () => {
    fb.profile = { email: 'pat@x.com', status: 'active', fieldRole: 'entry_rep', avatarUrl: 'https://old' };
    await mount();
    await signInAs(session({ photoURL: 'https://new' }));
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/auth/sync-avatar', { method: 'POST', headers: { Authorization: 'Bearer id-token-1' } });

    fetchMock.mockClear();
    fb.profile = { ...fb.profile, avatarUrl: 'https://new' };
    await signInAs(session({ photoURL: 'https://new' }));
    await act(async () => {});
    expect(fetchedUrls()).not.toContain('/api/portal/auth/sync-avatar');
  });
});
