// @vitest-environment jsdom
//
// Every path to a signed-out state drops the per-tab state of the account that
// left (saved e-sign signature, View as, Ask conversation) and, while the
// session can still prove it, the device's push registration — not only the
// explicit signOut().
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({
  authListener: null as ((user: unknown) => void) | null,
  profile: null as Record<string, unknown> | null,
  snapshot: null as ((snap: unknown) => void) | null,
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
  sendEmailVerification: vi.fn(),
  updateProfile: vi.fn(),
  updatePassword: vi.fn(),
  reauthenticateWithCredential: vi.fn(),
  EmailAuthProvider: { credential: vi.fn() },
}));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...path: string[]) => path.join('/'),
  getDoc: vi.fn(async () => ({ exists: () => fb.profile !== null, data: () => fb.profile })),
  onSnapshot: vi.fn((_ref: unknown, next: (snap: unknown) => void) => {
    fb.snapshot = next;
    return () => {
      if (fb.snapshot === next) fb.snapshot = null;
    };
  }),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock('@/lib/push/enablePushOnDevice', () => ({ unregisterPushOnDevice: vi.fn(async () => undefined) }));
vi.mock('@/lib/app/nativePush', () => ({ unregisterNativePush: vi.fn(async () => undefined) }));
vi.mock('@/components/portal/owner/preloadOwnerDashboard', () => ({ preloadOwnerDashboard: vi.fn() }));

import { signOut as firebaseSignOut } from 'firebase/auth';
import { AuthProvider } from './AuthContext';
import { loadSignature, saveSignature } from '@/components/esign/signatureStore';
import { ASK_CONVERSATION_KEY } from '@/lib/ask/chat';
import { PRACTICE_SESSION_KEY } from '@/lib/ask/practiceSessionKey';
import { VIEW_AS_STORAGE_KEY } from '@/lib/viewAs/storage';
import { unregisterPushOnDevice } from '@/lib/push/enablePushOnDevice';
import { unregisterNativePush } from '@/lib/app/nativePush';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AuthProvider><span /></AuthProvider>));
}

const SESSION = { uid: 'rep-a', photoURL: null, providerData: [] };
const ACTIVE = { email: 'a@x.com', displayName: 'Rep A', status: 'active', fieldRole: 'rep' };

function seedDeviceState() {
  saveSignature({ png: 'data:image/png;base64,AAAA', method: 'draw' });
  window.sessionStorage.setItem(ASK_CONVERSATION_KEY, '{"uid":"rep-a"}');
  window.sessionStorage.setItem(PRACTICE_SESSION_KEY, '{"uid":"rep-a"}');
  window.sessionStorage.setItem(VIEW_AS_STORAGE_KEY, '{"uid":"rep-b"}');
}

function expectDeviceStateCleared() {
  expect(loadSignature()).toBeNull();
  expect(window.sessionStorage.getItem(ASK_CONVERSATION_KEY)).toBeNull();
  expect(window.sessionStorage.getItem(PRACTICE_SESSION_KEY)).toBeNull();
  expect(window.sessionStorage.getItem(VIEW_AS_STORAGE_KEY)).toBeNull();
}

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  fb.profile = null;
  fb.snapshot = null;
  fb.auth.currentUser = null;
  vi.mocked(firebaseSignOut).mockClear();
  vi.mocked(unregisterPushOnDevice).mockClear();
  vi.mocked(unregisterNativePush).mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('AuthProvider device cleanup on implicit sign-outs', () => {
  it('clears it and unregisters push when an admin deactivates the open session', async () => {
    await mount();
    fb.profile = ACTIVE;
    fb.auth.currentUser = SESSION;
    await act(async () => fb.authListener?.(SESSION));
    seedDeviceState();
    await act(async () =>
      fb.snapshot?.({
        metadata: { fromCache: false },
        exists: () => true,
        data: () => ({ ...ACTIVE, status: 'inactive' }),
      })
    );
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(unregisterPushOnDevice).toHaveBeenCalledTimes(1);
    expect(unregisterNativePush).toHaveBeenCalledTimes(1);
    // Push goes while the session can still prove whose registration it is.
    expect(vi.mocked(unregisterPushOnDevice).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(firebaseSignOut).mock.invocationCallOrder[0]
    );
    expectDeviceStateCleared();
  });

  it('clears it and unregisters push when the profile read finds a disabled account', async () => {
    await mount();
    seedDeviceState();
    fb.profile = { ...ACTIVE, status: 'inactive' };
    fb.auth.currentUser = SESSION;
    await act(async () => fb.authListener?.(SESSION));
    expect(firebaseSignOut).toHaveBeenCalledTimes(1);
    expect(unregisterPushOnDevice).toHaveBeenCalledTimes(1);
    expectDeviceStateCleared();
  });

  it('clears it when Firebase ends the session on its own', async () => {
    await mount();
    fb.profile = ACTIVE;
    fb.auth.currentUser = SESSION;
    await act(async () => fb.authListener?.(SESSION));
    seedDeviceState();
    // Refresh token revoked / auth account deleted: Firebase reports no user.
    fb.auth.currentUser = null;
    await act(async () => fb.authListener?.(null));
    expectDeviceStateCleared();
  });

  it('keeps a signed-out visitor’s signature on a cold open with no session (onboard link)', async () => {
    await mount();
    saveSignature({ png: 'data:image/png;base64,BBBB', method: 'type' });
    await act(async () => fb.authListener?.(null));
    expect(loadSignature()?.png).toBe('data:image/png;base64,BBBB');
  });
});
