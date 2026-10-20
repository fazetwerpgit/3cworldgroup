// Google OAuth over plain fetch (no googleapis package): the consent URL, the
// code exchange, access-token refresh and revoke. Server only. Tokens are never
// logged; errors log Google's error code at most.

export const SCOPE_EVENTS = 'https://www.googleapis.com/auth/calendar.events';
export const SCOPE_FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy';
/** openid + email only to show which account is connected. */
export const GOOGLE_SCOPES = ['openid', 'email', SCOPE_EVENTS, SCOPE_FREEBUSY];

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

/** Every Google call gives up after this long; the portal then carries on without Google. */
export const GOOGLE_TIMEOUT_MS = 6000;

export const CALLBACK_PATH = '/api/portal/solar/google/callback';
/** The redirect URIs registered on the Google web client. */
const PROD_ORIGIN = 'https://www.3cworldgroup.com';
const LOCAL_ORIGIN = 'http://localhost:3000';

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

/** The OAuth client from env, or null when Google Calendar isn't configured. */
export function googleClient(): GoogleClient | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

/**
 * The callback URL Google redirects to: localhost:3000 on a local dev server,
 * the production host everywhere else (it must match a registered URI exactly).
 */
export function redirectUriFor(requestUrl: string): string {
  let origin = PROD_ORIGIN;
  try {
    const url = new URL(requestUrl);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') origin = LOCAL_ORIGIN;
  } catch {
    // keep production
  }
  return `${origin}${CALLBACK_PATH}`;
}

export function authUrl(client: GoogleClient, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

/** fetch with the Google timeout. Throws on network failure or timeout. */
export function googleFetch(url: string, init: RequestInit = {}, timeoutMs = GOOGLE_TIMEOUT_MS): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs), cache: 'no-store' });
}

async function jsonOf(res: Response): Promise<Record<string, unknown>> {
  return ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
}

/**
 * The email claim of an ID token that came straight from Google's token
 * endpoint over TLS (OIDC Core 3.1.3.7 allows skipping the signature check
 * then). Only used to label the connection, never for authorization.
 */
export function emailFromIdToken(idToken: unknown): string {
  if (typeof idToken !== 'string') return '';
  const part = idToken.split('.')[1];
  if (!part) return '';
  try {
    const claims = JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as Record<string, unknown>;
    return typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
  } catch {
    return '';
  }
}

export type CodeExchange =
  | { ok: true; refreshToken: string; accessToken: string; expiresIn: number; scopes: string[]; email: string }
  | { ok: false; reason: 'exchange_failed' | 'no_refresh_token'; accessToken?: string };

export async function exchangeCode(client: GoogleClient, code: string, redirectUri: string): Promise<CodeExchange> {
  let res: Response;
  try {
    res = await googleFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: client.clientId,
        client_secret: client.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
    });
  } catch {
    console.error('google calendar: code exchange failed (network/timeout)');
    return { ok: false, reason: 'exchange_failed' };
  }
  const data = await jsonOf(res);
  if (!res.ok || typeof data.access_token !== 'string') {
    console.error('google calendar: code exchange refused', res.status, String(data.error ?? ''));
    return { ok: false, reason: 'exchange_failed' };
  }
  const scopes = typeof data.scope === 'string' ? data.scope.split(/\s+/).filter(Boolean) : [];
  if (typeof data.refresh_token !== 'string' || !data.refresh_token) {
    return { ok: false, reason: 'no_refresh_token', accessToken: data.access_token };
  }
  return {
    ok: true,
    refreshToken: data.refresh_token,
    accessToken: data.access_token,
    expiresIn: Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600,
    scopes,
    email: emailFromIdToken(data.id_token),
  };
}

export type Refresh =
  | { ok: true; accessToken: string; expiresIn: number }
  /** invalidGrant: Google will never accept this refresh token again. */
  | { ok: false; invalidGrant: boolean };

export async function refreshAccessToken(client: GoogleClient, refreshToken: string): Promise<Refresh> {
  let res: Response;
  try {
    res = await googleFetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: client.clientId,
        client_secret: client.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }).toString(),
    });
  } catch {
    console.error('google calendar: token refresh failed (network/timeout)');
    return { ok: false, invalidGrant: false };
  }
  const data = await jsonOf(res);
  if (res.ok && typeof data.access_token === 'string') {
    return { ok: true, accessToken: data.access_token, expiresIn: Number(data.expires_in) > 0 ? Number(data.expires_in) : 3600 };
  }
  const error = String(data.error ?? '');
  console.error('google calendar: token refresh refused', res.status, error);
  return { ok: false, invalidGrant: error === 'invalid_grant' };
}

/** Revokes the grant at Google. True when Google confirmed it (or the token was already dead). */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const res = await googleFetch(REVOKE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token }).toString(),
    });
    if (res.ok) return true;
    const data = await jsonOf(res);
    // invalid_token: already revoked or expired; nothing left to revoke.
    if (data.error === 'invalid_token') return true;
    console.error('google calendar: revoke refused', res.status, String(data.error ?? ''));
    return false;
  } catch {
    console.error('google calendar: revoke failed (network/timeout)');
    return false;
  }
}
