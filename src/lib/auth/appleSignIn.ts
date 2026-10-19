import { createPrivateKey, sign } from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

// Sign in with Apple token revocation (App Store guideline 5.1.1(v)).
//
// When the 3C iOS app signs someone in with Apple, the shell passes Apple's
// one-time authorizationCode to the web, which posts it to
// /api/portal/auth/apple-token. That route swaps it here for a refresh token
// and keeps it server-side only (users/{uid}/private/appleAuth: no client
// rule matches it, so Firestore's default deny keeps it unreadable). When the
// person deletes their account, DELETE /api/portal/auth/me revokes that token
// with Apple, so the app disappears from their Apple ID's "Sign in with Apple"
// list. Everything here is best effort: a missing config or an Apple error is
// logged and never blocks a sign-in or a delete.

export const APPLE_TOKEN_URL = 'https://appleid.apple.com/auth/token';
export const APPLE_REVOKE_URL = 'https://appleid.apple.com/auth/revoke';
const APPLE_AUDIENCE = 'https://appleid.apple.com';
/** The iOS app's bundle id: the client_id for codes issued to the native sheet. */
export const DEFAULT_APPLE_CLIENT_ID = 'com.threecworldgroup.portal';
/** Client secrets are made per call, so a short life is enough (Apple allows up to 6 months). */
const CLIENT_SECRET_TTL_SECONDS = 300;
const APPLE_TIMEOUT_MS = 10_000;

export interface AppleConfig {
  teamId: string;
  keyId: string;
  privateKey: string;
  clientId: string;
}

type Env = Record<string, string | undefined>;

