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
const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false, solarRole: 'ae_canvasser' };

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/portal/solar/leads/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    { params: Promise.resolve({ id }) }
  );
}

beforeEach(() => {
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    rep1: { solarRole: 'ae_canvasser' },
    rep2: { solarRole: 'ae_canvasser' },
    adm: { role: 'admin' },
    fiber: { fieldRole: 'ae_tier_1' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
  })));
  db.store.set('solarLeads', new Map([['rep1_c1', { repUid: 'rep1', first: 'Ana', creditTier: null }]]));
  mockGate.mockReset().mockResolvedValue(REP);
  mockNotify.mockClear();
  mockPush.mockClear();
  mockEmail.mockClear();
});

describe('PATCH /api/portal/solar/leads/[id]', () => {
  it('lets the creator set creditTier', async () => {
    const res = await patch('rep1_c1', { creditTier: 'lease_ppa_680' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 'rep1_c1' });
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.creditTier).toBe('lease_ppa_680');
  });

  it('lets an admin set it', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'adm', isAdmin: true, role: 'admin', solarRole: null });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(200);
  });

  it('403s another solar rep', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'rep2' });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(403);
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.creditTier).toBeNull();
  });

  it('403s a caller without solar access', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber', fieldRole: 'ae_tier_1', solarRole: null });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(403);
  });

  it('401s without a token', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(401);
  });

  it('400s on a bad tier and 404s on a missing lead', async () => {
    expect((await patch('rep1_c1', { creditTier: 'gold' })).status).toBe(400);
    expect((await patch('nope', { creditTier: 'purchase_600' })).status).toBe(404);
  });

  describe('app fields', () => {
    const lead = () => db.store.get('solarLeads')!.get('rep1_c1')!;

    it('lets the creator update roofType, heavyShade, monthlyKwh and usage without a creditTier', async () => {
      const res = await patch('rep1_c1', { roofType: 'flat', heavyShade: true, monthlyKwh: 900, usage: { daily: 30 } });
      expect(res.status).toBe(200);
      expect(lead()).toMatchObject({ roofType: 'flat', heavyShade: true, needsReview: true, monthlyKwh: 900, usage: { daily: 30 }, creditTier: null });
    });

    it('lets an admin clear needsReview', async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', needsReview: true });
      mockGate.mockResolvedValue({ ...REP, uid: 'adm', isAdmin: true, role: 'admin', solarRole: null });
      expect((await patch('rep1_c1', { needsReview: false })).status).toBe(200);
      expect(lead().needsReview).toBe(false);
    });

    it('refuses a blocked roof and another rep', async () => {
      const res = await patch('rep1_c1', { roofType: 'metal' });
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/doesn't qualify/);
      mockGate.mockResolvedValue({ ...REP, uid: 'rep2' });
      expect((await patch('rep1_c1', { roofType: 'flat' })).status).toBe(403);
      expect(lead().roofType).toBeUndefined();
    });
  });

  describe('usage from the deck (monthlyKwh, usage)', () => {
    const lead = () => db.store.get('solarLeads')!.get('rep1_c1')!;
    const USAGE = { mode: 'monthly', months: [900, 1000], daily: '', annual: '' };

    it('lets the owner rep save them, rounding monthlyKwh', async () => {
      const res = await patch('rep1_c1', { monthlyKwh: 950.6, usage: USAGE });
      expect(res.status).toBe(200);
      expect(lead()).toMatchObject({ monthlyKwh: 951, usage: USAGE, creditTier: null });
      expect(lead().updatedAt).toBeInstanceOf(Date);
    });

    it('lets an admin save them', async () => {
      mockGate.mockResolvedValue({ ...REP, uid: 'adm', isAdmin: true, role: 'admin', solarRole: null });
      expect((await patch('rep1_c1', { monthlyKwh: 700 })).status).toBe(200);
      expect(lead().monthlyKwh).toBe(700);
    });

    it('lets a Setup consultant or a closer save them, but nothing else', async () => {
      db.store.set('solarAvailability', new Map([['con', { name: 'Consultant', modes: {} }]]));
      mockGate.mockResolvedValue({ ...REP, uid: 'con', solarRole: 'ae_canvasser' });
      expect((await patch('rep1_c1', { monthlyKwh: 800, usage: USAGE })).status).toBe(200);
      expect(lead().monthlyKwh).toBe(800);
      expect((await patch('rep1_c1', { monthlyKwh: 810, roofType: 'flat' })).status).toBe(403);
      expect((await patch('rep1_c1', { creditTier: 'purchase_600' })).status).toBe(403);
      mockGate.mockResolvedValue({ ...REP, uid: 'closer', solarRole: 'virtual_closer' });
      expect((await patch('rep1_c1', { monthlyKwh: 820 })).status).toBe(200);
      expect(lead()).toMatchObject({ monthlyKwh: 820, creditTier: null });
      expect(lead().roofType).toBeUndefined();
    });

    it('403s another rep who is not a consultant', async () => {
      db.store.set('solarAvailability', new Map([['con', { name: 'Consultant', modes: {} }]]));
      mockGate.mockResolvedValue({ ...REP, uid: 'rep2' });
      expect((await patch('rep1_c1', { monthlyKwh: 800 })).status).toBe(403);
      expect(lead().monthlyKwh).toBeUndefined();
    });

    it('monthlyKwh null removes the stored figure', async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', monthlyKwh: 900, usage: USAGE, creditTier: null });
      const res = await patch('rep1_c1', { monthlyKwh: null, usage: { mode: 'monthly', months: [] } });
      expect(res.status).toBe(200);
      expect('monthlyKwh' in lead()).toBe(false);
      expect(lead()).toMatchObject({ usage: { mode: 'monthly', months: [] }, creditTier: null });
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', monthlyKwh: 900 });
      expect((await patch('rep1_c1', { monthlyKwh: null })).status).toBe(200);
      expect('monthlyKwh' in lead()).toBe(false);
    });

    it('400s a bad monthlyKwh or a usage over 4KB', async () => {
      expect((await patch('rep1_c1', { monthlyKwh: -1 })).status).toBe(400);
      expect((await patch('rep1_c1', { monthlyKwh: 'lots' })).status).toBe(400);
      expect((await patch('rep1_c1', { usage: { note: 'x'.repeat(5000) } })).status).toBe(400);
      expect(lead().monthlyKwh).toBeUndefined();
      expect(lead().usage).toBeUndefined();
    });
  });

  describe('contact edits from the review slide', () => {
    const lead = () => db.store.get('solarLeads')!.get('rep1_c1')!;
    const CONTACT = {
      first: ' Ana ', last: 'Ruiz', phone: '(559) 555-0101', email: 'Ana@Example.com',
      address: '12 Elm St', city: 'Fresno', state: 'CA', zip: '93701',
    };
    beforeEach(() => {
      db.store.get('solarLeads')!.set('rep1_c1', {
        repUid: 'rep1', status: 'new', first: 'Anna', last: 'Ruis', phone: '', email: 'old@example.com',
        address: '1 Old Rd', city: 'Clovis', state: 'CA', zip: '93611', creditTier: null,
      });
    });

    it('lets the owner rep fix name, phone, email and address on an open lead, cleaned as on create', async () => {
      const res = await patch('rep1_c1', CONTACT);
      expect(res.status).toBe(200);
      expect(lead()).toMatchObject({
        first: 'Ana', last: 'Ruiz', phone: '(559) 555-0101', email: 'ana@example.com',
        address: '12 Elm St', city: 'Fresno', state: 'CA', zip: '93701', creditTier: null, status: 'new',
      });
    });

    it('still open while booked: the live booking gets the new name and email in the same write', async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'booked', bookingId: 'b1' });
      db.store.set('solarBookings', new Map([['b1', {
        leadId: 'rep1_c1', status: 'booked', customerName: 'Anna Ruis', customerEmail: 'old@example.com', consultantUid: 'con',
      }]]));
      expect((await patch('rep1_c1', CONTACT)).status).toBe(200);
      expect(lead().first).toBe('Ana');
      expect(db.store.get('solarBookings')!.get('b1')).toMatchObject({
        customerName: 'Ana Ruiz', customerEmail: 'ana@example.com', status: 'booked', consultantUid: 'con',
      });
    });

    it('leaves a cancelled booking alone', async () => {
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'new', bookingId: 'b1' });
      db.store.set('solarBookings', new Map([['b1', { status: 'cancelled', customerName: 'Anna Ruis', customerEmail: 'old@example.com' }]]));
      expect((await patch('rep1_c1', CONTACT)).status).toBe(200);
      expect(db.store.get('solarBookings')!.get('b1')).toMatchObject({ customerName: 'Anna Ruis', customerEmail: 'old@example.com' });
    });

    it('403s another rep', async () => {
      mockGate.mockResolvedValue({ ...REP, uid: 'rep2' });
      const res = await patch('rep1_c1', CONTACT);
      expect(res.status).toBe(403);
      expect(lead().first).toBe('Anna');
    });

    it('lets an admin or owner fix them too, still only while open', async () => {
      mockGate.mockResolvedValue({ ...REP, uid: 'adm', isAdmin: true, role: 'admin', solarRole: null });
      expect((await patch('rep1_c1', CONTACT)).status).toBe(200);
      expect(lead()).toMatchObject({ first: 'Ana', repUid: 'rep1' });
      mockGate.mockResolvedValue({ ...REP, uid: 'jac', isAdmin: true, isOwner: true, role: 'owner', solarRole: null });
      expect((await patch('rep1_c1', { ...CONTACT, first: 'Anita' })).status).toBe(200);
      expect(lead().first).toBe('Anita');
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'sold', first: 'Anna' });
      const res = await patch('rep1_c1', CONTACT);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe('This lead is closed, so its contact details can no longer be changed.');
    });

    it('403s a consultant sneaking contact fields in with usage', async () => {
      db.store.set('solarAvailability', new Map([['con', { name: 'Consultant', modes: {} }]]));
      mockGate.mockResolvedValue({ ...REP, uid: 'con' });
      expect((await patch('rep1_c1', { monthlyKwh: 900, ...CONTACT })).status).toBe(403);
      expect(lead()).toMatchObject({ first: 'Anna' });
      expect(lead().monthlyKwh).toBeUndefined();
    });

    it('409s once the lead has a stage or is sold / lost', async () => {
      for (const closed of [
        { status: 'booked', stage: 'appointment_demoed', stageOutcome: 'proposal_sent' },
        { status: 'sold' },
        { status: 'lost' },
      ]) {
        db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', first: 'Anna', ...closed });
        const res = await patch('rep1_c1', CONTACT);
        expect(res.status).toBe(409);
        expect(lead().first).toBe('Anna');
      }
    });

    it('400s what create refuses', async () => {
      const bad: [Record<string, unknown>, RegExp][] = [
        [{ ...CONTACT, first: '  ' }, /First and last name/],
        [{ ...CONTACT, last: undefined }, /First and last name/],
        [{ ...CONTACT, email: '' }, /Email is required/],
        [{ ...CONTACT, email: 'ana@' }, /valid email/],
        [{ ...CONTACT, phone: 'call me' }, /valid phone/],
        [{ phone: '5595550101' }, /First and last name/],
      ];
      for (const [body, error] of bad) {
        const res = await patch('rep1_c1', body);
        expect(res.status).toBe(400);
        expect((await res.json()).error).toMatch(error);
      }
      expect(lead()).toMatchObject({ first: 'Anna', email: 'old@example.com' });
    });

    it('404s a missing lead', async () => {
      expect((await patch('nope', CONTACT)).status).toBe(404);
    });
  });

  describe('status', () => {
    const ADMIN = { ...REP, uid: 'adm', isAdmin: true, role: 'admin', solarRole: null };
    const lead = () => db.store.get('solarLeads')!.get('rep1_c1')!;

    it('lets an admin mark a lead sold or lost', async () => {
      mockGate.mockResolvedValue(ADMIN);
      const res = await patch('rep1_c1', { status: 'sold' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, id: 'rep1_c1', status: 'sold' });
      expect(lead()).toMatchObject({ status: 'sold', statusChangedBy: 'adm' });
      expect((await patch('rep1_c1', { status: 'lost' })).status).toBe(200);
      expect(lead().status).toBe('lost');
    });

    it('mark lost cancels the live booking in the same write: slot freed, bookingId cleared, notices sent', async () => {
      mockGate.mockResolvedValue(ADMIN);
      const B = 'jac_2026-10-26T15:00:00.000Z';
      db.store.set('solarBookings', new Map([[B, {
        leadId: 'rep1_c1', consultantUid: 'jac', consultantName: 'Jacob', repUid: 'rep1', customerName: 'Ana',
        mode: 'virtual', start: '2026-10-26T15:00:00.000Z', status: 'booked',
      }]]));
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'booked', bookingId: B });
      const res = await patch('rep1_c1', { status: 'lost' });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, id: 'rep1_c1', status: 'lost', cancelledBookingId: B });
      expect(lead()).toMatchObject({ status: 'lost', bookingId: null, statusChangedBy: 'adm' });
      expect(db.store.get('solarBookings')!.get(B)).toMatchObject({ status: 'cancelled', cancelledBy: 'adm' });
      expect(mockNotify.mock.calls.map((c) => c[0].userId).sort()).toEqual(['jac', 'rep1']);
      expect(mockNotify.mock.calls[0][0].message).toContain('The lead was marked lost.');
      expect(mockPush.mock.calls.map((c) => c[0]).sort()).toEqual(['jac', 'rep1']);
      expect(mockEmail).not.toHaveBeenCalled();
    });

    it('mark lost with no live booking only closes the lead and notifies nobody', async () => {
      mockGate.mockResolvedValue(ADMIN);
      db.store.set('solarBookings', new Map([['b1', { status: 'cancelled', consultantUid: 'jac', repUid: 'rep1' }]]));
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'new', bookingId: 'b1' });
      expect(await (await patch('rep1_c1', { status: 'lost' })).json()).toEqual({ success: true, id: 'rep1_c1', status: 'lost' });
      expect(lead()).toMatchObject({ status: 'lost', bookingId: 'b1' });
      expect(mockNotify).not.toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('mark sold keeps the booking', async () => {
      mockGate.mockResolvedValue(ADMIN);
      db.store.set('solarBookings', new Map([['b1', { status: 'booked', consultantUid: 'jac', repUid: 'rep1' }]]));
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'booked', bookingId: 'b1' });
      expect((await patch('rep1_c1', { status: 'sold' })).status).toBe(200);
      expect(db.store.get('solarBookings')!.get('b1')!.status).toBe('booked');
      expect(lead()).toMatchObject({ status: 'sold', bookingId: 'b1' });
      expect(mockNotify).not.toHaveBeenCalled();
    });

    it('reopens to booked while a live booking holds the slot, else to new', async () => {
      mockGate.mockResolvedValue(ADMIN);
      db.store.set('solarBookings', new Map([['b1', { status: 'booked' }]]));
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'lost', bookingId: 'b1' });
      expect(await (await patch('rep1_c1', { status: 'new' })).json()).toMatchObject({ status: 'booked' });

      db.store.get('solarBookings')!.set('b1', { status: 'cancelled' });
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'sold', bookingId: 'b1' });
      expect(await (await patch('rep1_c1', { status: 'booked' })).json()).toMatchObject({ status: 'new' });
      expect(lead().status).toBe('new');
    });

    it('moves the stage with the status: sold, lost, reopen (history kept)', async () => {
      mockGate.mockResolvedValue(ADMIN);
      await patch('rep1_c1', { status: 'sold' });
      expect(lead()).toMatchObject({ stage: 'appointment_demoed', stageOutcome: 'sale', stageChangedBy: 'adm' });
      await patch('rep1_c1', { status: 'lost' });
      expect(lead()).toMatchObject({ stage: 'appointment_demoed', stageOutcome: 'no_sale' });
      await patch('rep1_c1', { status: 'new' });
      expect(lead()).toMatchObject({ status: 'new', stage: null, stageOutcome: null });
      const history = lead().stageHistory as { stage: string | null; outcome?: string; byUid: string }[];
      expect(history.map((e) => [e.stage, e.outcome ?? null])).toEqual([
        ['appointment_demoed', 'sale'],
        ['appointment_demoed', 'no_sale'],
        [null, null],
      ]);
    });

    it('mark sold keeps a later stage', async () => {
      mockGate.mockResolvedValue(ADMIN);
      db.store.get('solarLeads')!.set('rep1_c1', { repUid: 'rep1', status: 'sold', stage: 'site_survey', stageHistory: [] });
      await patch('rep1_c1', { status: 'sold' });
      expect(lead()).toMatchObject({ stage: 'site_survey', stageHistory: [] });
    });

    it('403s anyone but an admin, even the rep who created it', async () => {
      expect((await patch('rep1_c1', { status: 'sold' })).status).toBe(403);
      expect(lead().status).toBeUndefined();
    });

    it('400s an unknown status and 404s a missing lead', async () => {
      mockGate.mockResolvedValue(ADMIN);
      expect((await patch('rep1_c1', { status: 'won' })).status).toBe(400);
      expect((await patch('nope', { status: 'sold' })).status).toBe(404);
      expect((await patch('nope', { status: 'lost' })).status).toBe(404);
    });
  });
});
