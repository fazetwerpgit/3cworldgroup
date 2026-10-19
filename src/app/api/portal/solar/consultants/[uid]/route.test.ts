import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedAdmin: vi.fn(), requireVerifiedUser: vi.fn() }));

import { DELETE, PUT } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { JACOB_VIRTUAL, OWNER_IN_PERSON, OWNER_VIRTUAL } from '@/lib/solar/availability';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedAdmin as unknown as ReturnType<typeof vi.fn>;

const HOURS = {
  tz: 'America/Denver',
  slotMin: 30,
  modes: { virtual: [{ day: 2, start: '09:00', end: '12:00' }], in_person: [] },
};
const url = (uid: string) => `http://localhost/api/portal/solar/consultants/${uid}`;
const put = (uid: string, body: unknown) =>
  PUT(new NextRequest(url(uid), { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ uid }) });
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
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('PUT /api/portal/solar/consultants/[uid]', () => {
  it('is admin only and writes nothing otherwise', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden: admin access required', status: 403 });
    expect((await put('sam', HOURS)).status).toBe(403);
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
    expect(await res.json()).toEqual({ consultant: { consultantUid: 'jac', name: 'Jacob', ...HOURS } });
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

  it('404s for someone who is not a consultant', async () => {
    expect((await del('sam')).status).toBe(404);
    expect(saved().size).toBe(0);
  });
});
