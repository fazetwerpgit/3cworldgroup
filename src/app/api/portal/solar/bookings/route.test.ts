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
import { PATCH } from './[id]/route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { userRateLimited } from '@/lib/userRateLimits';
import { createNotification, createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockLimit = userRateLimited as unknown as ReturnType<typeof vi.fn>;
const mockNotify = createNotification as unknown as ReturnType<typeof vi.fn>;
const mockNotifyMany = createNotificationForMany as unknown as ReturnType<typeof vi.fn>;
const mockPush = sendPushToUser as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;

const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false, solarRole: 'canvass_closer' };
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
  mockNotifyMany.mockClear();
  mockPush.mockClear();
  mockEmail.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('POST /api/portal/solar/bookings', () => {
  it('books an open slot, stamps the lead, emails the customer, and sends the one lead alert', async () => {
    const res = await post(BODY);
    expect(res.status).toBe(200);
    const id = `own_${SLOT}`;
    expect(await res.json()).toEqual({
      success: true, id, consultantUid: 'own', consultantName: 'Owner', start: SLOT, mode: 'in_person',
      customerTz: 'America/Los_Angeles',
    });
    // No state on the lead and no customerTz in the body: the consultant's zone.
    expect(db.store.get('solarBookings')!.get(id)).toMatchObject({
      leadId: 'rep1_c1', mode: 'in_person', consultantUid: 'own', consultantName: 'Owner',
      start: SLOT, end: '2026-10-26T16:00:00.000Z', repUid: 'rep1', status: 'booked',
      customerTz: 'America/Los_Angeles', consultantTz: 'America/Los_Angeles',
    });
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'booked', bookingId: id });
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.alertSentAt).toBeInstanceOf(Date);

    const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
    expect(toCustomer.subject).toBe('Your solar consultation is booked');
    expect(toCustomer.textBody).toContain('Monday, October 26 at 8:00 AM');
    expect(toCustomer.textBody).toContain('in-person consultation with Owner');

    expect(mockNotifyMany).toHaveBeenCalledTimes(1);
    expect(mockNotifyMany.mock.calls[0][0]).toEqual(['jac']);
    expect(mockNotifyMany.mock.calls[0][1]).toMatchObject({ type: 'solar_lead', title: 'Solar appointment set' });
    const alert = mockEmail.mock.calls.find((c) => c[0].tag === 'solar-lead')![0];
    expect(alert.to).toBe('jmyers@3cworldgroup.com');
    expect(alert.subject).toBe('Solar appointment set: Ana Lopez');
    expect(alert.textBody).toContain('Appointment: Monday, October 26 at 8:00 AM PT, in-person, with Owner');
  });

  it("sends the owner nothing by default: the owner's booking notice goes to Jacob", async () => {
    expect((await post(BODY)).status).toBe(200);
    const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
    expect(toCustomer.replyTo).toBe('jmyers@3cworldgroup.com');
    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'jac', type: 'solar_booking', title: "[Owner's calendar] Solar consult booked" })
    );
    expect(mockPush).toHaveBeenCalledWith('jac', expect.objectContaining({ title: "[Owner's calendar] Solar consult booked" }));

    const userIds = [
      ...mockNotify.mock.calls.map((c) => c[0].userId),
      ...mockNotifyMany.mock.calls.flatMap((c) => c[0]),
      ...mockPush.mock.calls.map((c) => c[0]),
    ];
    expect(userIds).not.toContain('own');
    expect(mockEmail.mock.calls.map((c) => c[0].to)).not.toContain('owner@3cworldgroup.com');
  });

  it('notifies the owner directly once settings/solar.notifyOwner is on', async () => {
    db.store.set('settings', new Map([['solar', { notifyOwner: true, leadAlertUids: ['own', 'jac'] }]]));
    expect((await post(BODY)).status).toBe(200);
    const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
    expect(toCustomer.replyTo).toBe('owner@3cworldgroup.com');
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'own', title: 'Solar consult booked' }));
    expect(mockPush).toHaveBeenCalledWith('own', expect.objectContaining({ title: 'Solar consult booked' }));
    expect(mockNotifyMany.mock.calls[0][0]).toEqual(['own', 'jac']);
  });

  it("sends Jacob's own bookings to him unprefixed", async () => {
    expect((await post({ ...BODY, mode: 'virtual', consultantUid: 'jac', start: '2026-10-26T15:00:00.000Z' })).status).toBe(200);
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'jac', title: 'Solar consult booked' }));
    expect(mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0].replyTo).toBe('jmyers@3cworldgroup.com');
  });

  it('links the booking notice and the lead alert to the lead on the admin Leads tab', async () => {
    expect((await post(BODY)).status).toBe(200);
    const href = '/portal/admin/solar?tab=leads&lead=rep1_c1';
    expect(mockNotify).toHaveBeenCalledWith(expect.objectContaining({ link: href, metadata: expect.objectContaining({ leadId: 'rep1_c1' }) }));
    expect(mockNotifyMany.mock.calls[0][1]).toMatchObject({ link: href });
    expect(mockPush).toHaveBeenCalledWith('jac', expect.objectContaining({ url: href }));
  });

  describe('one active booking per lead', () => {
    const emailsTo = (to: string) => mockEmail.mock.calls.filter((c) => c[0].to === to).length;

    it('answers a duplicate POST for the same slot with the same booking and sends nothing again', async () => {
      const first = await (await post(BODY)).json();
      const res = await post(BODY);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ ...first, duplicate: true });
      expect(emailsTo('ana@example.com')).toBe(1);
      expect(mockNotify).toHaveBeenCalledTimes(1);
      expect(mockNotifyMany).toHaveBeenCalledTimes(1);
      expect(mockEmail.mock.calls.filter((c) => c[0].tag === 'solar-lead')).toHaveLength(1);
      expect(db.store.get('solarBookings')!.size).toBe(1);
    });

    it('answers a retry on another consultant or time with the original booking', async () => {
      const first = await (await post(BODY)).json();
      const res = await post({ ...BODY, mode: 'virtual', consultantUid: 'jac', start: SLOT });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        success: true, id: first.id, duplicate: true, consultantUid: 'own', consultantName: 'Owner', start: SLOT, mode: 'in_person',
        customerTz: 'America/Los_Angeles',
      });
      expect(db.store.get('solarBookings')!.size).toBe(1);
      expect(db.store.get('solarLeads')!.get('rep1_c1')!.bookingId).toBe(first.id);
      expect(emailsTo('ana@example.com')).toBe(1);
    });

    it('gives two leads racing for one slot exactly one booking and one 409', async () => {
      const [a, b] = await Promise.all([post(BODY), post({ ...BODY, leadId: 'rep1_c2' })]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(await loser.json()).toEqual({ error: 'slot_taken' });
      expect(db.store.get('solarBookings')!.size).toBe(1);
      const booked = [...db.store.get('solarLeads')!.values()].filter((l) => l.status === 'booked');
      expect(booked).toHaveLength(1);
    });

    it('books the lead again, even the same slot, once its booking is cancelled', async () => {
      const first = await (await post(BODY)).json();
      mockGate.mockResolvedValue({ ...REP, uid: 'jac', isAdmin: true, role: 'owner', solarRole: null });
      const cancel = await PATCH(
        new NextRequest(`http://localhost/api/portal/solar/bookings/${first.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled' }),
        }),
        { params: Promise.resolve({ id: first.id }) }
      );
      expect(cancel.status).toBe(200);
      expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'new', bookingId: null });

      mockGate.mockResolvedValue(REP);
      const again = await post(BODY);
      expect(again.status).toBe(200);
      const body = await again.json();
      expect(body.duplicate).toBeUndefined();
      expect(body.id).toBe(first.id);
      expect(db.store.get('solarBookings')!.get(first.id)).toMatchObject({ status: 'booked', leadId: 'rep1_c1' });
      // The cancelled booking stays as history under its own id.
      const history = [...db.store.get('solarBookings')!.entries()].filter(([id]) => id !== first.id);
      expect(history).toHaveLength(1);
      expect(history[0][1]).toMatchObject({ status: 'cancelled', leadId: 'rep1_c1' });
      expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'booked', bookingId: first.id });
      expect(emailsTo('ana@example.com')).toBe(2);
      // Still one lead alert per lead.
      expect(mockNotifyMany).toHaveBeenCalledTimes(1);
    });
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
    // Jacob's "[Owner's calendar]" notice, then the lead alert.
    expect(mockEmail.mock.calls.map((c) => c[0].to)).toEqual(['jmyers@3cworldgroup.com', 'jmyers@3cworldgroup.com']);
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

  it('400s a slot less than 2 hours out', async () => {
    vi.setSystemTime(new Date('2026-10-26T13:30:00Z')); // 6:30 AM PDT; 8:00 AM is 1.5h away
    const res = await post(BODY);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'slot_unavailable' });
    vi.setSystemTime(new Date('2026-10-26T13:00:00Z')); // exactly 2h
    expect((await post(BODY)).status).toBe(200);
  });

  describe('time zones', () => {
    it("stores the customer's zone from the lead's state and words each notice in its reader's zone", async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { ...db.store.get('solarLeads')!.get('rep1_c1'), state: 'fl' });
      const res = await post({ ...BODY, mode: 'virtual', consultantUid: 'jac' });
      expect(res.status).toBe(200);
      expect((await res.json()).customerTz).toBe('America/New_York');
      expect(db.store.get('solarBookings')!.get(`jac_${SLOT}`)).toMatchObject({
        start: SLOT, customerTz: 'America/New_York', consultantTz: 'America/Chicago',
      });
      // Customer (Florida): Eastern.
      const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
      expect(toCustomer.textBody).toContain('on Monday, October 26 at 11:00 AM ET.');
      // Consultant (Jacob, Iowa): Central, with the customer's time beside it.
      const notice = mockNotify.mock.calls.find((c) => c[0].type === 'solar_booking')![0];
      expect(notice.message).toContain('virtual, Monday, October 26 at 10:00 AM CT (11:00 AM ET for the customer) with Jacob');
    });

    it("prefers a valid customerTz from the body, and ignores a bogus one", async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { ...db.store.get('solarLeads')!.get('rep1_c1'), state: 'FL' });
      expect((await post({ ...BODY, customerTz: 'America/Denver' })).status).toBe(200);
      expect(db.store.get('solarBookings')!.get(`own_${SLOT}`)!.customerTz).toBe('America/Denver');

      db.store.get('solarLeads')!.set('rep1_c2', { ...db.store.get('solarLeads')!.get('rep1_c2'), state: 'TX' });
      const SLOT2 = '2026-10-26T16:00:00.000Z';
      expect((await post({ ...BODY, leadId: 'rep1_c2', start: SLOT2, customerTz: 'Mars/Olympus' })).status).toBe(200);
      expect(db.store.get('solarBookings')!.get(`own_${SLOT2}`)!.customerTz).toBe('America/Chicago');
    });

    it('books across the fall-back DST change at the right instant', async () => {
      // Sun Nov 1 2026 US clocks fall back. Monday Nov 2, 8:00 AM PST = 16:00Z
      // (a week earlier, 8:00 AM PDT was 15:00Z).
      vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
      expect((await post({ ...BODY, start: '2026-11-02T15:00:00.000Z' })).status).toBe(400);
      const res = await post({ ...BODY, start: '2026-11-02T16:00:00.000Z' });
      expect(res.status).toBe(200);
      const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
      expect(toCustomer.textBody).toContain('Monday, November 2 at 8:00 AM PT');
    });
  });

  describe('booking window (14 days)', () => {
    it('400s a slot more than 14 days out, before any slot math', async () => {
      // Now is Tue Oct 20 00:00Z; Monday Nov 9 8:00 AM PST is ~20 days out.
      const res = await post({ ...BODY, start: '2026-11-09T16:00:00.000Z' });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'slot_unavailable', reason: 'too_far' });
      expect(db.store.get('solarBookings')).toBeUndefined();
    });

    it('books a slot just inside the window and refuses one just past it', async () => {
      // Window ends Nov 3 00:00Z. Monday Nov 2 8:00 AM PST (16:00Z) is inside.
      expect((await post({ ...BODY, start: '2026-11-02T16:00:00.000Z' })).status).toBe(200);
      vi.setSystemTime(new Date('2026-10-19T15:59:00Z')); // the window now ends Nov 2 15:59Z
      expect((await post({ ...BODY, leadId: 'rep1_c2', start: '2026-11-02T17:00:00.000Z' })).status).toBe(400);
    });

    it('still answers a retry for a held booking whatever it asks for', async () => {
      expect((await post(BODY)).status).toBe(200);
      const res = await post({ ...BODY, start: '2026-12-07T16:00:00.000Z' });
      expect(res.status).toBe(200);
      expect((await res.json()).duplicate).toBe(true);
    });
  });

  it('books Jacob virtual on Central Time hours', async () => {
    // 10 AM CDT Monday = 15:00Z; 9 AM CDT (14:00Z) is outside his hours.
    expect((await post({ ...BODY, mode: 'virtual', consultantUid: 'jac', start: '2026-10-26T14:00:00.000Z' })).status).toBe(400);
    expect((await post({ ...BODY, mode: 'virtual', consultantUid: 'jac', start: '2026-10-26T15:00:00.000Z' })).status).toBe(200);
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
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber', fieldRole: 'ae_tier_1', solarRole: null });
    expect((await post(BODY)).status).toBe(403);
  });

  it('lets an admin book any lead', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'jac', isAdmin: true, isOwner: true, role: 'owner', solarRole: null });
    expect((await post(BODY)).status).toBe(200);
  });

  it('returns 401 and 429 from the gates', async () => {
    mockLimit.mockReturnValueOnce(new Response(null, { status: 429 }));
    expect((await post(BODY)).status).toBe(429);
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await post(BODY)).status).toBe(401);
  });
});
