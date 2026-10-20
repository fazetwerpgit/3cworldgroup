// A consultant's Google Calendar connection: the single-use connect state, the
// encrypted refresh token, short-lived access tokens, and the non-secret status
// mirrored onto solarAvailability/{uid}.googleCalendar. Server only (admin SDK).
//
// Firestore:
//   solarGoogleTokens/{uid}        refreshToken (AES-256-GCM, lib/solar/google/crypto),
//                                  email, scopes, connectedAt, updatedAt, status 'ok' | 'broken'
//   solarGoogleOAuthStates/{nonce} uid, from 'app' | 'web', redirectUri, expiresAt, createdAt
//                                  (deleted when the callback uses it: single use)
// Both are closed to clients in firestore.rules. The refresh token never
// leaves this module in plain text except in the request to Google.
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { STATE_TTL_MS, decryptToken, encryptToken, newNonce, signState, verifyState } from './crypto';
import { SCOPE_FREEBUSY, authUrl, googleClient, redirectUriFor, refreshAccessToken, revokeToken } from './oauth';
import type { GoogleCalendarStatus } from './status';

export const TOKENS = 'solarGoogleTokens';
export const STATES = 'solarGoogleOAuthStates';
const AVAILABILITY = 'solarAvailability';

export type ConnectFrom = 'app' | 'web';

// ---------- connect ----------

export type StartConnect = { ok: true; url: string } | { ok: false; error: string; status: number };

/** A fresh Google consent URL for `uid`, with its state stored for one use. */
export async function startConnect(uid: string, requestUrl: string, from: ConnectFrom): Promise<StartConnect> {
  const client = googleClient();
  if (!client) return { ok: false, error: "Google Calendar isn't set up on the server yet.", status: 503 };
  if (!adminDb) return { ok: false, error: 'Database not configured', status: 500 };
  const now = Date.now();
  const nonce = newNonce();
  const exp = now + STATE_TTL_MS;
  const redirectUri = redirectUriFor(requestUrl);
  const states = adminDb.collection(STATES);
  // Older unused links of this person are dropped (best effort; equality filter only).
  try {
    const stale = await states.where('uid', '==', uid).get();
    await Promise.all(stale.docs.map((d) => states.doc(d.id).delete()));
  } catch (error) {
    console.error('google calendar: stale state cleanup failed', error instanceof Error ? error.message : '');
  }
  await states.doc(nonce).set({ uid, from, redirectUri, expiresAt: new Date(exp), createdAt: new Date(now) });
  return { ok: true, url: authUrl(client, redirectUri, signState({ uid, nonce, exp })) };
}

export type ConsumedState =
  | { ok: true; uid: string; from: ConnectFrom; redirectUri: string }
  | { ok: false; reason: 'bad_state' | 'expired' | 'reused' };

/**
 * Checks the callback's state (HMAC, expiry) and uses up its nonce in one
 * transaction, so a replayed callback finds it gone ('reused').
 */
export async function consumeState(state: unknown, now: number = Date.now()): Promise<ConsumedState> {
  const check = verifyState(state, now);
  if (!check.ok) return check;
  if (!adminDb) return { ok: false, reason: 'bad_state' };
  const db = adminDb;
  const ref = db.collection(STATES).doc(check.nonce);
  return db.runTransaction(async (tx): Promise<ConsumedState> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { ok: false, reason: 'reused' };
    tx.delete(ref);
    if (snap.get('uid') !== check.uid) return { ok: false, reason: 'bad_state' };
    const redirectUri = snap.get('redirectUri');
    if (typeof redirectUri !== 'string' || !redirectUri) return { ok: false, reason: 'bad_state' };
    return { ok: true, uid: check.uid, from: snap.get('from') === 'app' ? 'app' : 'web', redirectUri };
  });
}

/** True when `uid` has a saved consultant doc (only consultants connect a calendar). */
export async function isConsultant(uid: string): Promise<boolean> {
  if (!adminDb) return false;
  return (await adminDb.collection(AVAILABILITY).doc(uid).get()).exists;
}

/**
 * Stores the refresh token (encrypted, bound to uid) and mirrors the status
 * onto the consultant's doc. Replaces an earlier connection: the old refresh
 * token isn't revoked here, because revoking a token revokes the whole grant,
 * which is the new one too when it's the same Google account.
 */
