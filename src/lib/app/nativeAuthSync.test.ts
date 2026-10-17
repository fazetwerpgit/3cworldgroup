import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: null }));

import type { NativeAuthStatus } from './nativeChat';
import {
  NATIVE_AUTH_DEBOUNCE_MS,
  NATIVE_AUTH_MIN_INTERVAL_MS,
  createNativeAuthSync,
  startNativeAuthSync,
  type SyncUser,
} from './nativeAuthSync';

let emit: (user: SyncUser | null) => void;
let capsListener: () => void;
let currentUid: string | null;
let canSync: boolean;
let log: string[];
let statuses: [NativeAuthStatus, string | null | undefined][];
let fetchCustomToken: ReturnType<typeof vi.fn<(idToken: string) => Promise<string | null>>>;
let sendNativeAuth: ReturnType<typeof vi.fn<(customToken: string) => Promise<string | null>>>;
let stop: () => void;

function user(uid: string): SyncUser {
  return { uid, getIdToken: async () => `id-${uid}` };
}
function signIn(uid: string) {
  currentUid = uid;
  emit(user(uid));
}
function signOut() {
  currentUid = null;
  emit(null);
}
const lastStatus = () => statuses[statuses.length - 1];

function start() {
  stop = createNativeAuthSync({
    subscribe: (cb) => {
      emit = cb;
      return () => {};
    },
    currentUid: () => currentUid,
    canSync: () => canSync,
    onCanSyncChange: (cb) => {
      capsListener = cb;
      return () => {};
    },
    fetchCustomToken,
    sendNativeAuth,
    postSignOut: () => log.push('signOut'),
    setStatus: (status, uid) => statuses.push([status, uid]),
    now: () => Date.now(),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  currentUid = null;
  canSync = true;
  log = [];
  statuses = [];
  fetchCustomToken = vi.fn(async (idToken: string) => `custom-${idToken}`);
  // The shell signs in as the token's user and echoes that uid in its ok reply.
  sendNativeAuth = vi.fn(async (token: string) => {
    log.push(`auth:${token}`);
    return token.replace(/^custom-id-/, '');
  });
  start();
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('createNativeAuthSync', () => {
  it('sends the first event after a page load at once, and marks ok only on the reply', async () => {
    signIn('u1');
    expect(lastStatus()).toEqual(['pending', undefined]);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchCustomToken).toHaveBeenCalledWith('id-u1');
    expect(log).toEqual(['auth:custom-id-u1']);
    expect(lastStatus()).toEqual(['ok', 'u1']);
  });

  it('debounces later events and collapses a burst', async () => {
    signIn('u1');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_MIN_INTERVAL_MS);
    signIn('u1');
    signIn('u1');
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS - 1);
    expect(sendNativeAuth).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sendNativeAuth).toHaveBeenCalledTimes(2);
  });

  it('does not resend for the same uid within the minimum interval', async () => {
    signIn('u1');
    await vi.advanceTimersByTimeAsync(0);
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(sendNativeAuth).toHaveBeenCalledTimes(1);
  });

  it('marks failed (no uid) when the shell refuses', async () => {
    sendNativeAuth.mockResolvedValueOnce(null);
    signIn('u1');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastStatus()).toEqual(['failed', undefined]);
  });

  it('marks failed when the ok reply names a different uid than the web user', async () => {
    sendNativeAuth.mockResolvedValueOnce('someone-else');
    signIn('u1');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastStatus()).toEqual(['failed', undefined]);
    expect(statuses.some(([status]) => status === 'ok')).toBe(false);
  });

  it('marks ok, for that uid, only when the reply uid matches the web user', async () => {
    signIn('u1');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastStatus()).toEqual(['ok', 'u1']);
  });

  it('marks failed when the server refuses (inactive user)', async () => {
    fetchCustomToken.mockResolvedValueOnce(null);
    signIn('u1');
    await vi.advanceTimersByTimeAsync(0);
    expect(sendNativeAuth).not.toHaveBeenCalled();
    expect(lastStatus()).toEqual(['failed', undefined]);
  });

  it('fetches nothing without the bridge + nativeChat, then syncs when nativeChat arrives', async () => {
    canSync = false;
    stop();
    start();
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(fetchCustomToken).not.toHaveBeenCalled();
    canSync = true;
    capsListener();
    await vi.advanceTimersByTimeAsync(0);
    expect(log).toEqual(['auth:custom-id-u1']);
    capsListener(); // no transition: no resend
    await vi.advanceTimersByTimeAsync(0);
    expect(sendNativeAuth).toHaveBeenCalledTimes(1);
  });

  it('posts nativeSignOut once on sign-out and once on a signed-out load', async () => {
    signOut();
    signOut();
    expect(log).toEqual(['signOut']);
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    signOut();
    expect(log).toEqual(['signOut', 'auth:custom-id-u1', 'signOut']);
    expect(lastStatus()).toEqual(['signedOut', undefined]);
  });

  it('drops a token that arrives after sign-out', async () => {
    let release!: (token: string) => void;
    fetchCustomToken.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    signIn('u1');
    await vi.advanceTimersByTimeAsync(0);
    signOut();
    release('late-token');
    await vi.runAllTimersAsync();
    expect(log).toEqual(['signOut']);
    expect(sendNativeAuth).not.toHaveBeenCalled();
  });

  it('A -> B: signs the shell out before fetching for B; B failing leaves no native user', async () => {
    signIn('a');
    await vi.advanceTimersByTimeAsync(0);
    expect(lastStatus()).toEqual(['ok', 'a']);
    fetchCustomToken.mockImplementationOnce(async () => {
      log.push('fetch:b');
      return null;
    });
    signIn('b');
    // Signed out and marked pending (uid cleared) before any fetch for b.
    expect(log).toEqual(['auth:custom-id-a', 'signOut']);
    expect(lastStatus()).toEqual(['pending', undefined]);
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(log).toEqual(['auth:custom-id-a', 'signOut', 'fetch:b']);
    expect(lastStatus()).toEqual(['failed', undefined]);
  });

  it('A -> B while A is still in flight: B is not blocked', async () => {
    let releaseA!: (token: string) => void;
    fetchCustomToken.mockImplementationOnce(() => new Promise((resolve) => (releaseA = resolve)));
    signIn('a');
    await vi.advanceTimersByTimeAsync(0);
    signIn('b');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    releaseA('token-a');
    await vi.runAllTimersAsync();
    expect(log).toEqual(['auth:custom-id-b']);
    expect(lastStatus()).toEqual(['ok', 'b']);
  });
});

describe('startNativeAuthSync', () => {
  it('is a no-op outside the app', () => {
    vi.stubGlobal('window', { navigator: { userAgent: 'Mozilla/5.0 Safari/604.1' } });
    expect(typeof startNativeAuthSync()).toBe('function');
    vi.unstubAllGlobals();
  });
});
