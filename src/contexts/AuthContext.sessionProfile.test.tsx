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
  fail: false,
  reads: 0,
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
  getDoc: vi.fn(async () => {
    fb.reads += 1;
    if (fb.hold) await fb.hold;
    if (fb.fail) throw new Error('client is offline');
    return { exists: () => fb.profile !== null, data: () => fb.profile };
  }),
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

import { AuthProvider, useAuth } from './AuthContext';
import { readSessionProfile, writeSessionProfile } from '@/lib/auth/sessionProfile';
import { dataCacheGeneration, readDataCache, writeDataCache } from '@/lib/cache/dataCache';
import { preloadOwnerDashboard } from '@/components/portal/owner/preloadOwnerDashboard';
import type { User } from '@/types';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Seen = { uid: string | null; name: string | null; loading: boolean };
let seen: Seen[] = [];
const handle: { signOut: (() => Promise<void>) | null } = { signOut: null };
const flags = { verified: false, failed: false };

function Probe() {
  const ctx = useAuth();
  useEffect(() => {
    handle.signOut = ctx.signOut;
    flags.verified = ctx.profileVerified;
    flags.failed = ctx.profileLoadFailed;
  });
  seen.push({ uid: ctx.user?.uid ?? null, name: ctx.user?.displayName ?? null, loading: ctx.loading });
  return <span data-probe="" />;
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
  fb.fail = false;
  fb.reads = 0;
  fb.snapshot = null;
  fb.auth.currentUser = null;
  flags.verified = false;
  flags.failed = false;
  vi.mocked(preloadOwnerDashboard).mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

const SESSION = { uid: 'rep-1', photoURL: null, providerData: [] };
const FRESH = { email: 'rep@x.com', displayName: 'New Name', status: 'active', fieldRole: 'rep' };
const probeShown = () => container.querySelector('[data-probe]') !== null;

/** Restores the session with every profile read failing, then waits out the in-provider retries (1s + 3s). */
async function restoreWithFailingReads() {
  vi.useFakeTimers();
  fb.fail = true;
  fb.auth.currentUser = SESSION;
  await act(async () => {
    fb.authListener?.(SESSION);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(4100);
  });
}

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
  it('keeps only an active account', () => {
    writeSessionProfile(REP);
    expect(readSessionProfile()?.uid).toBe('rep-1');
    writeSessionProfile({ ...REP, status: 'pending' } as User);
    expect(readSessionProfile()).toBeNull();
  });
});

describe('AuthProvider profile read errors with a remembered profile', () => {
  it('keeps the remembered profile on screen and retries quietly on a backoff', async () => {
    writeSessionProfile(REP);
    await mount();
    await restoreWithFailingReads();
    expect(fb.reads).toBe(3);
    expect(seen.at(-1)).toEqual({ uid: 'rep-1', name: 'Old Name', loading: false });
    expect(flags).toEqual({ verified: false, failed: false });
    expect(probeShown()).toBe(true); // no retry screen in place of the portal
    // The next quiet attempt succeeds.
    fb.fail = false;
    fb.profile = FRESH;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(fb.reads).toBe(4);
    expect(seen.at(-1)).toEqual({ uid: 'rep-1', name: 'New Name', loading: false });
    expect(flags.verified).toBe(true);
    expect(readSessionProfile()?.displayName).toBe('New Name');
  });

  it('backs off between quiet attempts while the reads keep failing', async () => {
    writeSessionProfile(REP);
    await mount();
    await restoreWithFailingReads();
    // Quiet attempt 1 after 5s (3 reads), then the next waits 15s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000 + 4100);
    });
    expect(fb.reads).toBe(6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(fb.reads).toBe(6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000 + 4100);
    });
    expect(fb.reads).toBe(9);
    expect(seen.at(-1)?.uid).toBe('rep-1');
    expect(flags.failed).toBe(false);
  });

  it("retries at once when the device comes back 'online'", async () => {
    writeSessionProfile(REP);
    await mount();
    await restoreWithFailingReads();
    fb.fail = false;
    fb.profile = FRESH;
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(seen.at(-1)?.name).toBe('New Name');
    expect(flags.verified).toBe(true);
  });

  it("is verified by the live listener's first server snapshot", async () => {
    writeSessionProfile(REP);
    await mount();
    await restoreWithFailingReads();
    expect(fb.snapshot).not.toBeNull();
    await act(async () => {
      fb.snapshot?.({ metadata: { fromCache: false }, exists: () => true, data: () => FRESH });
    });
    expect(seen.at(-1)?.name).toBe('New Name');
    expect(flags.verified).toBe(true);
    // The quiet retry is over: no further reads.
    const reads = fb.reads;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(70_000);
    });
    expect(fb.reads).toBe(reads);
  });

  it('still shows the retry screen when nothing was remembered', async () => {
    await mount();
    await restoreWithFailingReads();
    expect(seen.at(-1)?.uid).toBeNull();
    // The retry screen replaces the portal.
    expect(probeShown()).toBe(false);
    expect(container.textContent).toContain('could not load your profile');
  });

  it('still signs out on a missing profile', async () => {
    writeSessionProfile({ ...REP, email: undefined } as unknown as User);
    await mount();
    fb.profile = null;
    await act(async () => fb.authListener?.({ ...SESSION, email: null }));
    expect(seen.at(-1)?.uid).toBeNull();
    expect(readSessionProfile()).toBeNull();
  });
});

