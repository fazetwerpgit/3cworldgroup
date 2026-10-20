import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));

import { adminDb } from '@/lib/firebase/admin';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';
import { createFakeGoogle, type FakeGoogle } from '@/lib/solar/testing/fakeGoogle';
import { STATE_TTL_MS, decryptToken, encryptToken, signState, verifyState } from './crypto';
import { accessTokenFor, consumeState, resetAccessTokenCache, startConnect } from './connection';
import { bookingEventId, buildBookingEvent, insertBookingEvent, type BookingEventInput } from './calendar';
import { googleBusyBlocks, googleSlotBusy, resetFreeBusyCache } from './freeBusy';
import { authUrl, redirectUriFor } from './oauth';
import type { SolarAvailability } from '@/lib/solar/availability';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
let google: FakeGoogle;

beforeEach(() => {
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-id.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
  db.store.clear();
  google = createFakeGoogle();
  vi.stubGlobal('fetch', google.fetch);
  resetAccessTokenCache();
  resetFreeBusyCache();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function connect(uid: string, extra: Record<string, unknown> = {}) {
  db.store.set('solarGoogleTokens', new Map([[uid, { refreshToken: encryptToken('refresh-1', uid), status: 'ok', scopes: [] }]]));
  db.store.set(
    'solarAvailability',
    new Map([[uid, { name: 'Sam', googleCalendar: { connected: true, email: 'sam@gmail.com', connectedAt: new Date(), freeBusy: true, ...extra } }]])
  );
}

describe('state signing', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');

  it('verifies its own state and reads the uid and nonce back', () => {
    const state = signState({ uid: 'sam', nonce: 'n1', exp: now + STATE_TTL_MS });
    expect(verifyState(state, now)).toEqual({ ok: true, uid: 'sam', nonce: 'n1' });
  });

  it('refuses a state after its 10 minutes', () => {
    const state = signState({ uid: 'sam', nonce: 'n1', exp: now + STATE_TTL_MS });
    expect(verifyState(state, now + STATE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
  });

  it('refuses a tampered payload, a forged mac and junk', () => {
    const state = signState({ uid: 'sam', nonce: 'n1', exp: now + STATE_TTL_MS });
    const [, mac] = state.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ u: 'mallory', n: 'n1', e: now + STATE_TTL_MS })).toString('base64url');
    expect(verifyState(`${forgedBody}.${mac}`, now)).toEqual({ ok: false, reason: 'bad_state' });
    expect(verifyState(`${state}x`, now)).toEqual({ ok: false, reason: 'bad_state' });
    expect(verifyState('nope', now)).toEqual({ ok: false, reason: 'bad_state' });
    expect(verifyState(undefined, now)).toEqual({ ok: false, reason: 'bad_state' });
  });

  it('a state signed under another client secret is refused', () => {
    const state = signState({ uid: 'sam', nonce: 'n1', exp: now + STATE_TTL_MS });
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'rotated-secret');
    expect(verifyState(state, now)).toEqual({ ok: false, reason: 'bad_state' });
  });
});

describe('token encryption', () => {
  it('round-trips, with a fresh IV each time', () => {
    const a = encryptToken('1//refresh-token', 'sam');
    const b = encryptToken('1//refresh-token', 'sam');
    expect(a).not.toBe(b);
    expect(a).not.toContain('refresh-token');
    expect(decryptToken(a, 'sam')).toBe('1//refresh-token');
  });

  it("won't open for another uid, after tampering, or under a rotated secret", () => {
    const sealed = encryptToken('1//refresh-token', 'sam');
    expect(decryptToken(sealed, 'other')).toBeNull();
    const parts = sealed.split('.');
    parts[3] = Buffer.from('garbage').toString('base64url');
    expect(decryptToken(parts.join('.'), 'sam')).toBeNull();
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'rotated-secret');
    expect(decryptToken(sealed, 'sam')).toBeNull();
  });
});

describe('connect URL and single-use state', () => {
  it('asks for offline access, consent, both calendar scopes and a signed state', async () => {
    db.store.set('solarAvailability', new Map([['sam', { name: 'Sam' }]]));
    const started = await startConnect('sam', 'https://www.3cworldgroup.com/api/portal/solar/google/connect', 'app');
    expect(started.ok).toBe(true);
    const url = new URL((started as { url: string }).url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('include_granted_scopes')).toBe('true');
    expect(url.searchParams.get('redirect_uri')).toBe('https://www.3cworldgroup.com/api/portal/solar/google/callback');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.events');
    expect(url.searchParams.get('scope')).toContain('https://www.googleapis.com/auth/calendar.freebusy');
    const state = url.searchParams.get('state')!;
    expect(await consumeState(state)).toMatchObject({ ok: true, uid: 'sam', from: 'app' });
    expect(await consumeState(state)).toEqual({ ok: false, reason: 'reused' });
  });

  it('uses the localhost redirect on a local server and production everywhere else', () => {
    expect(redirectUriFor('http://localhost:3000/x')).toBe('http://localhost:3000/api/portal/solar/google/callback');
    expect(redirectUriFor('https://3cworldgroup.com/x')).toBe('https://www.3cworldgroup.com/api/portal/solar/google/callback');
    expect(authUrl({ clientId: 'c', clientSecret: 's' }, 'r', 'st')).not.toContain('client_secret');
  });
});

