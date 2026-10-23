import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));
vi.mock('@/lib/notifications/createNotification', () => ({ createNotification: vi.fn(async () => 'n1') }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn(async () => {}) }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

import { PATCH } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { createNotification } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockNotify = createNotification as unknown as ReturnType<typeof vi.fn>;
const mockPush = sendPushToUser as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;
const notified = () => mockNotify.mock.calls.map((c) => [c[0].userId, c[0].title]);
const pushed = () => mockPush.mock.calls.map((c) => c[0]);

const ID = 'jac_2026-10-26T15:00:00.000Z';
const ADMIN = { ok: true, uid: 'adm', name: 'Ada', email: 'a@x.com', isAdmin: true, isOwner: false, role: 'admin', solarRole: null };
const CONSULTANT = { ok: true, uid: 'jac', name: 'Jacob', email: 'j@x.com', isAdmin: false, isOwner: false, solarRole: 'sales_director' };
const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'r@x.com', isAdmin: false, isOwner: false, solarRole: 'ae_canvasser' };

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/portal/solar/bookings/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
}

const LIVE = {
  leadId: 'rep1_c1', consultantUid: 'jac', consultantName: 'Jacob', repUid: 'rep1', customerName: 'Ana Lopez',
  mode: 'virtual', start: '2026-10-26T15:00:00.000Z', status: 'booked',
};

beforeEach(() => {
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    rep1: { displayName: 'Rep One', solarRole: 'ae_canvasser' },
    adm: { displayName: 'Ada', role: 'admin' },
    own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
  })));
  db.store.set('solarBookings', new Map([[ID, { ...LIVE }]]));
  db.store.set('solarLeads', new Map([['rep1_c1', { repUid: 'rep1', status: 'booked', bookingId: ID }]]));
  mockGate.mockReset().mockResolvedValue(ADMIN);
  mockNotify.mockClear();
  mockPush.mockClear();
  mockEmail.mockClear();
});

