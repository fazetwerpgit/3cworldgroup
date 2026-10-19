import { generateKeyPairSync, verify } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';
import {
  APPLE_REVOKE_URL,
  APPLE_TOKEN_URL,
  makeAppleClientSecret,
  readAppleConfig,
  revokeAppleSignIn,
  storeAppleRefreshToken,
} from './appleSignIn';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const PEM = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

const ENV = {
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_KEY_ID: 'KEY1234567',
  // Stored with literal "\n", as a pasted env value often is.
  APPLE_PRIVATE_KEY: PEM.replace(/\n/g, '\\n'),
  APPLE_CLIENT_ID: 'com.threecworldgroup.portal',
};

/** users/{uid}/private/appleAuth docs, keyed by path. */
function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const db = {
    collection: (c: string) => ({
      doc: (uid: string) => ({
        collection: (sub: string) => ({
          doc: (id: string) => {
            const path = `${c}/${uid}/${sub}/${id}`;
            return {
              get: vi.fn(async () => {
                const data = docs.get(path);
                return { exists: !!data, get: (k: string) => data?.[k] };
              }),
              set: vi.fn(async (data: Record<string, unknown>) => void docs.set(path, data)),
              delete: vi.fn(async () => void docs.delete(path)),
            };
          },
        }),
      }),
    }),
  };
  return { docs, db: db as unknown as Firestore };
}

const PATH = 'users/u1/private/appleAuth';

function okJson(data: unknown) {
  return new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function formOf(call: unknown[]): URLSearchParams {
  return new URLSearchParams(String((call[1] as RequestInit).body));
}

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe('readAppleConfig', () => {
  it('names what is missing and defaults the client id to the bundle id', () => {
    expect(readAppleConfig({}).missing).toEqual(['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY']);
    const { config } = readAppleConfig({ ...ENV, APPLE_CLIENT_ID: undefined });
    expect(config?.clientId).toBe('com.threecworldgroup.portal');
    expect(config?.privateKey).toContain('-----BEGIN PRIVATE KEY-----\n');
  });
});

describe('makeAppleClientSecret', () => {
  it('signs an ES256 JWT Apple accepts (iss, sub, aud, kid)', () => {
    const config = readAppleConfig(ENV).config!;
    const jwt = makeAppleClientSecret(config, 1_000);
    const [h, p, sig] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY1234567', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(p, 'base64url').toString())).toEqual({
      iss: 'TEAM123456',
      iat: 1_000,
      exp: 1_300,
      aud: 'https://appleid.apple.com',
      sub: 'com.threecworldgroup.portal',
    });
    const ok = verify('sha256', Buffer.from(`${h}.${p}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
  });
});

describe('storeAppleRefreshToken', () => {
  it('exchanges the code at Apple and stores the refresh token server-side', async () => {
    const { db, docs } = fakeDb();
    const fetchImpl = vi.fn(async () => okJson({ refresh_token: 'r-123', id_token: 'x' }));
    const result = await storeAppleRefreshToken(db, 'u1', 'code-abc', {
      env: ENV,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      now: () => new Date(0),
    });
    expect(result).toEqual({ status: 'stored' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0] as unknown[];
    expect(call[0]).toBe(APPLE_TOKEN_URL);
    const form = formOf(call);
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('code-abc');
    expect(form.get('client_id')).toBe('com.threecworldgroup.portal');
    expect(form.get('client_secret')?.split('.')).toHaveLength(3);
    expect(docs.get(PATH)).toEqual({ refreshToken: 'r-123', clientId: 'com.threecworldgroup.portal', updatedAt: new Date(0) });
  });

  it('skips without calling Apple when the key env vars are missing', async () => {
    const { db, docs } = fakeDb();
    const fetchImpl = vi.fn();
    const result = await storeAppleRefreshToken(db, 'u1', 'code-abc', { env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ status: 'not_configured', missing: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'] });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(docs.size).toBe(0);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('not configured'));
  });

  it('reports an Apple error and stores nothing', async () => {
    const { db, docs } = fakeDb();
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant' }), { status: 400 }));
    const result = await storeAppleRefreshToken(db, 'u1', 'old-code', { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ status: 'failed', error: 'invalid_grant' });
    expect(docs.size).toBe(0);
  });
});

describe('revokeAppleSignIn', () => {
  it('revokes the stored refresh token at Apple, then deletes it', async () => {
    const { db, docs } = fakeDb();
    docs.set(PATH, { refreshToken: 'r-123', clientId: 'com.threecworldgroup.portal' });
    const fetchImpl = vi.fn(async () => new Response('', { status: 200 }));
    const result = await revokeAppleSignIn(db, 'u1', { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result).toEqual({ status: 'revoked' });
    const call = fetchImpl.mock.calls[0] as unknown[];
    expect(call[0]).toBe(APPLE_REVOKE_URL);
    const form = formOf(call);
    expect(form.get('token')).toBe('r-123');
    expect(form.get('token_type_hint')).toBe('refresh_token');
    expect(form.get('client_id')).toBe('com.threecworldgroup.portal');
    expect(docs.has(PATH)).toBe(false);
  });

  it('does nothing when no Apple token is stored', async () => {
    const { db } = fakeDb();
    const fetchImpl = vi.fn();
    expect(await revokeAppleSignIn(db, 'u1', { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ status: 'none' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('skips the revoke with a warning when the env vars are missing, and still drops the token', async () => {
    const { db, docs } = fakeDb();
    docs.set(PATH, { refreshToken: 'r-123' });
    const fetchImpl = vi.fn();
    const result = await revokeAppleSignIn(db, 'u1', { env: {}, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.status).toBe('not_configured');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('skipping Apple token revoke'));
    expect(docs.has(PATH)).toBe(false);
  });

  it('never throws when Apple fails (HTTP error or network), and still drops the token', async () => {
    for (const fetchImpl of [
      vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 400 })),
      vi.fn(async () => {
        throw new Error('network down');
      }),
    ]) {
      const { db, docs } = fakeDb();
      docs.set(PATH, { refreshToken: 'r-123' });
      const result = await revokeAppleSignIn(db, 'u1', { env: ENV, fetchImpl: fetchImpl as unknown as typeof fetch });
      expect(result.status).toBe('failed');
      expect(docs.has(PATH)).toBe(false);
    }
  });
});
