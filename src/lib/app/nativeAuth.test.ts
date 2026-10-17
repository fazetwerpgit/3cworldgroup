import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthCredential, User as FirebaseUser } from 'firebase/auth';
import { NativeBridgeError, __resetBridgeForTests, receiveNativeMessage } from './bridge';
import {
  APPLE_NOT_READY_MESSAGE,
  clearPendingLink,
  completePendingLink,
  credentialFromNativeResult,
  displayNameFromAppleName,
  emailFromAuthError,
  generateRawNonce,
  getNativeCredential,
  isAccountExistsError,
  isNativeSignInCanceled,
  isNativeSignInPending,
  linkedMethodRows,
  nativeAuthErrorMessage,
  peekPendingLink,
  rememberPendingDisplayName,
  rememberPendingLink,
  sha256Hex,
  takePendingDisplayName,
} from './nativeAuth';

describe('nonce', () => {
  it('makes random nonces of the asked length', () => {
    const a = generateRawNonce();
    const b = generateRawNonce();
    expect(a).toHaveLength(32);
    expect(a).not.toBe(b);
    expect(generateRawNonce(48)).toHaveLength(48);
  });

  it('hashes with SHA-256 to lowercase hex', async () => {
    // Known vector: SHA-256("abc").
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('credentialFromNativeResult', () => {
  it('builds a Google credential from the ID token', () => {
    const cred = credentialFromNativeResult({ provider: 'google', idToken: 'g-id' }, null);
    expect(cred.providerId).toBe('google.com');
    expect((cred as unknown as { idToken: string }).idToken).toBe('g-id');
  });

  it('builds an Apple credential with the RAW nonce the web kept', () => {
    const cred = credentialFromNativeResult({ provider: 'apple', idToken: 'a-id' }, 'raw-nonce');
    expect(cred.providerId).toBe('apple.com');
    expect(cred.toJSON()).toMatchObject({ idToken: 'a-id', nonce: 'raw-nonce' });
  });

  it('refuses an Apple result without a nonce, or any result without a token', () => {
    expect(() => credentialFromNativeResult({ provider: 'apple', idToken: 'a-id' }, null)).toThrow(NativeBridgeError);
    expect(() => credentialFromNativeResult({ provider: 'google', idToken: '' }, null)).toThrow(NativeBridgeError);
  });
});

describe('getNativeCredential (Apple)', () => {
  beforeEach(() => {
    __resetBridgeForTests();
    const posted: string[] = [];
    vi.stubGlobal('window', {
      navigator: { userAgent: 'Mozilla/5.0 (iPhone) 3CPortalApp/1.0.0' },
      addEventListener: () => {},
      ReactNativeWebView: {
        postMessage: (m: string) => {
          posted.push(m);
          const msg = JSON.parse(m);
          // The shell echoes what it was asked for; the test reads it back below.
          queueMicrotask(() =>
            receiveNativeMessage({
              source: '3c-shell',
              type: 'reply',
              id: msg.id,
              ok: true,
              result: { provider: 'apple', idToken: 'apple-id-token', fullName: { givenName: 'Ana', familyName: 'Ruiz' } },
            })
          );
        },
      },
      __posted: posted,
    });
    vi.stubGlobal('document', { addEventListener: () => {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('sends only the hashed nonce to the shell and signs in with the raw one', async () => {
    const native = await getNativeCredential('apple');
    const sent = JSON.parse((window as unknown as { __posted: string[] }).__posted[0]);
    expect(sent).toMatchObject({ type: 'nativeSignIn', provider: 'apple' });
    const rawNonce = (native.credential.toJSON() as { nonce: string }).nonce;
    expect(rawNonce).toHaveLength(32);
    expect(sent.nonce).toBe(await sha256Hex(rawNonce));
    expect(sent.nonce).not.toBe(rawNonce);
    expect(native.displayName).toBe('Ana Ruiz');
  });

  it('drops a second call while one is pending with a silent canceled', async () => {
    const first = getNativeCredential('apple');
    expect(isNativeSignInPending()).toBe(true);
    const second = getNativeCredential('google');
    await expect(second).rejects.toSatisfy(isNativeSignInCanceled);
    await expect(first).resolves.toMatchObject({ provider: 'apple' });
    expect(isNativeSignInPending()).toBe(false);
    expect((window as unknown as { __posted: string[] }).__posted).toHaveLength(1);
  });
});

describe('isNativeSignInCanceled', () => {
  it('is true only for a canceled bridge error', () => {
    expect(isNativeSignInCanceled(new NativeBridgeError('canceled', 'x'))).toBe(true);
    expect(isNativeSignInCanceled(new NativeBridgeError('failed', 'x'))).toBe(false);
    expect(isNativeSignInCanceled(new Error('canceled'))).toBe(false);
  });
});

describe('displayNameFromAppleName', () => {
  it('joins the parts Apple shared', () => {
    expect(displayNameFromAppleName({ givenName: ' Ana ', familyName: 'Ruiz' })).toBe('Ana Ruiz');
    expect(displayNameFromAppleName({ givenName: 'Ana', familyName: null })).toBe('Ana');
  });

  it('is undefined when Apple shared no name (every sign-in after the first)', () => {
    expect(displayNameFromAppleName(null)).toBeUndefined();
    expect(displayNameFromAppleName({ givenName: '', familyName: '  ' })).toBeUndefined();
  });
});

describe('pending display name', () => {
  it('is taken once', () => {
    rememberPendingDisplayName('Ana Ruiz');
    expect(takePendingDisplayName()).toBe('Ana Ruiz');
    expect(takePendingDisplayName()).toBeUndefined();
  });
});

describe('nativeAuthErrorMessage', () => {
  it('explains that Sign in with Apple is not set up, from the shell or from Firebase', () => {
    expect(nativeAuthErrorMessage(new NativeBridgeError('not_configured', 'x'), 'apple')).toBe(APPLE_NOT_READY_MESSAGE);
    expect(nativeAuthErrorMessage({ code: 'auth/operation-not-allowed' }, 'apple')).toBe(APPLE_NOT_READY_MESSAGE);
    expect(nativeAuthErrorMessage({ code: 'auth/invalid-credential' }, 'apple')).toBe(APPLE_NOT_READY_MESSAGE);
  });

  it('maps cancel, timeout, old shells and duplicate links', () => {
    expect(nativeAuthErrorMessage(new NativeBridgeError('canceled', 'x'), 'google')).toBe('Sign-in was cancelled.');
    expect(nativeAuthErrorMessage(new NativeBridgeError('timeout', 'x'), 'google')).toMatch(/did not finish/);
    expect(nativeAuthErrorMessage(new NativeBridgeError('unsupported', 'x'), 'apple')).toMatch(/Update the 3C app/);
    expect(nativeAuthErrorMessage({ code: 'auth/credential-already-in-use' }, 'apple')).toMatch(
      /Apple account is already used by a different portal account/
    );
  });

  it('falls back to the shared friendly messages', () => {
    expect(nativeAuthErrorMessage({ code: 'auth/user-disabled' }, 'google')).toMatch(/disabled/);
  });
});

describe('account-exists linking', () => {
  const credential = { providerId: 'apple.com' } as AuthCredential;
  const user = { uid: 'u1' } as FirebaseUser;

  beforeEach(() => clearPendingLink());

  it('recognizes the account-exists error and its email', () => {
    const err = { code: 'auth/account-exists-with-different-credential', customData: { email: 'rep@x.com' } };
    expect(isAccountExistsError(err)).toBe(true);
    expect(emailFromAuthError(err)).toBe('rep@x.com');
    expect(isAccountExistsError({ code: 'auth/user-disabled' })).toBe(false);
    expect(emailFromAuthError({})).toBeNull();
  });

  it('links the held credential to the account signed in with the existing method, once', async () => {
    rememberPendingLink({ provider: 'apple', credential, email: 'rep@x.com' });
    const link = vi.fn().mockResolvedValue({});
    expect(await completePendingLink(user, link)).toEqual({ status: 'linked', provider: 'apple' });
    expect(link).toHaveBeenCalledWith(user, credential);
    expect(peekPendingLink()).toBeNull();
    expect(await completePendingLink(user, link)).toEqual({ status: 'none' });
    expect(link).toHaveBeenCalledTimes(1);
  });

  it('treats provider-already-linked as linked', async () => {
    rememberPendingLink({ provider: 'apple', credential, email: null });
    const link = vi.fn().mockRejectedValue({ code: 'auth/provider-already-linked' });
    expect(await completePendingLink(user, link)).toEqual({ status: 'linked', provider: 'apple' });
  });

  it('reports a failed link and still clears it', async () => {
    rememberPendingLink({ provider: 'apple', credential, email: null });
    const link = vi.fn().mockRejectedValue({ code: 'auth/credential-already-in-use' });
    const outcome = await completePendingLink(user, link);
    expect(outcome.status).toBe('failed');
    expect(peekPendingLink()).toBeNull();
  });
});

describe('linkedMethodRows', () => {
  it('offers Apple only in the app', () => {
    expect(linkedMethodRows(['google.com'], false).map((r) => r.id)).toEqual(['google.com', 'password']);
    const app = linkedMethodRows(['google.com'], true);
    expect(app.map((r) => r.id)).toEqual(['google.com', 'apple.com', 'password']);
    expect(app.find((r) => r.id === 'apple.com')).toMatchObject({ linked: false, canLink: true });
  });

  it('shows an already-linked Apple on the web so it can be removed, but never offers linking it there', () => {
    const rows = linkedMethodRows(['google.com', 'apple.com'], false);
    expect(rows.find((r) => r.id === 'apple.com')).toMatchObject({ linked: true, canLink: false, canUnlink: true });
  });

  it('never lets the last method be unlinked', () => {
    const rows = linkedMethodRows(['password'], true);
    expect(rows.find((r) => r.id === 'password')).toMatchObject({ linked: true, canUnlink: false });
    expect(rows.find((r) => r.id === 'google.com')).toMatchObject({ linked: false, canLink: true, canUnlink: false });
  });

  it('ignores providers it does not manage when counting', () => {
    const rows = linkedMethodRows(['google.com', 'phone'], true);
    expect(rows.find((r) => r.id === 'google.com')?.canUnlink).toBe(false);
  });
});
