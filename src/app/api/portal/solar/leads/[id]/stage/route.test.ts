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

const mockNotify = createNotification as unknown as ReturnType<typeof vi.fn>;
const mockPush = sendPushToUser as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;

const base = { ok: true, name: 'X', email: 'x@x.com', isOwner: false, isAdmin: false, solarRole: null as string | null };
const REP = { ...base, uid: 'rep1', solarRole: 'ae_canvasser' };
const MANAGER = { ...base, uid: 'mgr', solarRole: 'canvass_manager' };
const CLOSER = { ...base, uid: 'clo', solarRole: 'virtual_closer' };
const CONSULTANT = { ...base, uid: 'con', solarRole: null };
const ADMIN = { ...base, uid: 'adm', isAdmin: true, role: 'admin' };
const OWNER = { ...base, uid: 'own', isAdmin: true, isOwner: true, role: 'owner' };

function patch(id: string, body: unknown) {
  return PATCH(
    new NextRequest(`http://localhost/api/portal/solar/leads/${id}/stage`, {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { Authorization: 'Bearer t' },
    }),
    { params: Promise.resolve({ id }) }
  );
}

const lead = (id = 'l1') => db.store.get('solarLeads')!.get(id)!;

beforeEach(() => {
  db.store.clear();
  db.store.set('solarAvailability', new Map([['con', { name: 'Consultant', modes: {} }]]));
  db.store.set(
    'solarLeads',
    new Map<string, Record<string, unknown>>([
      ['l1', { repUid: 'rep1', status: 'booked', bookingId: 'b1' }],
      ['old_sold', { repUid: 'rep1', status: 'sold' }],
    ])
  );
  db.store.set('solarBookings', new Map([['b1', {
    leadId: 'l1', consultantUid: 'con', consultantName: 'Consultant', repUid: 'rep1', customerName: 'Ana',
    mode: 'virtual', status: 'booked', start: '2026-10-26T15:00:00.000Z',
  }]]));
  db.store.set('users', new Map(Object.entries({ con: { displayName: 'Consultant' }, rep1: { displayName: 'Rep' } })));
  mockGate.mockReset().mockResolvedValue(ADMIN);
  for (const m of [mockNotify, mockPush, mockEmail]) m.mockClear();
});

describe('PATCH /api/portal/solar/leads/[id]/stage: who', () => {
  it('401s without a token', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await patch('l1', { stage: 'site_survey' })).status).toBe(401);
  });

  it.each([
    ['a canvasser rep', REP],
    ['a canvass manager', MANAGER],
    ['a fiber rep', { ...base, uid: 'fib', fieldRole: 'ae_tier_1' }],
  ])('403s %s and writes nothing', async (_, gate) => {
    mockGate.mockResolvedValue(gate);
    const res = await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' });
    expect(res.status).toBe(403);
    expect(lead().stage).toBeUndefined();
  });

  it.each([
    ['a closer', CLOSER],
    ['a Setup consultant', CONSULTANT],
    ['an admin', ADMIN],
    ['the owner', OWNER],
  ])('lets %s set a stage', async (_, gate) => {
    mockGate.mockResolvedValue(gate);
    const res = await patch('l1', { stage: 'appointment_demoed', outcome: 'proposal_sent' });
    expect(res.status).toBe(200);
    expect(lead()).toMatchObject({ stage: 'appointment_demoed', stageOutcome: 'proposal_sent' });
  });
});

