import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));
vi.mock('@/lib/userRateLimits', () => ({ userRateLimited: vi.fn(() => null) }));

import { GET as callback } from './callback/route';
import { DELETE as disconnectRoute, GET as statusRoute, POST as connectRoute } from './connect/route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';
import { createFakeGoogle, type FakeGoogle } from '@/lib/solar/testing/fakeGoogle';
import { decryptToken, encryptToken } from '@/lib/solar/google/crypto';
import { resetAccessTokenCache } from '@/lib/solar/google/connection';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
let google: FakeGoogle;

const SAM = { ok: true, uid: 'sam', name: 'Sam', email: 'sam@3c.com', isAdmin: false, isOwner: false, solarRole: null };
const ADMIN = { ...SAM, uid: 'boss', name: 'Boss', isAdmin: true };
const EVENTS = 'https://www.googleapis.com/auth/calendar.events';
const FREEBUSY = 'https://www.googleapis.com/auth/calendar.freebusy';
const BASE = 'https://www.3cworldgroup.com/api/portal/solar/google';

function idToken(email: string) {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${part({ alg: 'RS256' })}.${part({ email, sub: '123' })}.sig`;
}

function grant(scopes: string[], extra: Record<string, unknown> = {}) {
  return {
    status: 200,
    body: {
      access_token: 'access-x',
      expires_in: 3599,
      refresh_token: '1//refresh-secret',
      scope: ['openid', 'https://www.googleapis.com/auth/userinfo.email', ...scopes].join(' '),
      id_token: idToken('sam@gmail.com'),
      ...extra,
    },
  };
}

async function startFlow(from: 'app' | 'web' = 'web', returnTo?: unknown): Promise<string> {
  mockGate.mockResolvedValue(SAM);
  const res = await connectRoute(
    new NextRequest(`${BASE}/connect`, { method: 'POST', body: JSON.stringify({ from, returnTo }) })
  );
  expect(res.status).toBe(200);
  const { url } = await res.json();
  return new URL(url).searchParams.get('state')!;
}

const back = (q: Record<string, string>) => callback(new NextRequest(`${BASE}/callback?${new URLSearchParams(q)}`));
const landedAt = (res: Response) => new URL(res.headers.get('location')!);

beforeEach(() => {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-id.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
  db.store.clear();
  db.store.set('solarAvailability', new Map([['sam', { name: 'Sam', tz: 'America/Chicago', slotMin: 60, modes: {} }]]));
  google = createFakeGoogle();
  vi.stubGlobal('fetch', google.fetch);
  resetAccessTokenCache();
  mockGate.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('POST /api/portal/solar/google/connect', () => {
  it('only a consultant gets a sign-in URL', async () => {
    mockGate.mockResolvedValue({ ...SAM, uid: 'rep9' });
    const res = await connectRoute(new NextRequest(`${BASE}/connect`, { method: 'POST', body: '{}' }));
    expect(res.status).toBe(403);
    expect(db.store.get('solarGoogleOAuthStates')?.size ?? 0).toBe(0);
  });

  it("the state is the caller's own uid, whatever the body says", async () => {
    mockGate.mockResolvedValue(SAM);
    const res = await connectRoute(new NextRequest(`${BASE}/connect`, { method: 'POST', body: JSON.stringify({ uid: 'boss' }) }));
    const state = new URL((await res.json()).url).searchParams.get('state')!;
    const [nonceDoc] = [...db.store.get('solarGoogleOAuthStates')!.values()];
    expect(nonceDoc.uid).toBe('sam');
    expect(JSON.parse(Buffer.from(state.split('.')[0], 'base64url').toString()).u).toBe('sam');
  });

  it('503 when the Google client is not configured', async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', '');
    mockGate.mockResolvedValue(SAM);
    const res = await connectRoute(new NextRequest(`${BASE}/connect`, { method: 'POST', body: '{}' }));
    expect(res.status).toBe(503);
  });
});

describe('GET /api/portal/solar/google/callback', () => {
  it('valid: stores the token encrypted, mirrors the status, lands on Setup with a banner', async () => {
    const state = await startFlow('web');
    google.exchange = grant([EVENTS, FREEBUSY]);
    const res = await back({ state, code: 'auth-code' });
    expect(res.status).toBe(303);
    const at = landedAt(res);
    expect(at.pathname).toBe('/portal/admin/solar');
    expect(at.searchParams.get('tab')).toBe('setup');
    expect(at.searchParams.get('google')).toBe('connected');
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(google.find('POST', 'oauth2.googleapis.com/token')!.body).toMatchObject({
      grant_type: 'authorization_code',
      code: 'auth-code',
      redirect_uri: 'https://www.3cworldgroup.com/api/portal/solar/google/callback',
    });

    const tokens = db.store.get('solarGoogleTokens')!.get('sam')!;
    expect(JSON.stringify(tokens)).not.toContain('refresh-secret');
    expect(decryptToken(String(tokens.refreshToken), 'sam')).toBe('1//refresh-secret');
    expect(tokens).toMatchObject({ email: 'sam@gmail.com', status: 'ok', scopes: expect.arrayContaining([EVENTS, FREEBUSY]) });
    expect(db.store.get('solarAvailability')!.get('sam')!.googleCalendar).toMatchObject({
      connected: true,
      email: 'sam@gmail.com',
      freeBusy: true,
    });
    // The nonce is used up.
    expect(db.store.get('solarGoogleOAuthStates')!.size).toBe(0);
  });

  it('started in the app: lands on the "go back to the app" page', async () => {
    const state = await startFlow('app');
    google.exchange = grant([EVENTS, FREEBUSY]);
    const at = landedAt(await back({ state, code: 'auth-code' }));
    expect(at.pathname).toBe('/portal/google-calendar');
    expect(at.searchParams.get('google')).toBe('connected');
  });

  it('started on My availability: the web lands back there, the app page is told to', async () => {
    const web = await startFlow('web', 'availability');
    google.exchange = grant([EVENTS, FREEBUSY]);
    const at = landedAt(await back({ state: web, code: 'auth-code' }));
    expect(at.origin).toBe('https://www.3cworldgroup.com');
    expect(at.pathname).toBe('/portal/solar/availability');
    expect(at.searchParams.get('google')).toBe('connected');
    expect(at.searchParams.has('tab')).toBe(false);

    const app = await startFlow('app', 'availability');
    const inApp = landedAt(await back({ state: app, code: 'auth-code' }));
    expect(inApp.pathname).toBe('/portal/google-calendar');
    expect(inApp.searchParams.get('back')).toBe('availability');
  });

  it('any other return value is Setup: never a path from the body', async () => {
    for (const returnTo of ['https://evil.example/x', '//evil.example', '/portal/admin/users', 'Availability']) {
      const state = await startFlow('web', returnTo);
      google.exchange = grant([EVENTS, FREEBUSY]);
      const at = landedAt(await back({ state, code: 'auth-code' }));
      expect(at.origin).toBe('https://www.3cworldgroup.com');
      expect(at.pathname).toBe('/portal/admin/solar');
      expect(at.searchParams.get('tab')).toBe('setup');
    }
  });

  it('a bad or forged state saves nothing and never calls Google', async () => {
    const state = await startFlow();
    const res = await back({ state: `${state}tampered`, code: 'auth-code' });
    const at = landedAt(res);
    expect(at.pathname).toBe('/portal/google-calendar');
    expect(at.searchParams.get('reason')).toBe('bad_state');
    expect(google.requests).toHaveLength(0);
    expect(db.store.get('solarGoogleTokens')?.size ?? 0).toBe(0);
  });

  it('a reused state is refused the second time', async () => {
    const state = await startFlow();
    google.exchange = grant([EVENTS, FREEBUSY]);
    await back({ state, code: 'auth-code' });
    const again = landedAt(await back({ state, code: 'auth-code-2' }));
    expect(again.searchParams.get('reason')).toBe('reused');
    expect(google.all('POST', 'oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('calendar.events not granted: nothing is saved and the grant is revoked', async () => {
    const state = await startFlow();
    google.exchange = grant([FREEBUSY]);
    const at = landedAt(await back({ state, code: 'auth-code' }));
    expect(at.searchParams.get('google')).toBe('error');
    expect(at.searchParams.get('reason')).toBe('scope');
    expect(db.store.get('solarGoogleTokens')?.size ?? 0).toBe(0);
    expect(db.store.get('solarAvailability')!.get('sam')!.googleCalendar).toBeUndefined();
    expect(google.find('POST', 'oauth2.googleapis.com/revoke')!.body).toEqual({ token: '1//refresh-secret' });
  });

  it('free/busy not granted: still connects, flagged so slots are not filtered', async () => {
    const state = await startFlow();
    google.exchange = grant([EVENTS]);
    const at = landedAt(await back({ state, code: 'auth-code' }));
    expect(at.searchParams.get('google')).toBe('connected');
    expect(at.searchParams.get('freebusy')).toBe('off');
    expect(db.store.get('solarAvailability')!.get('sam')!.googleCalendar).toMatchObject({ connected: true, freeBusy: false });
  });

  it('the person said no on the consent screen', async () => {
    const state = await startFlow();
    const at = landedAt(await back({ state, error: 'access_denied' }));
    expect(at.searchParams.get('reason')).toBe('denied');
    expect(google.requests).toHaveLength(0);
  });
});

describe('DELETE /api/portal/solar/google/connect', () => {
  function connected(uid: string) {
    db.store.set('solarGoogleTokens', new Map([[uid, { refreshToken: encryptToken('1//refresh-secret', uid), status: 'ok' }]]));
    db.store.get('solarAvailability')!.set(uid, {
      name: 'Sam',
      googleCalendar: { connected: true, email: 'sam@gmail.com', connectedAt: new Date(), freeBusy: true },
    });
  }

  it('the consultant removes their own: revoked at Google, token deleted, status cleared', async () => {
    connected('sam');
    mockGate.mockResolvedValue(SAM);
    const res = await disconnectRoute(new NextRequest(`${BASE}/connect`, { method: 'DELETE' }));
    expect(await res.json()).toEqual({ success: true, revoked: true });
    expect(google.find('POST', 'oauth2.googleapis.com/revoke')!.body).toEqual({ token: '1//refresh-secret' });
    expect(db.store.get('solarGoogleTokens')!.has('sam')).toBe(false);
    expect(db.store.get('solarAvailability')!.get('sam')!.googleCalendar).toBeUndefined();
  });

  it("someone else's: admins only", async () => {
    connected('sam');
    mockGate.mockResolvedValue({ ...SAM, uid: 'rep9' });
    expect((await disconnectRoute(new NextRequest(`${BASE}/connect?uid=sam`, { method: 'DELETE' }))).status).toBe(403);
    expect(db.store.get('solarGoogleTokens')!.has('sam')).toBe(true);
    mockGate.mockResolvedValue(ADMIN);
    expect((await disconnectRoute(new NextRequest(`${BASE}/connect?uid=sam`, { method: 'DELETE' }))).status).toBe(200);
    expect(db.store.get('solarGoogleTokens')!.has('sam')).toBe(false);
  });
});

describe('GET /api/portal/solar/google/connect', () => {
  it("answers the caller's status and never a token", async () => {
    db.store.set('solarGoogleTokens', new Map([['sam', { refreshToken: encryptToken('1//refresh-secret', 'sam') }]]));
    db.store.get('solarAvailability')!.get('sam')!.googleCalendar = {
      connected: true,
      email: 'sam@gmail.com',
      connectedAt: new Date('2026-10-19T12:00:00Z'),
      freeBusy: true,
    };
    mockGate.mockResolvedValue(SAM);
    const res = await statusRoute(new NextRequest(`${BASE}/connect`));
    const body = await res.json();
    expect(body).toEqual({
      googleCalendar: { connected: true, email: 'sam@gmail.com', connectedAt: '2026-10-19T12:00:00.000Z', freeBusy: true },
    });
    expect(JSON.stringify(body)).not.toContain('refresh');
  });
});
