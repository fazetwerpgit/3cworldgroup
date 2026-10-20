import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedAdmin: vi.fn(), requireVerifiedUser: vi.fn() }));

import { GET } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedAdmin as unknown as ReturnType<typeof vi.fn>;
const get = () => GET(new NextRequest('http://localhost/api/portal/solar/consultants'));

beforeEach(() => {
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
  })));
  mockGate.mockReset().mockResolvedValue({ ok: true, uid: 'adm', name: 'Admin' });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('GET /api/portal/solar/consultants', () => {
  it('is admin only', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden: admin access required', status: 403 });
    const res = await get();
    expect(res.status).toBe(403);
  });

  it('serves the seed, marked seeded, while nothing is saved', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.seeded).toBe(true);
    expect(body.consultants.map((c: { consultantUid: string }) => c.consultantUid)).toEqual(['own', 'jac']);
    expect(body.consultants[1]).toMatchObject({ name: 'Jacob', tz: 'America/Chicago', slotMin: 60 });
  });

  it('serves the saved consultants by name once any exist', async () => {
    db.store.set('solarAvailability', new Map(Object.entries({
      zed: {
        name: 'Zed', tz: 'America/Denver', slotMin: 30, modes: { virtual: [{ day: 1, start: '09:00', end: '10:00' }] },
        meetLink: 'https://meet.google.com/abc-defg-hij', phone: '+15125550142',
      },
      amy: { name: 'Amy', tz: 'America/New_York', slotMin: 90, modes: {} },
    })));
    const body = await (await get()).json();
    expect(body).toEqual({
      seeded: false,
      consultants: [
        {
          consultantUid: 'amy', name: 'Amy', tz: 'America/New_York', slotMin: 90, modes: { virtual: [], in_person: [] },
          meetLink: '', phone: '',
        },
        {
          consultantUid: 'zed', name: 'Zed', tz: 'America/Denver', slotMin: 30,
          modes: { virtual: [{ day: 1, start: '09:00', end: '10:00' }], in_person: [] },
          meetLink: 'https://meet.google.com/abc-defg-hij', phone: '+15125550142',
        },
      ],
    });
  });

  it('fails with 500 instead of an empty list', async () => {
    vi.spyOn(db, 'collection').mockImplementationOnce(() => { throw new Error('unavailable'); });
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).not.toHaveProperty('consultants');
  });
});
