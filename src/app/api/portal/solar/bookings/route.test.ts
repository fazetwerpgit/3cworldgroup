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
const SLOT = '2026-10-26T16:00:00.000Z'; // Monday 9:00 AM PDT (8 AM is before homeowner hours in PT)
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
      start: SLOT, end: '2026-10-26T17:00:00.000Z', repUid: 'rep1', status: 'booked',
      customerTz: 'America/Los_Angeles', consultantTz: 'America/Los_Angeles',
    });
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'booked', bookingId: id });
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.alertSentAt).toBeInstanceOf(Date);

    const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
    expect(toCustomer.subject).toBe('Your solar consultation is booked');
    expect(toCustomer.textBody).toContain('Monday, October 26 at 9:00 AM');
    expect(toCustomer.textBody).toContain('in-person consultation with Owner');

    expect(mockNotifyMany).toHaveBeenCalledTimes(1);
    expect(mockNotifyMany.mock.calls[0][0]).toEqual(['jac']);
    expect(mockNotifyMany.mock.calls[0][1]).toMatchObject({ type: 'solar_lead', title: 'Solar appointment set' });
    const alert = mockEmail.mock.calls.find((c) => c[0].tag === 'solar-lead')![0];
    expect(alert.to).toBe('jmyers@3cworldgroup.com');
    expect(alert.subject).toBe('Solar appointment set: Ana Lopez');
    expect(alert.textBody).toContain('Appointment: Monday, October 26 at 9:00 AM PT, in-person, with Owner');
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

  describe("the consultant's Meet link and phone", () => {
    const MEET = 'https://meet.google.com/abc-defg-hij';
    const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, '');
    const icsOf = (call: { attachments?: { contentBase64: string }[] }) =>
      unfold(Buffer.from(call.attachments![0].contentBase64, 'base64').toString('utf8'));
    const prop = (ics: string, name: string) => ics.split('\r\n').find((l) => l.startsWith(`${name}:`))?.slice(name.length + 1);

    beforeEach(() => {
      db.store.set('solarAvailability', new Map(Object.entries({
        jac: {
          name: 'Jacob Myers', tz: 'America/Chicago', slotMin: 60,
          modes: { virtual: [{ day: 1, start: '10:00', end: '17:00' }], in_person: [{ day: 1, start: '10:00', end: '17:00' }] },
          meetLink: MEET, phone: '+15125550142',
        },
      })));
      Object.assign(db.store.get('solarLeads')!.get('rep1_c1')!, {
        phone: '512-555-0199', address: '12 Elm St', city: 'Austin', state: 'TX', zip: '78701',
      });
    });
    const JAC = { ...BODY, consultantUid: 'jac', mode: 'virtual' };

    it('snapshots them on the booking and puts them in the confirmation, with an .ics invite', async () => {
      expect((await post(JAC)).status).toBe(200);
      const id = `jac_${SLOT}`;
      expect(db.store.get('solarBookings')!.get(id)).toMatchObject({
        consultantMeetLink: MEET, consultantPhone: '+15125550142', customerAddress: '12 Elm St, Austin, TX, 78701',
      });
      const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
      expect(toCustomer.textBody).toContain(`Join on Google Meet: ${MEET}`);
      expect(toCustomer.textBody).toContain('Call or text Jacob at (512) 555-0142.');
      expect(toCustomer.htmlBody).toContain('href="tel:+15125550142"');
      expect(toCustomer.attachments).toHaveLength(1);
      expect(toCustomer.attachments[0]).toMatchObject({
        name: 'solar-consultation.ics', contentType: 'text/calendar; charset=utf-8; method=PUBLISH',
      });
      const ics = icsOf(toCustomer);
      expect(prop(ics, 'METHOD')).toBe('PUBLISH');
      expect(prop(ics, 'UID')).toBe(`${id}@3cworldgroup.com`);
      expect(prop(ics, 'DTSTART')).toBe('20261026T160000Z');
      expect(prop(ics, 'DTEND')).toBe('20261026T170000Z');
      expect(prop(ics, 'SUMMARY')).toBe('Solar consultation with Jacob Myers');
      expect(prop(ics, 'LOCATION')).toBe(MEET);
    });

    it("attaches the consultant's own .ics (same UID) and the Meet link to their notice", async () => {
      expect((await post(JAC)).status).toBe(200);
      const notice = mockEmail.mock.calls.find((c) => c[0].to === 'jmyers@3cworldgroup.com' && c[0].tag === 'solar-booking')![0];
      expect(notice.textBody).toContain(`Join on Google Meet: ${MEET}`);
      expect(notice.attachments[0]).toMatchObject({ name: 'solar-consult.ics', contentType: 'text/calendar; charset=utf-8; method=PUBLISH' });
      const ics = icsOf(notice);
      const customerIcs = icsOf(mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0]);
      expect(prop(ics, 'UID')).toBe(prop(customerIcs, 'UID'));
      expect(prop(ics, 'SUMMARY')).toBe('Solar consult: Ana Lopez');
      const d = prop(ics, 'DESCRIPTION')!;
      expect(d).toContain('Phone: (512) 555-0199');
      expect(d).toContain('Address: 12 Elm St\\, Austin\\, TX\\, 78701');
      expect(d).toContain(`Google Meet: ${MEET}`);
      expect(d).toContain('Lead: http');
      expect(d).toContain('/portal/admin/solar?tab=leads&lead=rep1_c1');
      // The lead alert names the Meet link too.
      const alert = mockEmail.mock.calls.find((c) => c[0].tag === 'solar-lead')![0];
      expect(alert.textBody).toContain(`Google Meet: ${MEET}`);
    });

    it('in person: the address is where, and the Meet link stays out of every email', async () => {
      expect((await post({ ...JAC, mode: 'in_person' })).status).toBe(200);
      const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
      expect(toCustomer.textBody).toContain('Where: 12 Elm St, Austin, TX, 78701');
      expect(prop(icsOf(toCustomer), 'LOCATION')).toBe('12 Elm St\\, Austin\\, TX\\, 78701');
      for (const [call] of mockEmail.mock.calls) {
        expect(call.textBody).not.toContain('meet.google.com');
      }
    });

    it('a consultant without them: nothing snapshotted, nothing empty in the email', async () => {
      const jac = db.store.get('solarAvailability')!.get('jac')!;
      delete jac.meetLink;
      delete jac.phone;
      expect((await post(JAC)).status).toBe(200);
      const booking = db.store.get('solarBookings')!.get(`jac_${SLOT}`)!;
      expect(booking).not.toHaveProperty('consultantMeetLink');
      expect(booking).not.toHaveProperty('consultantPhone');
      const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
      expect(toCustomer.textBody).not.toMatch(/Google Meet|Call or text|undefined/);
      expect(toCustomer.attachments).toHaveLength(1);
      expect(prop(icsOf(toCustomer), 'LOCATION')).toBeUndefined();
    });
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
      // Booked, cancelled (no Google: the .ics cancel), booked again.
      expect(mockEmail.mock.calls.filter((c) => c[0].to === 'ana@example.com').map((c) => c[0].subject)).toEqual([
        'Your solar consultation is booked',
        'Your solar consultation is cancelled',
        'Your solar consultation is booked',
      ]);
      // Still one lead alert per lead.
      expect(mockNotifyMany).toHaveBeenCalledTimes(1);
    });

    it("a cancel removes the door's booked pin and booking again restores it", async () => {
      const HOUSE = {
        campaignId: 'solar-1', lat: 40.123456, lng: -75.654321,
        last: { dispositionId: 'appointment_set', at: 1_760_000_000_000, repId: 'rep1', knockId: 'k1' },
      };
      const PIN = { campaignId: 'solar-1', cell: 'dr4hq', lat: 40.123, lng: -75.654, kind: 'booked', at: HOUSE.last.at };
      db.store.get('solarLeads')!.set('rep1_c1', { ...db.store.get('solarLeads')!.get('rep1_c1')!, doorId: 'h1' });
      db.store.set('houses', new Map([['h1', { ...HOUSE }]]));
      db.store.set('proofPins', new Map([['h1', { ...PIN }]]));

      const first = await (await post(BODY)).json();
      expect(db.store.get('proofPins')!.get('h1')).toEqual(PIN);
      mockGate.mockResolvedValue({ ...REP, uid: 'jac', isAdmin: true, role: 'owner', solarRole: null });
      const cancel = await PATCH(
        new NextRequest(`http://localhost/api/portal/solar/bookings/${first.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'cancelled' }),
        }),
        { params: Promise.resolve({ id: first.id }) }
      );
      expect(cancel.status).toBe(200);
      expect(db.store.get('proofPins')!.has('h1')).toBe(false);

      mockGate.mockResolvedValue(REP);
      expect((await post(BODY)).status).toBe(200);
      expect(db.store.get('proofPins')!.get('h1')).toEqual(PIN);
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
    vi.setSystemTime(new Date('2026-10-26T14:30:00Z')); // 7:30 AM PDT; 9:00 AM is 1.5h away
    const res = await post(BODY);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'slot_unavailable' });
    vi.setSystemTime(new Date('2026-10-26T14:00:00Z')); // exactly 2h
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
      expect(toCustomer.textBody).toContain('on Monday, October 26 at 12:00 PM ET.');
      // Consultant (Jacob, Iowa): Central, with the customer's time beside it.
      const notice = mockNotify.mock.calls.find((c) => c[0].type === 'solar_booking')![0];
      expect(notice.message).toContain('virtual, Monday, October 26 at 11:00 AM CT (12:00 PM ET for the customer) with Jacob');
    });

    it("the lead's state beats the body's customerTz, so the client can't widen the window", async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { ...db.store.get('solarLeads')!.get('rep1_c1'), state: 'FL' });
      expect((await post({ ...BODY, customerTz: 'America/Denver' })).status).toBe(200);
      expect(db.store.get('solarBookings')!.get(`own_${SLOT}`)!.customerTz).toBe('America/New_York');
      // Now Mon Oct 19, 8 PM ET: the Florida window ends Nov 3 05:00Z, Hawaii's
      // at 10:00Z. Asking for Honolulu doesn't stretch a Florida lead's window.
      db.store.get('solarLeads')!.set('rep1_c2', { ...db.store.get('solarLeads')!.get('rep1_c2'), state: 'FL' });
      const late = { ...BODY, leadId: 'rep1_c2', start: '2026-11-03T06:00:00.000Z', customerTz: 'Pacific/Honolulu' };
      const farFl = await post(late);
      expect(farFl.status).toBe(400);
      expect(await farFl.json()).toMatchObject({ reason: 'too_far' });
      // Without a state the same ask is inside the Hawaii window (refused only as an unoffered slot).
      db.store.get('solarLeads')!.set('rep1_c2', { ...db.store.get('solarLeads')!.get('rep1_c2'), state: '' });
      const noState = await post(late);
      expect(noState.status).toBe(400);
      expect((await noState.json()).reason).toBeUndefined();
    });

    it('uses a US-zone customerTz only for a lead without a state, and ignores others', async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { ...db.store.get('solarLeads')!.get('rep1_c1'), state: '' });
      expect((await post({ ...BODY, customerTz: 'America/Denver' })).status).toBe(200);
      expect(db.store.get('solarBookings')!.get(`own_${SLOT}`)!.customerTz).toBe('America/Denver');

      db.store.get('solarLeads')!.set('rep1_c2', { ...db.store.get('solarLeads')!.get('rep1_c2'), state: '' });
      const SLOT2 = '2026-10-26T17:00:00.000Z';
      // A real IANA zone outside the US list falls back to the consultant's.
      expect((await post({ ...BODY, leadId: 'rep1_c2', start: SLOT2, customerTz: 'Asia/Tokyo' })).status).toBe(200);
      expect(db.store.get('solarBookings')!.get(`own_${SLOT2}`)!.customerTz).toBe('America/Los_Angeles');
    });

    it('books across the fall-back DST change at the right instant', async () => {
      // Sun Nov 1 2026 US clocks fall back. Monday Nov 2, 9:00 AM PST = 17:00Z
      // (a week earlier, 9:00 AM PDT was 16:00Z).
      vi.setSystemTime(new Date('2026-10-30T00:00:00Z'));
      expect((await post({ ...BODY, start: '2026-11-02T16:00:00.000Z' })).status).toBe(400);
      const res = await post({ ...BODY, start: '2026-11-02T17:00:00.000Z' });
      expect(res.status).toBe(200);
      const toCustomer = mockEmail.mock.calls.find((c) => c[0].to === 'ana@example.com')![0];
      expect(toCustomer.textBody).toContain('Monday, November 2 at 9:00 AM PT');
    });
  });

  describe('homeowner hours (9:00 AM - 8:00 PM start, homeowner local time)', () => {
    // Tue Oct 27, 7 PM PDT: inside the owner's virtual hours (Tue 8-8 PT), 10 PM in Florida.
    const SEVEN_PM_PT = '2026-10-28T02:00:00.000Z';
    const LATE = { ...BODY, mode: 'virtual', start: SEVEN_PM_PT };

    it("rejects a slot past 8 PM in the lead's zone (a stale list can't book it)", async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { ...db.store.get('solarLeads')!.get('rep1_c1'), state: 'FL' });
      const res = await post(LATE);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'slot_unavailable' });
      expect(db.store.get('solarBookings')).toBeUndefined();
      expect(mockEmail).not.toHaveBeenCalled();
    });

    it("rejects it by the body's customerTz for a lead without a state", async () => {
      const res = await post({ ...LATE, customerTz: 'America/New_York' });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'slot_unavailable' });
    });

    it("books it for a Pacific homeowner, and with no zone at all on the consultant's (Pacific)", async () => {
      expect((await post({ ...LATE, customerTz: 'America/Los_Angeles' })).status).toBe(200);
      expect((await post({ ...LATE, leadId: 'rep1_c2', start: '2026-10-28T01:00:00.000Z' })).status).toBe(200);
    });

    it("rejects 8 AM in the consultant's zone when the homeowner's is unknown", async () => {
      const res = await post({ ...BODY, start: '2026-10-26T15:00:00.000Z' }); // Mon 8 AM PDT
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'slot_unavailable' });
    });
  });

  describe('booking window (14 days)', () => {
    it('400s a slot more than 14 days out, before any slot math', async () => {
      // Now is Tue Oct 20 00:00Z; Monday Nov 9 9:00 AM PST is ~20 days out.
      const res = await post({ ...BODY, start: '2026-11-09T17:00:00.000Z' });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ error: 'slot_unavailable', reason: 'too_far' });
      expect(db.store.get('solarBookings')).toBeUndefined();
    });

    it("counts 14 calendar days in the customer's zone, through the end of day 14", async () => {
      // Now: Mon Oct 19, 5 PM Pacific (the customer's zone: no state, the owner's).
      // Day 14 is Mon Nov 2, so the window ends Nov 3 00:00 PST (08:00Z).
      expect((await post({ ...BODY, start: '2026-11-02T17:00:00.000Z' })).status).toBe(200);
      const tue = await post({ ...BODY, leadId: 'rep1_c2', start: '2026-11-03T17:00:00.000Z' });
      expect(tue.status).toBe(400);
      expect(await tue.json()).toMatchObject({ reason: 'too_far' });
      // Just after midnight Pacific on Oct 20, day 14 is Tue Nov 3: bookable,
      // though a rolling 336 hours (to Nov 3 07:30Z) would refuse it.
      vi.setSystemTime(new Date('2026-10-20T07:30:00Z'));
      expect((await post({ ...BODY, leadId: 'rep1_c2', start: '2026-11-03T17:00:00.000Z' })).status).toBe(200);
    });

    it("ends the window at midnight in a Florida customer's zone", async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { ...db.store.get('solarLeads')!.get('rep1_c1'), state: 'FL' });
      // Now: Mon Oct 19, 8 PM ET, so the window ends Nov 3 00:00 EST (05:00Z).
      // Tue Nov 3 9 AM PST (17:00Z) is day 15 in Florida.
      const res = await post({ ...BODY, start: '2026-11-03T17:00:00.000Z' });
      expect(res.status).toBe(400);
      expect(await res.json()).toMatchObject({ reason: 'too_far' });
    });

    it('still answers a retry for a held booking whatever it asks for', async () => {
      expect((await post(BODY)).status).toBe(200);
      const res = await post({ ...BODY, start: '2026-12-07T17:00:00.000Z' });
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

  it('409s a lead closed at pre-qualification (Under 600) and books nothing', async () => {
    db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', first: 'Ana', status: 'lost', noSaleReason: 'low_credit' });
    const res = await post(BODY);
    expect(res.status).toBe(409);
    expect(db.store.get('solarBookings')?.size ?? 0).toBe(0);
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.status).toBe('lost');
  });

  it('409s a lead declined for low credit after the pre-check, inside the transaction', async () => {
    const real = db.runTransaction.bind(db);
    // The lead turns Under 600 between the pre-check and the transaction.
    const spy = vi.spyOn(db, 'runTransaction').mockImplementation(((fn: Parameters<typeof real>[0]) => {
      Object.assign(db.store.get('solarLeads')!.get('rep1_c1')!, { status: 'lost', noSaleReason: 'low_credit' });
      return real(fn);
    }) as typeof real);
    const res = await post(BODY);
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/pre-qualify/);
    expect(db.store.get('solarBookings')?.size ?? 0).toBe(0);
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'lost', noSaleReason: 'low_credit' });
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it.each([
    ['status sold', { status: 'sold' }],
    ['a sold stage', { status: 'booked', stage: 'site_survey' }],
  ])('409s a sold deal (%s) and books nothing', async (_, sold) => {
    db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', first: 'Ana', ...sold });
    const res = await post(BODY);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('This deal is already sold.');
    expect(db.store.get('solarBookings')?.size ?? 0).toBe(0);
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject(sold);
  });

  it('409s a lead marked sold after the pre-check, inside the transaction', async () => {
    const real = db.runTransaction.bind(db);
    const spy = vi.spyOn(db, 'runTransaction').mockImplementation(((fn: Parameters<typeof real>[0]) => {
      Object.assign(db.store.get('solarLeads')!.get('rep1_c1')!, { status: 'sold' });
      return real(fn);
    }) as typeof real);
    const res = await post(BODY);
    spy.mockRestore();
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('This deal is already sold.');
    expect(db.store.get('solarBookings')?.size ?? 0).toBe(0);
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.status).toBe('sold');
    expect(mockEmail).not.toHaveBeenCalled();
  });
});
