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
