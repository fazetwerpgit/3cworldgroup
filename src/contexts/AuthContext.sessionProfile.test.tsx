// @vitest-environment jsdom
//
// Cold open: once Firebase Auth restores the session, the portal paints with
// the profile this device remembered for that account instead of waiting on
// the Firestore read, which then replaces it; no session, another account or
// sign-out clears it.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fb = vi.hoisted(() => ({
  authListener: null as ((user: unknown) => void) | null,
  profile: null as Record<string, unknown> | null,
  hold: null as Promise<void> | null,
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
  getDoc: vi.fn(async () => {
    if (fb.hold) await fb.hold;
    return { exists: () => fb.profile !== null, data: () => fb.profile };
  }),
  onSnapshot: vi.fn(() => () => undefined),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));
vi.mock('@/lib/push/enablePushOnDevice', () => ({ unregisterPushOnDevice: vi.fn(async () => undefined) }));
vi.mock('@/lib/app/nativePush', () => ({ unregisterNativePush: vi.fn(async () => undefined) }));

import { AuthProvider, useAuth } from './AuthContext';
import { readSessionProfile, writeSessionProfile } from '@/lib/auth/sessionProfile';
import { dataCacheGeneration, readDataCache, writeDataCache } from '@/lib/cache/dataCache';
import type { User } from '@/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Seen = { uid: string | null; name: string | null; loading: boolean };
let seen: Seen[] = [];
const handle: { signOut: (() => Promise<void>) | null } = { signOut: null };

function Probe() {
  const ctx = useAuth();
  useEffect(() => {
    handle.signOut = ctx.signOut;
  });
  seen.push({ uid: ctx.user?.uid ?? null, name: ctx.user?.displayName ?? null, loading: ctx.loading });
  return null;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<AuthProvider><Probe /></AuthProvider>));
}

const REP = { uid: 'rep-1', email: 'rep@x.com', displayName: 'Old Name', role: undefined, status: 'active' } as unknown as User;

beforeEach(() => {
  seen = [];
  window.localStorage.clear();
  fb.profile = null;
  fb.hold = null;
  fb.auth.currentUser = null;
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('AuthProvider remembered profile', () => {
  it('waits for auth when nothing is remembered', async () => {
    await mount();
    expect(seen.at(-1)).toEqual({ uid: null, name: null, loading: true });
  });

  it('waits for auth even with a remembered profile (auth.currentUser must be set first)', async () => {
    writeSessionProfile(REP);
    await mount();
    expect(seen.at(-1)).toEqual({ uid: null, name: null, loading: true });
  });

  it('paints the remembered profile as soon as the session is restored, then the read replaces it', async () => {
    writeSessionProfile(REP);
    await mount();
    let release!: () => void;
    fb.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    fb.profile = { email: 'rep@x.com', displayName: 'New Name', status: 'active', fieldRole: 'rep' };
    await act(async () => {
      fb.authListener?.({ uid: 'rep-1', photoURL: null, providerData: [] });
    });
    // The Firestore read is still out: the remembered copy is on screen.
    expect(seen.at(-1)).toEqual({ uid: 'rep-1', name: 'Old Name', loading: false });
    writeDataCache('rep-1', 'probe', 1, dataCacheGeneration());
    await act(async () => release());
    expect(seen.at(-1)).toEqual({ uid: 'rep-1', name: 'New Name', loading: false });
    expect(readSessionProfile()?.displayName).toBe('New Name');
    // Same account confirmed: the first page's cached reads are kept.
    expect(readDataCache('rep-1', 'probe')).toBe(1);
  });

  it('ignores a profile remembered for another account', async () => {
    writeSessionProfile(REP);
    await mount();
    fb.hold = new Promise<void>(() => undefined);
    await act(async () => {
      fb.authListener?.({ uid: 'rep-2', photoURL: null, providerData: [] });
    });
    expect(seen.at(-1)).toEqual({ uid: null, name: null, loading: true });
  });

  it('clears the remembered profile when there is no session', async () => {
    writeSessionProfile(REP);
    await mount();
    await act(async () => fb.authListener?.(null));
    expect(seen.at(-1)).toEqual({ uid: null, name: null, loading: false });
    expect(readSessionProfile()).toBeNull();
  });

  it('drops it when the account is no longer active', async () => {
    writeSessionProfile(REP);
    await mount();
    fb.profile = { email: 'rep@x.com', displayName: 'Old Name', status: 'inactive' };
    await act(async () => fb.authListener?.({ uid: 'rep-1', photoURL: null, providerData: [] }));
    expect(seen.at(-1)?.uid).toBeNull();
    expect(readSessionProfile()).toBeNull();
  });

  it('forgets it on sign-out', async () => {
    writeSessionProfile(REP);
    await mount();
    fb.profile = { email: 'rep@x.com', displayName: 'Old Name', status: 'active', fieldRole: 'rep' };
    await act(async () => fb.authListener?.({ uid: 'rep-1', photoURL: null, providerData: [] }));
    expect(readSessionProfile()).not.toBeNull();
    await act(async () => handle.signOut?.());
    expect(readSessionProfile()).toBeNull();
  });
});

describe('sessionProfile storage', () => {
  it('keeps only an active account and revives its dates', () => {
    writeSessionProfile({ ...REP, hireDate: new Date('2026-01-02T00:00:00Z') } as User);
    expect(readSessionProfile()?.hireDate).toEqual(new Date('2026-01-02T00:00:00Z'));
    writeSessionProfile({ ...REP, status: 'pending' } as User);
    expect(readSessionProfile()).toBeNull();
  });
});
