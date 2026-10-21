import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedAdmin: vi.fn(), requireVerifiedUser: vi.fn() }));

import { DELETE, GET, PUT } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin, requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { JACOB_VIRTUAL, OWNER_IN_PERSON, OWNER_VIRTUAL } from '@/lib/solar/availability';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';
import { createFakeGoogle } from '@/lib/solar/testing/fakeGoogle';
import { encryptToken } from '@/lib/solar/google/crypto';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedAdmin as unknown as ReturnType<typeof vi.fn>;
const mockUser = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
/** The PUT/GET caller: an admin by default; `as('sam')` is a consultant who isn't one. */
const as = (uid: string, isAdmin = false) => mockUser.mockResolvedValue({ ok: true, uid, name: uid, isAdmin });

const HOURS = {
  tz: 'America/Denver',
  slotMin: 30,
  modes: { virtual: [{ day: 2, start: '09:00', end: '12:00' }], in_person: [] },
};
const url = (uid: string) => `http://localhost/api/portal/solar/consultants/${uid}`;
const put = (uid: string, body: unknown) =>
  PUT(new NextRequest(url(uid), { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ uid }) });
const get = (uid: string) => GET(new NextRequest(url(uid)), { params: Promise.resolve({ uid }) });
const del = (uid: string) => DELETE(new NextRequest(url(uid), { method: 'DELETE' }), { params: Promise.resolve({ uid }) });
const saved = () => db.store.get('solarAvailability') ?? new Map();

beforeEach(() => {
  vi.useRealTimers();
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
    sam: { displayName: 'Sam Closer', email: 'sam@x.com', solarRole: 'closer' },
  })));
  mockGate.mockReset().mockResolvedValue({ ok: true, uid: 'adm', name: 'Admin' });
  mockUser.mockReset();
  as('adm', true);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PUT /api/portal/solar/consultants/[uid]', () => {
  it("refuses someone else's card to a non-admin and writes nothing", async () => {
    as('sam');
    expect((await put('jac', HOURS)).status).toBe(403);
    expect(saved().size).toBe(0);
  });

  it('refuses a signed-out caller', async () => {
    mockUser.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await put('sam', HOURS)).status).toBe(401);
    expect(saved().size).toBe(0);
  });

  it('rejects invalid hours with the parser message', async () => {
    const res = await put('sam', { ...HOURS, slotMin: 45 });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Slot length must be 30, 60 or 90 minutes' });
    expect(saved().size).toBe(0);
  });

  it('404s for someone who is not a portal user', async () => {
    expect((await put('ghost', HOURS)).status).toBe(404);
    expect((await put('bad id!', HOURS)).status).toBe(404);
  });

  it('first save writes every seed consultant, so saving one keeps the others', async () => {
    const res = await put('jac', HOURS);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ consultant: { consultantUid: 'jac', name: 'Jacob', ...HOURS, meetLink: '', phone: '' } });
    expect([...saved().keys()].sort()).toEqual(['jac', 'own']);
    expect(saved().get('jac')).toMatchObject({ name: 'Jacob', ...HOURS, updatedBy: 'adm' });
    // The owner keeps the seed hours, now saved.
    expect(saved().get('own')).toMatchObject({
      name: 'Owner',
      tz: 'America/Los_Angeles',
      slotMin: 60,
      modes: { virtual: OWNER_VIRTUAL, in_person: OWNER_IN_PERSON },
    });
  });

  it('first save of a new consultant also writes the whole seed', async () => {
    await put('sam', HOURS);
    expect([...saved().keys()].sort()).toEqual(['jac', 'own', 'sam']);
    expect(saved().get('jac')).toMatchObject({ tz: 'America/Chicago', modes: { virtual: JACOB_VIRTUAL, in_person: [] } });
  });

  it('later saves touch only that consultant', async () => {
    await put('jac', HOURS);
    const owner = saved().get('own');
    await put('sam', { ...HOURS, tz: 'America/New_York' });
    expect(saved().get('own')).toBe(owner);
    expect(saved().get('sam')).toMatchObject({ name: 'Sam Closer', tz: 'America/New_York' });
  });

  it('names the consultant from the users doc, never the body', async () => {
    await put('sam', { ...HOURS, name: 'Mallory' });
    expect(saved().get('sam')!.name).toBe('Sam Closer');
  });
});