describe('access tokens', () => {
  it('refreshes once and reuses the token from memory', async () => {
    connect('sam');
    expect(await accessTokenFor('sam')).toBe('access-1');
    expect(await accessTokenFor('sam')).toBe('access-1');
    expect(google.all('POST', 'oauth2.googleapis.com/token')).toHaveLength(1);
    expect(google.requests[0].body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'refresh-1' });
  });

  it('invalid_grant marks the connection broken and stops calling Google', async () => {
    connect('sam');
    google.refresh = 'invalid_grant';
    expect(await accessTokenFor('sam')).toBeNull();
    expect(db.store.get('solarAvailability')!.get('sam')!.googleCalendar).toMatchObject({ connected: false, needsReconnect: true });
    expect(db.store.get('solarGoogleTokens')!.get('sam')!.status).toBe('broken');
    expect(await accessTokenFor('sam')).toBeNull();
    expect(google.all('POST', 'oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('a passing Google error just answers null, leaving the connection alone', async () => {
    connect('sam');
    google.refresh = 'error';
    expect(await accessTokenFor('sam')).toBeNull();
    expect(db.store.get('solarAvailability')!.get('sam')!.googleCalendar).toMatchObject({ connected: true });
  });
});

const VIRTUAL: BookingEventInput = {
  bookingId: 'sam_2026-10-26T15:00:00.000Z',
  createdAtMs: Date.parse('2026-10-20T00:00:00Z'),
  mode: 'virtual',
  start: '2026-10-26T15:00:00.000Z',
  end: '2026-10-26T16:00:00.000Z',
  timeZone: 'America/Chicago',
  customerName: 'Ana Lopez',
  customerEmail: 'ana@example.com',
  address: '12 Elm St, Austin, TX, 78701',
  consultantName: 'Sam Closer',
  consultantPhone: '+15125550199',
};

describe('event payload', () => {
  it('virtual: a new Meet link, the homeowner invited, details in the description', () => {
    const e = buildBookingEvent(VIRTUAL);
    expect(e).toMatchObject({
      id: bookingEventId(VIRTUAL.bookingId, VIRTUAL.createdAtMs),
      summary: 'Solar consultation: Ana Lopez',
      start: { dateTime: VIRTUAL.start, timeZone: 'America/Chicago' },
      end: { dateTime: VIRTUAL.end, timeZone: 'America/Chicago' },
      attendees: [{ email: 'ana@example.com', displayName: 'Ana Lopez' }],
      conferenceData: { createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    });
    expect(e.location).toBeUndefined();
    expect(e.description).toBe(
      'Solar consultation with 3C World Group.\n\n' +
        'Questions before then? Call or text Sam at (512) 555-0199.\n\n' +
        'Reply to the invite to change the time.'
    );
    // Google adds its own Meet line; the booking id rides only in private properties.
    expect(e.description).not.toMatch(/meet\.google|portal|12 Elm|sam_2026/i);
    expect(e.extendedProperties).toEqual({ private: { solarBookingId: VIRTUAL.bookingId, solarHomeownerEmail: 'ana@example.com' } });
  });

  it('no consultant phone: the call-or-text line is left out', () => {
    expect(buildBookingEvent({ ...VIRTUAL, consultantPhone: '' }).description).toBe(
      'Solar consultation with 3C World Group.\n\nReply to the invite to change the time.'
    );
  });

  it('in person: the address is the location and no Meet is made', () => {
    const e = buildBookingEvent({ ...VIRTUAL, mode: 'in_person' });
    expect(e.location).toBe('12 Elm St, Austin, TX, 78701');
    expect(e.conferenceData).toBeUndefined();
    expect(e.description).not.toContain('12 Elm');
  });

  it('no homeowner email: nobody is invited', () => {
    expect(buildBookingEvent({ ...VIRTUAL, customerEmail: '' }).attendees).toBeUndefined();
  });

  it('the event id is fixed per booking (base32hex) and changes when the slot is re-booked', () => {
    const id = bookingEventId(VIRTUAL.bookingId, VIRTUAL.createdAtMs);
    expect(id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(bookingEventId(VIRTUAL.bookingId, VIRTUAL.createdAtMs)).toBe(id);
    expect(bookingEventId(VIRTUAL.bookingId, VIRTUAL.createdAtMs + 1)).not.toBe(id);
  });
});

describe('events.insert', () => {
  it('posts with conferenceDataVersion=1 and sendUpdates=all, and reads the Meet link', async () => {
    connect('sam');
    const created = await insertBookingEvent('sam', VIRTUAL);
    expect(created).toEqual({ ok: true, eventId: bookingEventId(VIRTUAL.bookingId, VIRTUAL.createdAtMs), meetLink: 'https://meet.google.com/new-meet-abc' });
    const insert = google.find('POST', '/calendars/primary/events')!;
    expect(insert.url).toContain('conferenceDataVersion=1');
    expect(insert.url).toContain('sendUpdates=all');
    expect(insert.auth).toBe('Bearer access-1');
  });

  it('a retried insert (409) reads the existing event instead of making a second', async () => {
    connect('sam');
    google.insert = 'conflict';
    const created = await insertBookingEvent('sam', VIRTUAL);
    expect(created).toMatchObject({ ok: true, meetLink: 'https://meet.google.com/new-meet-abc' });
    expect(google.all('POST', '/calendars/primary/events')).toHaveLength(1);
    expect(google.find('GET', '/calendars/primary/events/')).toBeTruthy();
  });

  it('a timeout reports that the event may exist; an error that it does not', async () => {
    connect('sam');
    google.insert = 'timeout';
    expect(await insertBookingEvent('sam', VIRTUAL)).toMatchObject({ ok: false, maybeCreated: true });
    google.insert = 'error';
    expect(await insertBookingEvent('sam', VIRTUAL)).toMatchObject({ ok: false, maybeCreated: false });
  });
});

const consultant = (uid: string, googleCalendar?: SolarAvailability['googleCalendar']): SolarAvailability => ({
  consultantUid: uid,
  name: uid,
  tz: 'America/Chicago',
  slotMin: 60,
  modes: { virtual: [{ day: 1, start: '09:00', end: '17:00' }] },
  ...(googleCalendar ? { googleCalendar } : {}),
});
const LIVE = { connected: true, email: 'sam@gmail.com', connectedAt: '2026-10-19T00:00:00.000Z', freeBusy: true };

describe('free/busy', () => {
  const from = new Date('2026-10-20T00:00:00Z');
  const to = new Date('2026-11-03T00:00:00Z');

  it('turns busy times into blocking entries, cached for a minute', async () => {
    connect('sam');
    google.freeBusy = [{ start: '2026-10-26T15:00:00Z', end: '2026-10-26T16:30:00Z' }];
    const blocks = await googleBusyBlocks([consultant('sam', LIVE), consultant('jo')], from, to, from.getTime());
    expect(blocks).toEqual([
      { consultantUid: 'sam', start: '2026-10-26T15:00:00.000Z', end: '2026-10-26T16:30:00.000Z', status: 'google_busy' },
    ]);
    expect(google.find('POST', '/freeBusy')!.body).toMatchObject({ items: [{ id: 'primary' }], timeMin: from.toISOString() });
    await googleBusyBlocks([consultant('sam', LIVE)], from, to, from.getTime() + 30_000);
    expect(google.all('POST', '/freeBusy')).toHaveLength(1);
    await googleBusyBlocks([consultant('sam', LIVE)], from, to, from.getTime() + 61_000);
    expect(google.all('POST', '/freeBusy')).toHaveLength(2);
  });

  it('a Google error, no free/busy scope, or no connection: no filtering', async () => {
    connect('sam');
    google.freeBusy = 'error';
    expect(await googleBusyBlocks([consultant('sam', LIVE)], from, to)).toEqual([]);
    expect(await googleBusyBlocks([consultant('sam', { ...LIVE, freeBusy: false })], from, to)).toEqual([]);
    expect(await googleBusyBlocks([consultant('sam', { ...LIVE, connected: false, needsReconnect: true })], from, to)).toEqual([]);
    expect(google.all('POST', '/freeBusy')).toHaveLength(1);
  });

  it('the booking-time check asks Google fresh and reports an overlap', async () => {
    connect('sam');
    const start = new Date('2026-10-26T15:00:00Z');
    const end = new Date('2026-10-26T16:00:00Z');
    google.freeBusy = [{ start: '2026-10-26T15:30:00Z', end: '2026-10-26T15:45:00Z' }];
    expect(await googleSlotBusy(consultant('sam', LIVE), start, end)).toBe(true);
    google.freeBusy = [{ start: '2026-10-26T16:00:00Z', end: '2026-10-26T17:00:00Z' }];
    expect(await googleSlotBusy(consultant('sam', LIVE), start, end)).toBe(false);
    google.freeBusy = 'error';
    expect(await googleSlotBusy(consultant('sam', LIVE), start, end)).toBe(false);
    expect(google.all('POST', '/freeBusy')).toHaveLength(3);
  });
});