export async function saveConnection(
  uid: string,
  grant: { refreshToken: string; scopes: string[]; email: string },
  now: Date = new Date()
): Promise<GoogleCalendarStatus> {
  if (!adminDb) throw new Error('Database not configured');
  const freeBusy = grant.scopes.includes(SCOPE_FREEBUSY);
  await adminDb.collection(TOKENS).doc(uid).set({
    refreshToken: encryptToken(grant.refreshToken, uid),
    email: grant.email,
    scopes: grant.scopes,
    status: 'ok',
    connectedAt: now,
    updatedAt: now,
  });
  const status: GoogleCalendarStatus = { connected: true, email: grant.email, connectedAt: now.toISOString(), freeBusy };
  await adminDb.collection(AVAILABILITY).doc(uid).update({
    googleCalendar: { connected: true, email: grant.email, connectedAt: now, freeBusy },
  });
  forgetAccessToken(uid);
  return status;
}

// ---------- disconnect ----------

/**
 * Revokes the grant at Google (best effort), deletes the token doc and clears
 * the status. `revoked` is false when Google couldn't be reached; the token is
 * deleted either way, so the portal never uses it again.
 */
export async function disconnect(uid: string): Promise<{ revoked: boolean; hadToken: boolean }> {
  if (!adminDb) throw new Error('Database not configured');
  const ref = adminDb.collection(TOKENS).doc(uid);
  const snap = await ref.get();
  let revoked = false;
  const sealed = snap.exists ? snap.get('refreshToken') : null;
  const token = typeof sealed === 'string' ? decryptToken(sealed, uid) : null;
  if (token) revoked = await revokeToken(token);
  await ref.delete();
  const consultant = adminDb.collection(AVAILABILITY).doc(uid);
  if ((await consultant.get()).exists) await consultant.update({ googleCalendar: FieldValue.delete() });
  forgetAccessToken(uid);
  return { revoked, hadToken: snap.exists };
}

// ---------- access tokens ----------

/** Refreshed this long before Google's expiry. */
const EARLY_MS = 2 * 60_000;
const accessTokens = new Map<string, { token: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string | null>>();

export function forgetAccessToken(uid: string): void {
  accessTokens.delete(uid);
  inFlight.delete(uid);
}

/** Tests only: drop every cached access token. */
export function resetAccessTokenCache(): void {
  accessTokens.clear();
  inFlight.clear();
}

/**
 * Marks the connection broken: Google refused the refresh token (revoked from
 * the Google account, password change, 6 months unused) or it no longer
 * decrypts (client secret rotated). The portal works without Google until the
 * consultant reconnects.
 */
export async function markBroken(uid: string): Promise<void> {
  forgetAccessToken(uid);
  if (!adminDb) return;
  try {
    const now = new Date();
    const tokens = adminDb.collection(TOKENS).doc(uid);
    if ((await tokens.get()).exists) await tokens.update({ status: 'broken', brokenAt: now, updatedAt: now });
    const consultant = adminDb.collection(AVAILABILITY).doc(uid);
    const snap = await consultant.get();
    if (snap.exists) {
      const current = (snap.get('googleCalendar') ?? {}) as Record<string, unknown>;
      await consultant.update({ googleCalendar: { ...current, connected: false, needsReconnect: true } });
    }
  } catch (error) {
    console.error('google calendar: marking connection broken failed', error instanceof Error ? error.message : '');
  }
}

async function loadAccessToken(uid: string): Promise<string | null> {
  const client = googleClient();
  if (!client || !adminDb) return null;
  const snap = await adminDb.collection(TOKENS).doc(uid).get();
  if (!snap.exists || snap.get('status') === 'broken') return null;
  const sealed = snap.get('refreshToken');
  const refreshToken = typeof sealed === 'string' ? decryptToken(sealed, uid) : null;
  if (!refreshToken) {
    await markBroken(uid);
    return null;
  }
  const refreshed = await refreshAccessToken(client, refreshToken);
  if (!refreshed.ok) {
    if (refreshed.invalidGrant) await markBroken(uid);
    return null;
  }
  accessTokens.set(uid, { token: refreshed.accessToken, expiresAt: Date.now() + refreshed.expiresIn * 1000 - EARLY_MS });
  return refreshed.accessToken;
}

/**
 * A live access token for `uid`'s calendar, or null when there's no usable
 * connection right now (never throws). Cached in memory until shortly before
 * it expires; concurrent callers share one refresh.
 */
export async function accessTokenFor(uid: string): Promise<string | null> {
  const cached = accessTokens.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const pending = inFlight.get(uid);
  if (pending) return pending;
  const run = loadAccessToken(uid)
    .catch((error) => {
      console.error('google calendar: access token failed', error instanceof Error ? error.message : '');
      return null;
    })
    .finally(() => inFlight.delete(uid));
  inFlight.set(uid, run);
  return run;
}

/** Google said 401 to a live access token: drop it so the next call refreshes. */
export function rejectAccessToken(uid: string): void {
  accessTokens.delete(uid);
}