describe('PATCH /api/portal/solar/bookings/[id]', () => {
  it('lets an admin cancel: the booking frees its slot and the lead goes back to new', async () => {
    const res = await patch(ID, { status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: ID });
    expect(db.store.get('solarBookings')!.get(ID)).toMatchObject({ status: 'cancelled', cancelledBy: 'adm' });
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'new', bookingId: null });
  });

  it("lets the booking's own consultant cancel", async () => {
    mockGate.mockResolvedValue(CONSULTANT);
    expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
  });

  it('403s the rep who booked it and anyone else', async () => {
    mockGate.mockResolvedValue(REP);
    expect((await patch(ID, { status: 'cancelled' })).status).toBe(403);
    expect(db.store.get('solarBookings')!.get(ID)!.status).toBe('booked');
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.status).toBe('booked');
  });

  it('keeps a closed lead closed and leaves a lead that moved on alone', async () => {
    db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'sold', bookingId: ID });
    expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'sold', bookingId: null });

    db.store.get('solarBookings')!.set('b2', { leadId: 'rep1_c1', consultantUid: 'jac', status: 'booked' });
    db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'booked', bookingId: 'other' });
    expect((await patch('b2', { status: 'cancelled' })).status).toBe(200);
    expect(db.store.get('solarLeads')!.get('rep1_c1')).toMatchObject({ status: 'booked', bookingId: 'other' });
  });

  it('is a no-op on a booking already cancelled', async () => {
    db.store.get('solarBookings')!.set(ID, { leadId: 'rep1_c1', consultantUid: 'jac', status: 'cancelled', cancelledBy: 'x' });
    expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
    expect(db.store.get('solarBookings')!.get(ID)!.cancelledBy).toBe('x');
  });

  it('400s any other status, 404s a missing booking, passes the gate through', async () => {
    expect((await patch(ID, { status: 'booked' })).status).toBe(400);
    expect((await patch(ID, {})).status).toBe(400);
    expect((await patch('nope', { status: 'cancelled' })).status).toBe(404);
    expect((await patch('../x', { status: 'cancelled' })).status).toBe(404);
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await patch(ID, { status: 'cancelled' })).status).toBe(401);
  });

  describe('cancel notices', () => {
    it('notifies the rep and the consultant (portal + push); no homeowner email without one on the booking', async () => {
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      expect(notified()).toEqual(expect.arrayContaining([
        ['jac', 'Solar consult cancelled'],
        ['rep1', 'Solar consult cancelled'],
      ]));
      expect(notified()).toHaveLength(2);
      expect(pushed().sort()).toEqual(['jac', 'rep1']);
      expect(mockNotify.mock.calls[0][0]).toMatchObject({
        type: 'solar_booking',
        metadata: { bookingId: ID, leadId: 'rep1_c1', cancelled: true },
      });
      // No zones stored on this (older) booking: Pacific, as the old notices read.
      expect(mockNotify.mock.calls[0][0].message).toContain('Ana Lopez: virtual, Monday, October 26 at 8:00 AM PT with Jacob');
      // Not on Google: only the consultant's .ics cancel (the booking has no customerEmail).
      expect(mockEmail.mock.calls.map((c) => c[0].to)).toEqual(['jmyers@3cworldgroup.com']);
      expect(mockEmail.mock.calls[0][0].attachments[0].contentType).toContain('method=CANCEL');
    });

    it("tells the consultant in their zone and the rep in the customer's", async () => {
      db.store.get('solarBookings')!.set(ID, {
        ...db.store.get('solarBookings')!.get(ID),
        consultantTz: 'America/Chicago',
        customerTz: 'America/Los_Angeles',
      });
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      const messageTo = (uid: string) => mockNotify.mock.calls.find((c) => c[0].userId === uid)![0].message as string;
      expect(messageTo('jac')).toContain('Monday, October 26 at 10:00 AM CT (8:00 AM PT for the customer) with Jacob');
      expect(messageTo('rep1')).toContain('Monday, October 26 at 8:00 AM PT with Jacob');
    });

    it('never notifies whoever cancelled', async () => {
      mockGate.mockResolvedValue(CONSULTANT);
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      expect(notified()).toEqual([['rep1', 'Solar consult cancelled']]);
      expect(pushed()).toEqual(['rep1']);
    });

    it("sends the owner nothing by default: the owner's cancel notice goes to Jacob", async () => {
      db.store.get('solarBookings')!.set(ID, { ...LIVE, consultantUid: 'own', consultantName: 'Owner', mode: 'in_person' });
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      expect(notified()).toEqual(expect.arrayContaining([
        ['jac', "[Owner's calendar] Solar consult cancelled"],
        ['rep1', 'Solar consult cancelled'],
      ]));
      expect(notified().map(([uid]) => uid)).not.toContain('own');
      expect(pushed()).not.toContain('own');
      // Jacob got the owner-calendar .ics, so he gets its cancel; the owner gets nothing.
      expect(mockEmail.mock.calls.map((c) => c[0].to)).toEqual(['jmyers@3cworldgroup.com']);
      expect(mockEmail.mock.calls[0][0].subject).toBe("[Portal] [Owner's calendar] Solar consult cancelled");
    });

    it('sends the owner nothing when the owner booked it either', async () => {
      db.store.get('solarBookings')!.set(ID, { ...LIVE, repUid: 'own' });
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      expect(notified()).toEqual([['jac', 'Solar consult cancelled']]);
      expect(pushed()).toEqual(['jac']);
    });

    it('notifies the owner directly once settings/solar.notifyOwner is on', async () => {
      db.store.set('settings', new Map([['solar', { notifyOwner: true }]]));
      db.store.get('solarBookings')!.set(ID, { ...LIVE, consultantUid: 'own', consultantName: 'Owner' });
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      expect(notified()).toEqual(expect.arrayContaining([['own', 'Solar consult cancelled'], ['rep1', 'Solar consult cancelled']]));
      expect(notified().map(([uid]) => uid)).not.toContain('jac');
    });

    it('sends nothing for a booking already cancelled', async () => {
      db.store.get('solarBookings')!.set(ID, { ...LIVE, status: 'cancelled' });
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      expect(mockNotify).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('still cancels when a notice fails', async () => {
      mockNotify.mockRejectedValueOnce(new Error('down'));
      mockPush.mockRejectedValueOnce(new Error('down'));
      expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
      expect(db.store.get('solarBookings')!.get(ID)!.status).toBe('cancelled');
    });
  });
});

describe('PATCH /api/portal/solar/bookings/[id]: proof pins', () => {
  const PIN = { campaignId: 'solar-1', cell: 'dr4hq', lat: 40.123, lng: -75.654, kind: 'booked', at: 1_760_000_000_000 };
  beforeEach(() => {
    db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'booked', bookingId: ID, doorId: 'h1' });
    db.store.set('proofPins', new Map([['h1', { ...PIN }]]));
  });

  it('a cancel deletes the door pin', async () => {
    expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
    expect(db.store.get('proofPins')!.has('h1')).toBe(false);
  });

  it('a sold lead keeps its solar pin', async () => {
    db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'sold', bookingId: ID, doorId: 'h1' });
    db.store.get('proofPins')!.set('h1', { ...PIN, kind: 'solar' });
    expect((await patch(ID, { status: 'cancelled' })).status).toBe(200);
    expect(db.store.get('proofPins')!.get('h1')!.kind).toBe('solar');
  });
});
