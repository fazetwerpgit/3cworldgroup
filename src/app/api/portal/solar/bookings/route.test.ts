import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));
vi.mock('@/lib/userRateLimits', () => ({ userRateLimited: vi.fn(() => null) }));
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotification: vi.fn(async () => 'n1'),
  createNotificationForMany: vi.fn(async () => {}),
}));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn(async () => {}) }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

import { POST } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { userRateLimited } from '@/lib/userRateLimits';
import { createNotification } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockLimit = userRateLimited as unknown as ReturnType<typeof vi.fn>;
const mockNotify = createNotification as unknown as ReturnType<typeof vi.fn>;
const mockPush = sendPushToUser as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;

const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false };
const SLOT = '2026-10-26T15:00:00.000Z'; // Monday 8:00 AM PDT
const BODY = { leadId: 'rep1_c1', mode: 'in_person', consultantUid: 'own', start: SLOT };

function post(body: unknown) {
  return POST(new NextRequest('http://localhost/api/portal/solar/bookings', { method: 'POST', body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T00:00:00Z'));
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    rep1: { displayName: 'Rep One', solarRole: 'canvass_closer' },
    rep2: { displayName: 'Rep Two', solarRole: 'canvass_closer' },
    fiber: { fieldRole: 'ae_tier_1' },
    own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
  })));
  db.store.set('solarLeads', new Map(Object.entries({
    rep1_c1: { repUid: 'rep1', first: 'Ana', last: 'Lopez', email: 'ana@example.com', status: 'new' },
    rep1_c2: { repUid: 'rep1', first: 'Bo', last: 'Kim', email: '', status: 'new' },
  })));
  mockGate.mockReset().mockResolvedValue(REP);
  mockLimit.mockReset().mockReturnValue(null);
  mockNotify.mockClear();
  mockPush.mockClear();
  mockEmail.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('POST /api/portal/solar/bookings', () => {
  it('books an open slot, stamps the lead, emails the customer and alerts the consultant', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(200);
    const id = `own_${SLOT}`;
    expect(await res.json()).toEqual({ success: true, id });
    expect(db.store.get('solarBookings')!.get(id)).toMatchObject({
      leadId: 'rep1_c1', mode: 'in_person', consultantUid: 'own', consultantName: 'Owner',
      start: SLOT, end: '2026-10-26T16:00:00.000Z', repUid: 'rep1', status: 'booked',
    });
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'booked', bookingId: id });

    const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
    expect(toCustomer.subject).toBe('Your solar consultation is booked');
    expect(toCustomer.textBody).toContain('Monday, October 26 at 8:00 AM');
    expect(toCustomer.textBody).toContain('in-person consultation with Owner');
    expect(toCustomer.replyTo).toBe('owner@3cworldgroup.com');
    expect(mockEmail.mock.calls.some((c) => c[0].to === 'owner@3cworldgroup.com')).toBe(true);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'own', type: 'solar_booking' }));
    expect(mockPush).toHaveBeenCalledWith('own', expect.objectContaining({ title: 'Solar consult booked' }));
  });

  it('409s slot_taken on the second booking of the same slot', async () => {
    expect((await post(BODY)).status).toBe(200);
    const res = await post({ ...BODY, leadId: 'rep1_c2', mode: 'virtual' });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'slot_taken' });
  });

  it('409s when create() loses a race', async () => {
    const real = db.collection;
    const spy = vi.spyOn(db, 'collection').mockImplementation((name: string) => {
      const c = real(name);
      if (name !== 'solarBookings') return c;
      return { ...c, doc: (id: string) => ({ ...c.doc(id), create: async () => { throw Object.assign(new Error('exists'), { code: 6 }); } }) };
    });
    const res = await post(BODY);
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'slot_taken' });
  });

  it('skips the customer email when the lead has none', async () => {
    expect((await post({ ...BODY, leadId: 'rep1_c2' })).status).toBe(200);
    expect(mockEmail.mock.calls.map((c) => c[0].to)).toEqual(['owner@3cworldgroup.com']);
  });

  it('400s a slot the consultant does not offer', async () => {
    // Wednesday: no in-person hours; 8:30 is off the grid; Jacob has no in-person.
    for (const patch of [
      { start: '2026-10-28T15:00:00.000Z' },
      { start: '2026-10-26T15:30:00.000Z' },
      { consultantUid: 'jac' },
      { start: '2026-10-19T15:00:00.000Z' },
    ]) {
      const res = await post({ ...BODY, ...patch });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'slot_unavailable' });
    }
    expect(db.store.get('solarBookings')).toBeUndefined();
  });

  it('400s bad input, 404s a missing lead', async () => {
    expect((await post({ ...BODY, mode: 'phone' })).status).toBe(400);
    expect((await post({ ...BODY, start: 'soon' })).status).toBe(400);
    expect((await post({ ...BODY, leadId: '' })).status).toBe(400);
    expect((await post({ ...BODY, leadId: 'missing' })).status).toBe(404);
  });

  it("403s booking another rep's lead, and callers without solar access", async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'rep2' });
    expect((await post(BODY)).status).toBe(403);
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber' });
    expect((await post(BODY)).status).toBe(403);
  });

  it('lets an admin book any lead', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'jac', isAdmin: true });
    expect((await post(BODY)).status).toBe(200);
  });

  it('returns 401 and 429 from the gates', async () => {
    mockLimit.mockReturnValueOnce(new Response(null, { status: 429 }));
    expect((await post(BODY)).status).toBe(429);
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await post(BODY)).status).toBe(401);
  });
});
