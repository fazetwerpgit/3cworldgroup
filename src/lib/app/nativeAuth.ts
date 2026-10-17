import {
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  linkWithCredential,
  type AuthCredential,
  type User as FirebaseUser,
} from 'firebase/auth';
import { friendlyAuthError } from '@/lib/auth/friendlyAuthError';
import { NativeBridgeError, requestNative, type NativeSignInProvider, type NativeSignInResult } from './bridge';

// Native Google + Sign in with Apple for the 3C Portal app (SPEC A2).
//
// The WebView cannot run signInWithPopup, so in the app the shell runs the
// native sign-in sheet and hands back an ID token; the web turns it into a
// Firebase credential and signs in with signInWithCredential. For Apple the web
// makes the nonce: it keeps the raw value and sends only its SHA-256 to the
// shell, which passes that to Apple. Firebase checks the raw nonce against the
// hashed one inside Apple's ID token.

export const APPLE_PROVIDER_ID = 'apple.com';
export const GOOGLE_PROVIDER_ID = 'google.com';
export const PASSWORD_PROVIDER_ID = 'password';

const NONCE_CHARSET = '0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._';

/** A random nonce from the browser's CSPRNG. */
export function generateRawNonce(length = 32): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) out += NONCE_CHARSET[byte % NONCE_CHARSET.length];
  return out;
}

/** SHA-256 of a string, lowercase hex: the form Apple and Firebase expect. */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Turns the shell's sign-in result into a Firebase credential. */
export function credentialFromNativeResult(result: NativeSignInResult, rawNonce: string | null): AuthCredential {
  if (!result || typeof result.idToken !== 'string' || !result.idToken) {
    throw new NativeBridgeError('failed', 'The app returned no sign-in token.');
  }
  if (result.provider === 'google') {
    return GoogleAuthProvider.credential(result.idToken, result.accessToken ?? null);
  }
  if (result.provider === 'apple') {
    if (!rawNonce) throw new NativeBridgeError('failed', 'Missing sign-in nonce.');
    return new OAuthProvider(APPLE_PROVIDER_ID).credential({ idToken: result.idToken, rawNonce });
  }
  throw new NativeBridgeError('failed', 'Unknown sign-in provider.');
}

/** "Given Family" from Apple's first-authorization name, or undefined. */
export function displayNameFromAppleName(
  fullName: { givenName?: string | null; familyName?: string | null } | null | undefined
): string | undefined {
  if (!fullName) return undefined;
  const name = [fullName.givenName, fullName.familyName]
    .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
    .map((part) => part.trim())
    .join(' ')
    .slice(0, 100);
  return name || undefined;
}

export interface NativeCredential {
  provider: NativeSignInProvider;
  credential: AuthCredential;
  /** Apple's name on first authorization (Google's comes on the Firebase user). */
  displayName?: string;
}

let nativeSignInPending = false;

/** A native sign-in sheet is open (or being asked for). A second tap should do nothing. */
export function isNativeSignInPending(): boolean {
  return nativeSignInPending;
}

/** The person (or a second, dropped tap) cancelled: show nothing. */
export function isNativeSignInCanceled(err: unknown): boolean {
  return err instanceof NativeBridgeError && err.code === 'canceled';
}

/**
 * Runs the shell's native sign-in sheet and returns a Firebase credential.
 * One at a time: a call while one is pending is dropped with `canceled`
 * (callers check isNativeSignInPending() first and ignore `canceled`).
 */
export async function getNativeCredential(provider: NativeSignInProvider): Promise<NativeCredential> {
  if (nativeSignInPending) throw new NativeBridgeError('canceled', 'A sign-in is already open.');
  nativeSignInPending = true;
  try {
    return await runNativeSignIn(provider);
  } finally {
    nativeSignInPending = false;
  }
}

async function runNativeSignIn(provider: NativeSignInProvider): Promise<NativeCredential> {
  if (provider === 'apple') {
    const rawNonce = generateRawNonce();
    const nonce = await sha256Hex(rawNonce);
    const result = await requestNative<'nativeSignIn'>({ type: 'nativeSignIn', provider, nonce });
    if (result?.provider !== 'apple') throw new NativeBridgeError('failed', 'The app answered for the wrong provider.');
    return {
      provider,
      credential: credentialFromNativeResult(result, rawNonce),
      displayName: displayNameFromAppleName(result.fullName),
    };
  }
  const result = await requestNative<'nativeSignIn'>({ type: 'nativeSignIn', provider });
  if (result?.provider !== 'google') throw new NativeBridgeError('failed', 'The app answered for the wrong provider.');
  return { provider, credential: credentialFromNativeResult(result, null) };
}

function codeOf(err: unknown): string {
  return err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
}

export function isAccountExistsError(err: unknown): boolean {
  return codeOf(err) === 'auth/account-exists-with-different-credential';
}

/** The email Firebase attached to an account-exists error, if any. */
export function emailFromAuthError(err: unknown): string | null {
  const data = err && typeof err === 'object' ? (err as { customData?: { email?: unknown } }).customData : undefined;
  return typeof data?.email === 'string' && data.email ? data.email : null;
}

export function providerLabel(provider: NativeSignInProvider | string): string {
  if (provider === 'apple' || provider === APPLE_PROVIDER_ID) return 'Apple';
  if (provider === 'google' || provider === GOOGLE_PROVIDER_ID) return 'Google';
  return 'email and password';
}