describe('PATCH /api/portal/solar/leads/[id]/stage: what', () => {
  it('records history and keeps status in step', async () => {
    mockGate.mockResolvedValue(CLOSER);
    const first = await patch('l1', { stage: 'appointment_demoed', outcome: 'proposal_sent' });
    expect(await first.json()).toMatchObject({
      success: true, id: 'l1', stage: 'appointment_demoed', outcome: 'proposal_sent', status: 'booked',
      entry: { stage: 'appointment_demoed', outcome: 'proposal_sent', byUid: 'clo' },
    });
    expect(lead().status).toBe('booked'); // proposal sent: still open, the booking holds

    await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' });
    expect(lead().status).toBe('sold');
    await patch('l1', { stage: 'site_survey' });
    expect(lead()).toMatchObject({ stage: 'site_survey', stageOutcome: null, status: 'sold', stageChangedBy: 'clo' });

    const history = lead().stageHistory as { stage: string; outcome?: string; at: string; byUid: string }[];
    expect(history.map((e) => [e.stage, e.outcome ?? null])).toEqual([
      ['appointment_demoed', 'proposal_sent'],
      ['appointment_demoed', 'sale'],
      ['site_survey', null],
    ]);
    history.forEach((e) => {
      expect(e.byUid).toBe('clo');
      expect(Number.isNaN(Date.parse(e.at))).toBe(false);
    });
  });

  it('no sale cancels the live booking like Mark lost: slot freed, bookingId cleared, notices sent', async () => {
    const res = await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'lost', cancelledBookingId: 'b1' });
    expect(lead()).toMatchObject({
      status: 'lost', bookingId: null, stage: 'appointment_demoed', stageOutcome: 'no_sale', statusChangedBy: 'adm',
    });
    expect((lead().stageHistory as unknown[]).length).toBe(1);
    expect(db.store.get('solarBookings')!.get('b1')).toMatchObject({ status: 'cancelled', cancelledBy: 'adm' });
    expect(mockNotify.mock.calls.map((c) => c[0].userId).sort()).toEqual(['con', 'rep1']);
    expect(mockNotify.mock.calls[0][0].message).toContain('The lead was marked lost.');
    expect(mockPush.mock.calls.map((c) => c[0]).sort()).toEqual(['con', 'rep1']);
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it('no sale with no live booking only closes the lead and notifies nobody', async () => {
    db.store.get('solarBookings')!.set('b1', { status: 'cancelled', consultantUid: 'con', repUid: 'rep1' });
    const res = await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' });
    const body = await res.json();
    expect(body.status).toBe('lost');
    expect(body.cancelledBookingId).toBeUndefined();
    expect(lead()).toMatchObject({ status: 'lost', bookingId: 'b1' });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it('a sale keeps the booking', async () => {
    await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' });
    expect(db.store.get('solarBookings')!.get('b1')!.status).toBe('booked');
    expect(lead()).toMatchObject({ status: 'sold', bookingId: 'b1' });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("refuses a non-admin's move back, lets an admin move back and clear", async () => {
    mockGate.mockResolvedValue(CLOSER);
    await patch('l1', { stage: 'permit_approved' });
    expect((await patch('l1', { stage: 'site_survey' })).status).toBe(403);
    expect((await patch('l1', { stage: null })).status).toBe(403);
    expect(lead().stage).toBe('permit_approved');

    mockGate.mockResolvedValue(ADMIN);
    expect((await patch('l1', { stage: 'site_survey' })).status).toBe(200);
    const cleared = await patch('l1', { stage: null });
    expect(await cleared.json()).toMatchObject({ stage: null, outcome: null, status: 'booked' });
    expect(lead()).toMatchObject({ stage: null, stageOutcome: null, status: 'booked' });
    expect((lead().stageHistory as unknown[]).length).toBe(3);
  });

  it('reads an old sold lead as demoed + sale, so a closer can move it on', async () => {
    mockGate.mockResolvedValue(CLOSER);
    expect((await patch('old_sold', { stage: 'appointment_demoed', outcome: 'proposal_sent' })).status).toBe(200);
    expect((await patch('old_sold', { stage: 'install_scheduled' })).status).toBe(200);
    expect(lead('old_sold')).toMatchObject({ stage: 'install_scheduled', status: 'sold' });
  });

  it.each([
    [{}, /stage is required/],
    [{ stage: 'closed' }, /Invalid stage/],
    [{ stage: 'appointment_demoed' }, /needs an outcome/],
    [{ stage: 'appointment_demoed', outcome: 'maybe' }, /needs an outcome/],
    [{ stage: 'pto', outcome: 'sale' }, /outcome only goes with/],
  ])('400s on %j', async (body, error) => {
    const res = await patch('l1', body);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(error);
  });

  it('404s on a missing lead or a bad id', async () => {
    expect((await patch('nope', { stage: 'pto' })).status).toBe(404);
    expect((await patch('bad id!', { stage: 'pto' })).status).toBe(404);
  });
});
