import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));

import { PATCH } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;

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

beforeEach(() => {
  db.store.clear();
  db.store.set('solarBookings', new Map([[ID, { leadId: 'rep1_c1', consultantUid: 'jac', start: '2026-10-26T15:00:00.000Z', status: 'booked' }]]));
  db.store.set('solarLeads', new Map([['rep1_c1', { repUid: 'rep1', status: 'booked', bookingId: ID }]]));
  mockGate.mockReset().mockResolvedValue(ADMIN);
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
});