describe('PUT /api/portal/solar/consultants/[uid]: Meet link and phone', () => {
  const MEET = 'https://meet.google.com/abc-defg-hij';

  it('normalizes and saves both, and answers the stored values', async () => {
    const res = await put('sam', { ...HOURS, meetLink: '  Meet.Google.com/ABC-DEFG-HIJ?authuser=0 ', phone: '(512) 555-0142' });
    expect(res.status).toBe(200);
    expect((await res.json()).consultant).toMatchObject({ meetLink: MEET, phone: '+15125550142' });
    expect(saved().get('sam')).toMatchObject({ meetLink: MEET, phone: '+15125550142' });
  });

  it('refuses a link that is not Google Meet, with the field and a clear message, and writes nothing', async () => {
    for (const meetLink of ['https://zoom.us/j/123', 'https://meet.google.com.evil.co/abc-defg-hij', 'javascript:alert(1)']) {
      const res = await put('sam', { ...HOURS, meetLink });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({
        error: 'Paste a Google Meet link, like https://meet.google.com/abc-defg-hij',
        field: 'meetLink',
      });
    }
    expect(saved().size).toBe(0);
  });

  it('refuses a phone that is not phone-shaped', async () => {
    const res = await put('sam', { ...HOURS, phone: 'call me maybe' });
    expect(res.status).toBe(400);
    expect((await res.json()).field).toBe('phone');
    expect(saved().size).toBe(0);
  });

  it('keeps saved values when the keys are left out, and clears them on empty', async () => {
    await put('sam', { ...HOURS, meetLink: MEET, phone: '512-555-0142' });
    await put('sam', { ...HOURS, tz: 'America/New_York' });
    expect(saved().get('sam')).toMatchObject({ tz: 'America/New_York', meetLink: MEET, phone: '+15125550142' });
    const res = await put('sam', { ...HOURS, meetLink: '', phone: null });
    expect((await res.json()).consultant).toMatchObject({ meetLink: '', phone: '' });
    expect(saved().get('sam')).not.toHaveProperty('meetLink');
    expect(saved().get('sam')).not.toHaveProperty('phone');
  });

  it("refuses someone else's contact details to a non-admin", async () => {
    await put('sam', HOURS);
    as('sam');
    expect((await put('jac', { ...HOURS, meetLink: MEET })).status).toBe(403);
    expect(saved().get('jac')).not.toHaveProperty('meetLink');
  });
});

describe('a consultant on their own card (My availability)', () => {
  const MEET = 'https://meet.google.com/abc-defg-hij';

  it('saves their own hours, Meet link and phone, stamped with their uid, keeping Google', async () => {
    await put('sam', HOURS);
    const google = { connected: true, email: 'sam@gmail.com', freeBusy: true, connectedAt: '2026-10-01T00:00:00.000Z' };
    saved().set('sam', { ...saved().get('sam'), googleCalendar: google });
    as('sam');
    const res = await put('sam', { ...HOURS, tz: 'America/New_York', meetLink: MEET, phone: '512-555-0142' });
    expect(res.status).toBe(200);
    expect(saved().get('sam')).toMatchObject({
      tz: 'America/New_York',
      meetLink: MEET,
      phone: '+15125550142',
      updatedBy: 'sam',
      googleCalendar: google,
    });
  });

  it('can save their own seed card while the seed is served', async () => {
    as('jac');
    expect((await put('jac', HOURS)).status).toBe(200);
    expect([...saved().keys()].sort()).toEqual(['jac', 'own']);
  });

  it('cannot add themselves as a consultant', async () => {
    await put('jac', HOURS);
    as('sam');
    const res = await put('sam', HOURS);
    expect(res.status).toBe(403);
    expect(saved().has('sam')).toBe(false);
  });

  it('reads their own card, with the Google status', async () => {
    await put('sam', { ...HOURS, meetLink: MEET });
    as('sam');
    const res = await get('sam');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ seeded: false, consultant: { consultantUid: 'sam', name: 'Sam Closer', meetLink: MEET } });
  });

  it("gets 403 for someone else's card, before any lookup", async () => {
    await put('sam', HOURS);
    as('sam');
    expect((await get('jac')).status).toBe(403);
    expect((await get('nobody')).status).toBe(403);
  });

  it('gets 404 when they take no consultations', async () => {
    await put('jac', HOURS);
    as('sam');
    expect((await get('sam')).status).toBe(404);
  });

  it('an admin reads any card, the seed included', async () => {
    const res = await get('own');
    expect(res.status).toBe(200);
    expect((await res.json()).seeded).toBe(true);
  });

  it('cannot remove their own card: DELETE stays admin only', async () => {
    await put('sam', HOURS);
    as('sam');
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden: admin access required', status: 403 });
    expect((await del('sam')).status).toBe(403);
    expect(saved().has('sam')).toBe(true);
  });
});

