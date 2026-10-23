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
    mockGate.mockResolvedValue(OWNER);
    const first = await patch('l1', { stage: 'appointment_demoed', outcome: 'proposal_sent' });
    expect(await first.json()).toMatchObject({
      success: true, id: 'l1', stage: 'appointment_demoed', outcome: 'proposal_sent', status: 'booked',
      entry: { stage: 'appointment_demoed', outcome: 'proposal_sent', byUid: 'own' },
    });
    expect(lead().status).toBe('booked'); // proposal sent: still open, the booking holds

    await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' });
    expect(lead().status).toBe('sold');
    await patch('l1', { stage: 'site_survey' });
    expect(lead()).toMatchObject({ stage: 'site_survey', stageOutcome: null, status: 'sold', stageChangedBy: 'own' });

    const history = lead().stageHistory as { stage: string; outcome?: string; at: string; byUid: string }[];
    expect(history.map((e) => [e.stage, e.outcome ?? null])).toEqual([
      ['appointment_demoed', 'proposal_sent'],
      ['appointment_demoed', 'sale'],
      ['site_survey', null],
    ]);
    history.forEach((e) => {
      expect(e.byUid).toBe('own');
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
    mockGate.mockResolvedValue(OWNER);
    await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' });
    expect(db.store.get('solarBookings')!.get('b1')!.status).toBe('booked');
    expect(lead()).toMatchObject({ status: 'sold', bookingId: 'b1' });
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("refuses a closer's move from sale to no sale: the lead stays sold and the booking stays", async () => {
    mockGate.mockResolvedValue(OWNER);
    await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' });
    mockGate.mockResolvedValue(CLOSER);
    const res = await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' });
    expect(res.status).toBe(403);
    expect(lead()).toMatchObject({ status: 'sold', stageOutcome: 'sale', bookingId: 'b1' });
    expect(db.store.get('solarBookings')!.get('b1')!.status).toBe('booked');
    expect(mockNotify).not.toHaveBeenCalled();
    mockGate.mockResolvedValue(ADMIN);
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' })).status).toBe(403);
    mockGate.mockResolvedValue(OWNER);
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' })).status).toBe(200);
  });

  it('lets a closer move an outcome up but not down', async () => {
    mockGate.mockResolvedValue(CLOSER);
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'proposal_sent' })).status).toBe(200);
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' })).status).toBe(403);
    expect(lead()).toMatchObject({ stageOutcome: 'proposal_sent', status: 'booked' });
    // Up to sale is a close: owners only.
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' })).status).toBe(403);
  });

  it("refuses a non-owner's change to a sold lead, lets an owner move back and clear", async () => {
    mockGate.mockResolvedValue(OWNER);
    await patch('l1', { stage: 'permit_approved' });
    for (const gate of [CLOSER, ADMIN]) {
      mockGate.mockResolvedValue(gate);
      expect((await patch('l1', { stage: 'site_survey' })).status).toBe(403);
      expect((await patch('l1', { stage: 'install_scheduled' })).status).toBe(403);
      expect((await patch('l1', { stage: null })).status).toBe(403);
      expect(lead().stage).toBe('permit_approved');
    }

    mockGate.mockResolvedValue(OWNER);
    expect((await patch('l1', { stage: 'site_survey' })).status).toBe(200);
    const cleared = await patch('l1', { stage: null });
    expect(await cleared.json()).toMatchObject({ stage: null, outcome: null, status: 'booked' });
    expect(lead()).toMatchObject({ stage: null, stageOutcome: null, status: 'booked' });
    expect((lead().stageHistory as unknown[]).length).toBe(3);
  });

  it('reads an old sold lead as sold: only an owner moves it on', async () => {
    mockGate.mockResolvedValue(CLOSER);
    expect((await patch('old_sold', { stage: 'appointment_demoed', outcome: 'proposal_sent' })).status).toBe(403);
    expect((await patch('old_sold', { stage: 'appointment_demoed', outcome: 'no_sale' })).status).toBe(403);
    expect((await patch('old_sold', { stage: 'install_scheduled' })).status).toBe(403);
    expect(lead('old_sold').status).toBe('sold');
    mockGate.mockResolvedValue(OWNER);
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

  it('a sales stage on a lead closed at pre-qualification clears its no-sale reason', async () => {
    mockGate.mockResolvedValue(CLOSER);
    db.store.get('solarLeads')!.set('l1', { repUid: 'rep1', status: 'lost', noSaleReason: 'low_credit' });
    const res = await patch('l1', { stage: 'appointment_demoed', outcome: 'proposal_sent' });
    expect(res.status).toBe(200);
    expect(lead()).toMatchObject({ stage: 'appointment_demoed', stageOutcome: 'proposal_sent', status: 'new' });
    expect('noSaleReason' in lead()).toBe(false);
  });
});

