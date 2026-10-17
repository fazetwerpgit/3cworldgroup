import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/config', () => ({ auth: null }));

import type { WebToNativeMessage } from './bridge';
import {
  NATIVE_AUTH_DEBOUNCE_MS,
  NATIVE_AUTH_MIN_INTERVAL_MS,
  createNativeAuthSync,
  startNativeAuthSync,
  type SyncUser,
} from './nativeAuthSync';

let emit: (user: SyncUser | null) => void;
let currentUid: string | null;
let posted: WebToNativeMessage[];
let fetchCustomToken: ReturnType<typeof vi.fn<(idToken: string) => Promise<string | null>>>;
let nativeUid: (string | null)[];
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

beforeEach(() => {
  vi.useFakeTimers();
  currentUid = null;
  posted = [];
  nativeUid = [];
  fetchCustomToken = vi.fn(async (idToken: string) => `custom-${idToken}`);
  stop = createNativeAuthSync({
    subscribe: (cb) => {
      emit = cb;
      return () => {};
    },
    currentUid: () => currentUid,
    fetchCustomToken,
    post: (m) => {
      posted.push(m);
      return true;
    },
    onNativeAuth: (uid) => nativeUid.push(uid),
    now: () => Date.now(),
  });
});

afterEach(() => {
  stop();
  vi.useRealTimers();
});

describe('createNativeAuthSync', () => {
  it('posts nativeAuth with the custom token after the debounce', async () => {
    signIn('u1');
    expect(posted).toEqual([]);
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(fetchCustomToken).toHaveBeenCalledWith('id-u1');
    expect(posted).toEqual([{ type: 'nativeAuth', customToken: 'custom-id-u1' }]);
    expect(nativeUid).toEqual(['u1']);
  });

  it('collapses a burst of token events into one message', async () => {
    signIn('u1');
    signIn('u1');
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(posted).toHaveLength(1);
  });

  it('does not resend for the same uid within the minimum interval, then does', async () => {
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    signIn('u1'); // forced refresh a minute later
    await vi.advanceTimersByTimeAsync(60_000);
    expect(posted).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_MIN_INTERVAL_MS);
    signIn('u1'); // hourly refresh
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(posted).toHaveLength(2);
  });

  it('posts nativeSignOut once on sign-out and once on a signed-out load', async () => {
    signOut(); // first event: loaded signed out
    signOut();
    expect(posted).toEqual([{ type: 'nativeSignOut' }]);
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    signOut();
    expect(posted.map((m) => m.type)).toEqual(['nativeSignOut', 'nativeAuth', 'nativeSignOut']);
    expect(nativeUid).toEqual([null, 'u1', null]);
  });

  it('drops a token that arrives after sign-out', async () => {
    let release!: (token: string) => void;
    fetchCustomToken.mockImplementationOnce(() => new Promise((resolve) => (release = resolve)));
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    signOut();
    release('late-token');
    await vi.runAllTimersAsync();
    expect(posted).toEqual([{ type: 'nativeSignOut' }]);
  });

  it('sends nothing when the server refuses (inactive user)', async () => {
    fetchCustomToken.mockResolvedValueOnce(null);
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(posted).toEqual([]);
    expect(nativeUid).toEqual([]);
  });

  it('re-sends right away for a different account', async () => {
    signIn('u1');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    signIn('u2');
    await vi.advanceTimersByTimeAsync(NATIVE_AUTH_DEBOUNCE_MS);
    expect(posted).toEqual([
      { type: 'nativeAuth', customToken: 'custom-id-u1' },
      { type: 'nativeAuth', customToken: 'custom-id-u2' },
    ]);
  });
});

describe('startNativeAuthSync', () => {
  it('is a no-op outside the app', () => {
    vi.stubGlobal('window', { navigator: { userAgent: 'Mozilla/5.0 Safari/604.1' } });
    expect(typeof startNativeAuthSync()).toBe('function');
    vi.unstubAllGlobals();
  });
});