describe('DELETE /api/portal/solar/consultants/[uid]', () => {
  it('is admin only', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden', status: 403 });
    expect((await del('own')).status).toBe(403);
  });

  it('removes a saved consultant and counts their upcoming bookings', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
    await put('jac', HOURS);
    db.store.set('solarBookings', new Map(Object.entries({
      a: { consultantUid: 'own', start: '2026-10-26T15:00:00.000Z', status: 'booked' },
      b: { consultantUid: 'own', start: '2026-10-27T15:00:00.000Z', status: 'cancelled' },
      c: { consultantUid: 'own', start: '2026-10-01T15:00:00.000Z', status: 'booked' },
      d: { consultantUid: 'jac', start: '2026-10-26T15:00:00.000Z', status: 'booked' },
    })));
    const res = await del('own');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, futureBookings: 1 });
    expect([...saved().keys()]).toEqual(['jac']);
    // Bookings are left alone.
    expect(db.store.get('solarBookings')!.size).toBe(4);
  });

  it('while the seed is served, saves the rest of it so the removed one stays gone', async () => {
    const res = await del('own');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, futureBookings: 0 });
    expect([...saved().keys()]).toEqual(['jac']);
    expect(saved().get('jac')).toMatchObject({ modes: { virtual: JACOB_VIRTUAL } });
  });

  it('refuses to remove the last consultant', async () => {
    db.store.set('solarAvailability', new Map([['jac', { name: 'Jacob', tz: 'America/Chicago', slotMin: 60, modes: {} }]]));
    const res = await del('jac');
    expect(res.status).toBe(409);
    expect(saved().has('jac')).toBe(true);
  });

  it("revokes the removed consultant's Google grant and deletes the token", async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-id.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    const google = createFakeGoogle();
    vi.stubGlobal('fetch', google.fetch);
    try {
      await put('jac', HOURS);
      db.store.set('solarGoogleTokens', new Map([['own', { refreshToken: encryptToken('1//refresh-secret', 'own'), status: 'ok' }]]));
      expect((await del('own')).status).toBe(200);
      expect(google.find('POST', 'oauth2.googleapis.com/revoke')!.body).toEqual({ token: '1//refresh-secret' });
      expect(db.store.get('solarGoogleTokens')!.has('own')).toBe(false);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('a Google failure never fails the removal', async () => {
    vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network down'); }));
    try {
      await put('jac', HOURS);
      db.store.set('solarGoogleTokens', new Map([['own', { refreshToken: encryptToken('1//refresh-secret', 'own'), status: 'ok' }]]));
      expect((await del('own')).status).toBe(200);
      expect([...saved().keys()]).toEqual(['jac']);
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it('404s for someone who is not a consultant', async () => {
    expect((await del('sam')).status).toBe(404);
    expect(saved().size).toBe(0);
  });
});