describe('PATCH /api/portal/solar/leads/[id]/stage: closing a deal is owners only', () => {
  const SOLD_MOVES = [
    { stage: 'appointment_demoed', outcome: 'sale' },
    { stage: 'site_survey' },
    { stage: 'permit_approved' },
    { stage: 'install_scheduled' },
    { stage: 'install_complete' },
    { stage: 'pto' },
  ];
  const NON_OWNERS = [
    ['an admin', ADMIN],
    ['a closer', CLOSER],
    ['a Setup consultant', CONSULTANT],
    ['a setter rep', REP],
  ] as const;

  for (const [who, gate] of NON_OWNERS) {
    it.each(SOLD_MOVES)(`403s ${who} on %j and writes nothing`, async (body) => {
      mockGate.mockResolvedValue(gate);
      const res = await patch('l1', body);
      expect(res.status).toBe(403);
      if (gate !== REP) expect((await res.json()).error).toMatch(/Only an owner/);
      expect(lead()).toMatchObject({ status: 'booked' });
      expect(lead().stage).toBeUndefined();
    });
  }

  it.each(SOLD_MOVES)('lets the owner make %j', async (body) => {
    mockGate.mockResolvedValue(OWNER);
    const res = await patch('l1', body);
    expect(res.status).toBe(200);
    expect(lead()).toMatchObject({ stage: body.stage, status: 'sold' });
  });

  it.each([
    ['an admin', ADMIN],
    ['a closer', CLOSER],
    ['a Setup consultant', CONSULTANT],
  ])('still lets %s record no sale and proposal sent', async (_, gate) => {
    mockGate.mockResolvedValue(gate);
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'proposal_sent' })).status).toBe(200);
    // Proposal sent -> no sale is a worse outcome (admins' only, as before), so start fresh.
    db.store.get('solarLeads')!.set('l1', { repUid: 'rep1', status: 'booked', bookingId: 'b1' });
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' })).status).toBe(200);
    expect(lead()).toMatchObject({ status: 'lost', stageOutcome: 'no_sale' });
  });

  it('403s a non-owner un-selling a sold lead (no sale, proposal sent, clear)', async () => {
    db.store.get('solarLeads')!.set('l1', {
      repUid: 'rep1', status: 'sold', bookingId: 'b1', stage: 'appointment_demoed', stageOutcome: 'sale',
    });
    for (const gate of [ADMIN, CLOSER, CONSULTANT]) {
      mockGate.mockResolvedValue(gate);
      for (const body of [
        { stage: 'appointment_demoed', outcome: 'no_sale' },
        { stage: 'appointment_demoed', outcome: 'proposal_sent' },
        { stage: 'appointment_demoed', outcome: 'sale' },
        { stage: null },
      ]) {
        expect((await patch('l1', body)).status).toBe(403);
      }
    }
    expect(lead()).toMatchObject({ status: 'sold', stageOutcome: 'sale' });
    expect(db.store.get('solarBookings')!.get('b1')!.status).toBe('booked');
  });
});

describe('PATCH /api/portal/solar/leads/[id]/stage: proof pins', () => {
  const HOUSE = {
    campaignId: 'solar-1', lat: 40.123456, lng: -75.65421,
    last: { dispositionId: 'appointment_set', at: 1_760_000_000_000, repId: 'rep1', knockId: 'k1' },
  };
  const pins = () => db.store.get('proofPins') ?? new Map<string, Record<string, unknown>>();
  beforeEach(() => {
    db.store.get('solarLeads')!.set('l1', { ...lead('l1'), doorId: 'h1', campaignId: 'solar-1' });
    db.store.set('houses', new Map([['h1', { ...HOUSE }]]));
    db.store.set('proofPins', new Map([['h1', {
      campaignId: 'solar-1', cell: 'dr4hq', lat: 40.123, lng: -75.654, kind: 'booked', at: HOUSE.last.at,
    }]]));
  });

  it('a sale turns the door pin solar, at the sold time, with exactly six fields', async () => {
    mockGate.mockResolvedValue(OWNER);
    const before = Date.now();
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' })).status).toBe(200);
    const pin = pins().get('h1')!;
    expect(Object.keys(pin).sort()).toEqual(['at', 'campaignId', 'cell', 'kind', 'lat', 'lng']);
    expect(pin).toMatchObject({ kind: 'solar', campaignId: 'solar-1', lat: 40.123, lng: -75.654 });
    expect(pin.at).toBeGreaterThanOrEqual(before);
  });

  it('no sale deletes the pin', async () => {
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'no_sale' })).status).toBe(200);
    expect(pins().has('h1')).toBe(false);
  });

  it('a stage that keeps the lead open leaves the pin alone', async () => {
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'proposal_sent' })).status).toBe(200);
    expect(pins().get('h1')!.kind).toBe('booked');
  });

  it('a lead without a door writes no pin', async () => {
    mockGate.mockResolvedValue(OWNER);
    db.store.get('solarLeads')!.set('l1', { repUid: 'rep1', status: 'booked', bookingId: 'b1' });
    expect((await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' })).status).toBe(200);
    expect(pins().get('h1')!.kind).toBe('booked');
  });

  it('a failing pin write never fails the stage change', async () => {
    mockGate.mockResolvedValue(OWNER);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const real = db.collection;
    const spy = vi.spyOn(db, 'collection').mockImplementation((name: string) => {
      if (name === 'proofPins') throw new Error('pins down');
      return real(name);
    });
    try {
      const res = await patch('l1', { stage: 'appointment_demoed', outcome: 'sale' });
      expect(res.status).toBe(200);
      expect(lead('l1').status).toBe('sold');
      expect(errSpy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
      errSpy.mockRestore();
    }
  });
});