/** The Sign in with Apple key config, or null (and the names missing) when it is not set. */
export function readAppleConfig(env: Env = process.env): { config: AppleConfig | null; missing: string[] } {
  const teamId = env.APPLE_TEAM_ID?.trim() ?? '';
  const keyId = env.APPLE_KEY_ID?.trim() ?? '';
  // Vercel stores multi-line values fine, but a pasted "\n" form is common too.
  const privateKey = (env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n').trim();
  const clientId = env.APPLE_CLIENT_ID?.trim() || DEFAULT_APPLE_CLIENT_ID;
  const missing = [
    !teamId && 'APPLE_TEAM_ID',
    !keyId && 'APPLE_KEY_ID',
    !privateKey && 'APPLE_PRIVATE_KEY',
  ].filter((name): name is string => !!name);
  return { config: missing.length ? null : { teamId, keyId, privateKey, clientId }, missing };
}

function base64url(input: string | Buffer): string {
  return Buffer.from(input).toString('base64url');
}

/** The ES256 JWT Apple takes as client_secret, signed with the .p8 key. */
export function makeAppleClientSecret(config: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): string {
  const header = base64url(JSON.stringify({ alg: 'ES256', kid: config.keyId, typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      iss: config.teamId,
      iat: nowSeconds,
      exp: nowSeconds + CLIENT_SECRET_TTL_SECONDS,
      aud: APPLE_AUDIENCE,
      sub: config.clientId,
    })
  );
  const signingInput = `${header}.${payload}`;
  const signature = sign('sha256', Buffer.from(signingInput), {
    key: createPrivateKey(config.privateKey),
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${base64url(signature)}`;
}

function appleAuthRef(db: Firestore, uid: string) {
  return db.collection('users').doc(uid).collection('private').doc('appleAuth');
}

async function postForm(url: string, body: Record<string, string>, fetchImpl: typeof fetch): Promise<Response> {
  return fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(APPLE_TIMEOUT_MS),
  });
}

async function appleError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: unknown };
    return typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

export type StoreAppleTokenResult =
  | { status: 'stored' }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'no_refresh_token' }
  | { status: 'failed'; error: string };

/**
 * Swaps the app's one-time authorizationCode for a refresh token and stores it
 * server-side. Never throws.
 */
export async function storeAppleRefreshToken(
  db: Firestore,
  uid: string,
  authorizationCode: string,
  deps: { env?: Env; fetchImpl?: typeof fetch; now?: () => Date } = {}
): Promise<StoreAppleTokenResult> {
  const { config, missing } = readAppleConfig(deps.env);
  if (!config) {
    console.warn(
      `[apple] Sign in with Apple key is not configured (missing ${missing.join(', ')}); not storing a refresh token, so account deletion cannot revoke Apple access for ${uid}.`
    );
    return { status: 'not_configured', missing };
  }
  try {
    const res = await postForm(
      APPLE_TOKEN_URL,
      {
        client_id: config.clientId,
        client_secret: makeAppleClientSecret(config),
        code: authorizationCode,
        grant_type: 'authorization_code',
      },
      deps.fetchImpl ?? fetch
    );
    if (!res.ok) {
      const error = await appleError(res);
      console.error('[apple] authorization code exchange failed', uid, error);
      return { status: 'failed', error };
    }
    const data = (await res.json()) as { refresh_token?: unknown };
    if (typeof data?.refresh_token !== 'string' || !data.refresh_token) {
      console.error('[apple] code exchange returned no refresh_token', uid);
      return { status: 'no_refresh_token' };
    }
    await appleAuthRef(db, uid).set({
      refreshToken: data.refresh_token,
      clientId: config.clientId,
      updatedAt: (deps.now ?? (() => new Date()))(),
    });
    return { status: 'stored' };
  } catch (error) {
    console.error('[apple] failed to store the Apple refresh token', uid, error);
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
}

export type RevokeAppleResult =
  | { status: 'none' }
  | { status: 'revoked' }
  | { status: 'not_configured'; missing: string[] }
  | { status: 'failed'; error: string };

/**
 * Revokes the person's stored Apple refresh token (if any), then deletes the
 * stored token whatever Apple answered. Never throws: account deletion goes on
 * regardless.
 */
export async function revokeAppleSignIn(
  db: Firestore,
  uid: string,
  deps: { env?: Env; fetchImpl?: typeof fetch } = {}
): Promise<RevokeAppleResult> {
  const ref = appleAuthRef(db, uid);
  let refreshToken: string | null = null;
  let storedClientId: string | null = null;
  try {
    const snap = await ref.get();
    if (snap.exists) {
      const token = snap.get('refreshToken');
      const clientId = snap.get('clientId');
      refreshToken = typeof token === 'string' && token ? token : null;
      storedClientId = typeof clientId === 'string' && clientId ? clientId : null;
    }
  } catch (error) {
    console.error('[apple] failed to read the stored Apple token', uid, error);
    return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
  }
  if (!refreshToken) return { status: 'none' };

  let result: RevokeAppleResult;
  const { config, missing } = readAppleConfig(deps.env);
  if (!config) {
    console.warn(
      `[apple] Sign in with Apple key is not configured (missing ${missing.join(', ')}); skipping Apple token revoke for ${uid}.`
    );
    result = { status: 'not_configured', missing };
  } else {
    // The token belongs to the client it was issued to.
    const clientConfig = { ...config, clientId: storedClientId ?? config.clientId };
    try {
      const res = await postForm(
        APPLE_REVOKE_URL,
        {
          client_id: clientConfig.clientId,
          client_secret: makeAppleClientSecret(clientConfig),
          token: refreshToken,
          token_type_hint: 'refresh_token',
        },
        deps.fetchImpl ?? fetch
      );
      if (res.ok) {
        result = { status: 'revoked' };
      } else {
        const error = await appleError(res);
        console.error('[apple] token revoke failed', uid, error);
        result = { status: 'failed', error };
      }
    } catch (error) {
      console.error('[apple] token revoke failed', uid, error);
      result = { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  }

  try {
    await ref.delete();
  } catch (error) {
    console.error('[apple] failed to delete the stored Apple token', uid, error);
  }
  return result;
}
