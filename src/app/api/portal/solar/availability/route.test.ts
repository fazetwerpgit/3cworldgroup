import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { GET } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false };
const MON = 'from=2026-10-26T07:00:00.000Z&to=2026-10-27T07:00:00.000Z';

function get(query: string) {
  return GET(new NextRequest(`http://localhost/api/portal/solar/availability?${query}`));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    rep1: { solarRole: 'virtual_closer' },
    fiber: { fieldRole: 'ae_tier_1' },
    own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
  })));
  mockGate.mockReset().mockResolvedValue(REP);
});
afterEach(() => vi.useRealTimers());

describe('GET /api/portal/solar/availability', () => {
  it('serves seeded slots for owner and Jacob while solarAvailability is empty', async () => {
    const res = await get(`mode=virtual&${MON}`);
    expect(res.status).toBe(200);
    const { slots } = await res.json();
    // Owner 8-5 PT (9) + Jacob 10-5 CT (7). At a shared start the owner leads (tie on bookings).
    expect(slots).toHaveLength(16);
    expect(slots.slice(0, 2)).toEqual([
      { consultantUid: 'own', name: 'Owner', start: '2026-10-26T15:00:00.000Z', end: '2026-10-26T16:00:00.000Z' },
      { consultantUid: 'jac', name: 'Jacob', start: '2026-10-26T15:00:00.000Z', end: '2026-10-26T16:00:00.000Z' },
    ]);
    expect(new Set(slots.map((s: { consultantUid: string }) => s.consultantUid))).toEqual(new Set(['jac', 'own']));
  });

  it('in-person is the owner only', async () => {
    const { slots } = await (await get(`mode=in_person&${MON}`)).json();
    expect(slots).toHaveLength(9);
    expect(slots.every((s: { consultantUid: string }) => s.consultantUid === 'own')).toBe(true);
  });

  it('drops booked slots', async () => {
    db.store.set('solarBookings', new Map([[
      'own_2026-10-26T15:00:00.000Z',
      { consultantUid: 'own', start: '2026-10-26T15:00:00.000Z', end: '2026-10-26T16:00:00.000Z', status: 'booked' },
    ]]));
    const { slots } = await (await get(`mode=in_person&${MON}`)).json();
    expect(slots).toHaveLength(8);
    expect(slots[0].start).toBe('2026-10-26T16:00:00.000Z');
  });

  it('virtual: lists first whoever has fewer bookings that day', async () => {
    db.store.set('solarBookings', new Map([[
      'own_2026-10-26T22:00:00.000Z',
      { consultantUid: 'own', start: '2026-10-26T22:00:00.000Z', end: '2026-10-26T23:00:00.000Z', status: 'booked' },
    ]]));
    const { slots } = await (await get(`mode=virtual&${MON}`)).json();
    expect(slots.slice(0, 2).map((s: { consultantUid: string }) => s.consultantUid)).toEqual(['jac', 'own']);
  });

  it('never lists a slot less than 2 hours out', async () => {
    vi.setSystemTime(new Date('2026-10-26T14:30:00Z'));
    const { slots } = await (await get(`mode=in_person&${MON}`)).json();
    expect(slots[0].start).toBe('2026-10-26T17:00:00.000Z');
  });

  it('prefers solarAvailability docs over the seed', async () => {
    db.store.set('solarAvailability', new Map([[
      'c9',
      { name: 'Closer', tz: 'America/Los_Angeles', slotMin: 60, modes: { virtual: [{ day: 1, start: '09:00', end: '11:00' }] } },
    ]]));
    const { slots } = await (await get(`mode=virtual&${MON}`)).json();
    expect(slots.map((s: { consultantUid: string; start: string }) => `${s.consultantUid}@${s.start}`)).toEqual([
      'c9@2026-10-26T16:00:00.000Z',
      'c9@2026-10-26T17:00:00.000Z',
    ]);
  });

  it('400s on a bad mode or range, 403s without solar access', async () => {
    expect((await get(`mode=phone&${MON}`)).status).toBe(400);
    expect((await get('mode=virtual&from=2026-10-27T00:00:00Z&to=2026-10-26T00:00:00Z')).status).toBe(400);
    expect((await get('mode=virtual&from=garbage')).status).toBe(400);
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber' });
    expect((await get(`mode=virtual&${MON}`)).status).toBe(403);
  });

  it('defaults to the next 14 days from now', async () => {
    const { slots } = await (await get('mode=in_person')).json();
    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((s: { start: string }) => s.start >= '2026-10-20T00:00:00.000Z' && s.start < '2026-11-03T00:00:00.000Z')).toBe(true);
  });
});
