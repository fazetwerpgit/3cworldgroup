// Secrets for the Google Calendar connection: the signed OAuth `state` and the
// encrypted refresh token. Server only.
//
// Both keys are derived with HKDF-SHA256 from GOOGLE_OAUTH_CLIENT_SECRET, each
// with its own fixed info string, so no extra secret has to be provisioned.
// ROTATING THE CLIENT SECRET changes both keys: every stored refresh token
// stops decrypting, and every consultant has to reconnect Google Calendar
// (the portal treats an undecryptable token like a revoked one).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const SALT = '3c-solar-google-calendar';
const TOKEN_INFO = '3c solar google refresh-token aes-256-gcm v1';
const STATE_INFO = '3c solar google oauth-state hmac-sha256 v1';
const TOKEN_VERSION = 'v1';

/** How long a connect link stays usable. */
export const STATE_TTL_MS = 10 * 60_000;

function secret(): string {
  const value = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!value) throw new Error('GOOGLE_OAUTH_CLIENT_SECRET is not set');
  return value;
}

function derive(info: string): Buffer {
  return Buffer.from(hkdfSync('sha256', secret(), SALT, info, 32));
}

const b64 = (buf: Buffer) => buf.toString('base64url');
const unb64 = (value: string) => Buffer.from(value, 'base64url');

/**
 * AES-256-GCM with a random 96-bit IV. `aad` (the consultant's uid) is bound
 * into the tag, so a token copied onto another consultant's doc won't open.
 * Output: "v1.<iv>.<tag>.<ciphertext>", base64url parts.
 */
export function encryptToken(plain: string, aad: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', derive(TOKEN_INFO), iv);
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [TOKEN_VERSION, b64(iv), b64(cipher.getAuthTag()), b64(ct)].join('.');
}

/** The plain token, or null when it can't be opened (tampered, other uid, rotated secret). */
export function decryptToken(sealed: string, aad: string): string | null {
  try {
    const [version, iv, tag, ct] = sealed.split('.');
    if (version !== TOKEN_VERSION || !iv || !tag || !ct) return null;
    const decipher = createDecipheriv('aes-256-gcm', derive(TOKEN_INFO), unb64(iv));
    decipher.setAAD(Buffer.from(aad, 'utf8'));
    decipher.setAuthTag(unb64(tag));
    return Buffer.concat([decipher.update(unb64(ct)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}

export interface StatePayload {
  uid: string;
  nonce: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

function stateMac(body: string): Buffer {
  return createHmac('sha256', derive(STATE_INFO)).update(body).digest();
}

export function newNonce(): string {
  return b64(randomBytes(24));
}

/** "<base64url JSON {u,n,e}>.<base64url HMAC-SHA256>" */
export function signState(p: StatePayload): string {
  const body = b64(Buffer.from(JSON.stringify({ u: p.uid, n: p.nonce, e: p.exp }), 'utf8'));
  return `${body}.${b64(stateMac(body))}`;
}

export type StateCheck = { ok: true; uid: string; nonce: string } | { ok: false; reason: 'bad_state' | 'expired' };

/** Signature first (constant time), then expiry. Single use is enforced by the caller (the nonce doc). */
export function verifyState(state: unknown, now: number = Date.now()): StateCheck {
  if (typeof state !== 'string' || state.length > 1024) return { ok: false, reason: 'bad_state' };
  const [body, mac, extra] = state.split('.');
  if (!body || !mac || extra !== undefined) return { ok: false, reason: 'bad_state' };
  const expected = stateMac(body);
  const given = unb64(mac);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: 'bad_state' };
  let parsed: { u?: unknown; n?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(unb64(body).toString('utf8'));
  } catch {
    return { ok: false, reason: 'bad_state' };
  }
  if (typeof parsed.u !== 'string' || typeof parsed.n !== 'string' || typeof parsed.e !== 'number') {
    return { ok: false, reason: 'bad_state' };
  }
  if (parsed.e <= now) return { ok: false, reason: 'expired' };
  return { ok: true, uid: parsed.u, nonce: parsed.n };
}