describe('profileVerified', () => {
  it('is false on the remembered profile and true once the read lands', async () => {
    writeSessionProfile(REP);
    await mount();
    let release!: () => void;
    fb.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    fb.profile = FRESH;
    await act(async () => {
      fb.authListener?.(SESSION);
    });
    expect(seen.at(-1)?.uid).toBe('rep-1');
    expect(flags.verified).toBe(false);
    await act(async () => release());
    expect(flags.verified).toBe(true);
  });
});

describe('owner dashboard preload', () => {
  it('starts as soon as the remembered profile says owner', async () => {
    writeSessionProfile({ ...REP, role: 'owner' } as User);
    await mount();
    expect(preloadOwnerDashboard).toHaveBeenCalled();
  });

  it('never for a rep', async () => {
    writeSessionProfile(REP);
    await mount();
    fb.profile = FRESH;
    await act(async () => fb.authListener?.(SESSION));
    expect(preloadOwnerDashboard).not.toHaveBeenCalled();
  });
});

describe('sessionProfile allowlist', () => {
  const FULL = {
    ...REP,
    fieldRole: 'rep',
    isIBO: false,
    avatarUrl: 'https://x/a.png',
    pushRequired: true,
    territoryId: 't1',
    reportsToId: 'm1',
    phone: '555-0100',
    address: '1 Main St',
    city: 'Austin',
    state: 'TX',
    zip: '78701',
    shirtSize: 'L',
    hireDate: new Date('2026-01-02T00:00:00Z'),
  } as unknown as User;
  const PRIVATE = ['phone', 'address', 'city', 'state', 'zip', 'shirtSize', 'hireDate'];
  const storedUser = () =>
    (JSON.parse(window.localStorage.getItem('3c.portal.sessionProfile.v1') ?? '{}') as { user: Record<string, unknown> })
      .user;

  it('stores only the shell fields', () => {
    writeSessionProfile(FULL);
    expect(Object.keys(storedUser()).sort()).toEqual(
      ['avatarUrl', 'displayName', 'email', 'fieldRole', 'isIBO', 'pushRequired', 'reportsToId', 'status', 'territoryId', 'uid'].sort()
    );
    const read = readSessionProfile() as unknown as Record<string, unknown>;
    for (const key of PRIVATE) expect(read[key]).toBeUndefined();
    expect(read.territoryId).toBe('t1');
  });

  it('strips an old full entry on read and rewrites storage without it', () => {
    window.localStorage.setItem(
      '3c.portal.sessionProfile.v1',
      JSON.stringify({ v: 1, user: JSON.parse(JSON.stringify(FULL)) })
    );
    const read = readSessionProfile() as unknown as Record<string, unknown>;
    expect(read.uid).toBe('rep-1');
    for (const key of PRIVATE) {
      expect(read[key]).toBeUndefined();
      expect(storedUser()[key]).toBeUndefined();
    }
  });
});