export const APPLE_NOT_READY_MESSAGE =
  "Sign in with Apple isn't set up yet. Use Google or your email and password for now.";

/** Plain-language message for a failed native sign-in or link. */
export function nativeAuthErrorMessage(err: unknown, provider: NativeSignInProvider): string {
  const code = codeOf(err);
  if (err instanceof NativeBridgeError) {
    if (err.code === 'canceled') return 'Sign-in was cancelled.';
    if (err.code === 'not_configured') {
      return provider === 'apple' ? APPLE_NOT_READY_MESSAGE : `${providerLabel(provider)} sign-in isn't set up in the app yet.`;
    }
    if (err.code === 'timeout') return 'The app did not finish signing in. Try again.';
    if (err.code === 'no_bridge' || err.code === 'unsupported') return 'Update the 3C app to use this sign-in.';
    return err.message || 'Sign-in failed. Try again.';
  }
  // Firebase: the Apple provider is not enabled (no Services ID / key yet), or
  // its config cannot validate Apple's token.
  if (
    provider === 'apple' &&
    (code === 'auth/operation-not-allowed' ||
      code === 'auth/configuration-not-found' ||
      code === 'auth/invalid-credential' ||
      code === 'auth/invalid-oauth-client-id')
  ) {
    return APPLE_NOT_READY_MESSAGE;
  }
  if (code === 'auth/credential-already-in-use') {
    return `That ${providerLabel(provider)} account is already used by a different portal account.`;
  }
  if (code === 'auth/provider-already-linked') return `${providerLabel(provider)} is already linked.`;
  if (code === 'auth/requires-recent-login') return 'For your security, sign out and back in, then try again.';
  return friendlyAuthError(err);
}

// ---- account linking -----------------------------------------------------
// A native sign-in whose email already belongs to an account with another
// method fails with account-exists-with-different-credential. The credential
// is held here (memory only, this tab) until the person signs in with their
// existing method; then it is linked to that account, so the next native
// sign-in lands on the same account instead of making a duplicate.

export interface PendingLink {
  provider: NativeSignInProvider;
  credential: AuthCredential;
  email: string | null;
}

let pendingLink: PendingLink | null = null;

export function rememberPendingLink(link: PendingLink): void {
  pendingLink = link;
}
export function peekPendingLink(): PendingLink | null {
  return pendingLink;
}
export function clearPendingLink(): void {
  pendingLink = null;
}

export type LinkOutcome = { status: 'none' } | { status: 'linked'; provider: NativeSignInProvider } | { status: 'failed'; message: string };

/** Links a held credential to the account just signed in to. Clears it either way. */
export async function completePendingLink(
  user: FirebaseUser,
  link: (user: FirebaseUser, credential: AuthCredential) => Promise<unknown> = linkWithCredential
): Promise<LinkOutcome> {
  const held = pendingLink;
  if (!held) return { status: 'none' };
  pendingLink = null;
  try {
    await link(user, held.credential);
    return { status: 'linked', provider: held.provider };
  } catch (err) {
    if (codeOf(err) === 'auth/provider-already-linked') return { status: 'linked', provider: held.provider };
    return { status: 'failed', message: nativeAuthErrorMessage(err, held.provider) };
  }
}

// Apple shares the person's name only on the first authorization, before the
// Firebase user exists. The sign-in flow parks it here and AuthContext's
// first-sign-in path (pending users doc) takes it.
let pendingDisplayName: string | null = null;

export function rememberPendingDisplayName(name: string | undefined): void {
  pendingDisplayName = name?.trim() ? name.trim().slice(0, 100) : null;
}
export function takePendingDisplayName(): string | undefined {
  const name = pendingDisplayName ?? undefined;
  pendingDisplayName = null;
  return name;
}

// ---- linked sign-in methods (Settings) -----------------------------------

export type SignInMethodId = typeof GOOGLE_PROVIDER_ID | typeof APPLE_PROVIDER_ID | typeof PASSWORD_PROVIDER_ID;

export interface LinkedMethodRow {
  id: SignInMethodId;
  label: string;
  linked: boolean;
  canLink: boolean;
  canUnlink: boolean;
}

/**
 * The rows Settings shows. Apple can only be linked in the app (no web Apple
 * flow); on the web it appears only once linked, so it can still be removed.
 * The last remaining method can never be unlinked.
 */
export function linkedMethodRows(providerIds: readonly string[], inApp: boolean): LinkedMethodRow[] {
  const has = (id: string) => providerIds.includes(id);
  const known: SignInMethodId[] = [GOOGLE_PROVIDER_ID, APPLE_PROVIDER_ID, PASSWORD_PROVIDER_ID];
  const linkedCount = known.filter(has).length;
  const labels: Record<SignInMethodId, string> = {
    [GOOGLE_PROVIDER_ID]: 'Google',
    [APPLE_PROVIDER_ID]: 'Apple',
    [PASSWORD_PROVIDER_ID]: 'Email and password',
  };
  return known
    .filter((id) => id !== APPLE_PROVIDER_ID || inApp || has(id))
    .map((id) => ({
      id,
      label: labels[id],
      linked: has(id),
      canLink: !has(id) && (id !== APPLE_PROVIDER_ID || inApp),
      canUnlink: has(id) && linkedCount > 1,
    }));
}

/** Credential for adding a password to an account that signs in with Google/Apple. */
export function passwordCredential(email: string, password: string): AuthCredential {
  return EmailAuthProvider.credential(email, password);
}
