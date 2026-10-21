import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));
// View as rep: no header is the caller themself (the real resolver's no-header path).
vi.mock('@/lib/auth/viewAs', () => ({
  resolveSubject: vi.fn(async (_request: unknown, caller: { uid: string }) => ({ ok: true, viewing: false, uid: caller.uid })),
}));

import { GET } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { resolveSubject } from '@/lib/auth/viewAs';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const get = (query = '') => GET(new NextRequest(`http://localhost/api/portal/solar/leaderboard${query}`));

const solarRep = { ok: true, uid: 'ana', name: 'Ana', solarRole: 'entry_canvasser', demoAccount: false, isAdmin: false, isOwner: false };
const fiberRep = { ok: true, uid: 'fib', name: 'Fib', fieldRole: 'entry_rep', solarRole: null, demoAccount: false, isAdmin: false, isOwner: false };
const admin = { ok: true, uid: 'adm', name: 'Admin', role: 'admin', solarRole: null, demoAccount: false, isAdmin: true, isOwner: false };

// Thursday 2026-10-15, noon in Chicago: the week began Sunday 10-11.
const NOW = new Date('2026-10-15T17:00:00Z');
const booking = (repUid: string | null, createdAt: string, extra: Record<string, unknown> = {}) => ({
  ...(repUid ? { repUid } : {}),
  leadId: 'lead-' + Math.random().toString(36).slice(2),
  mode: 'virtual',
  status: 'booked',
  createdAt: new Date(createdAt),
  ...extra,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    ana: { status: 'active', displayName: 'Ana Rivera', solarRole: 'entry_canvasser' },
    ben: { status: 'active', displayName: 'Ben Cole', solarRole: 'virtual_closer' },
    cy: { status: 'active', displayName: 'Cy Diaz', solarRole: 'entry_canvasser' },
    fib: { status: 'active', displayName: 'Fib Rep', fieldRole: 'entry_rep' },
  })));
  mockGate.mockReset().mockResolvedValue(solarRep);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
});

describe('GET /api/portal/solar/leaderboard — gating', () => {
  it('passes a failed sign-in through', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await get()).status).toBe(401);
  });

  it('is 403 for a fiber rep with no solar role', async () => {
    mockGate.mockResolvedValue(fiberRep);
    const res = await get('?period=week');
    expect(res.status).toBe(403);
    expect(await res.json()).not.toHaveProperty('leaderboard');
  });

  it('serves a solar rep and an admin', async () => {
    expect((await get()).status).toBe(200);
    mockGate.mockResolvedValue(admin);
    expect((await get()).status).toBe(200);
  });
});

describe('GET /api/portal/solar/leaderboard — counting', () => {
  it('ranks by booked consults and leaves cancelled bookings out', async () => {
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking('ana', '2026-10-12T15:00:00Z'),
      b2: booking('ana', '2026-10-13T15:00:00Z', { mode: 'in_person' }),
      b3: booking('ben', '2026-10-13T16:00:00Z'),
      b4: booking('ben', '2026-10-14T16:00:00Z', { status: 'cancelled' }),
      b5: booking('ben', '2026-10-14T17:00:00Z', { status: 'cancelled' }),
    })));
    const body = await (await get('?period=week')).json();
    expect(body.leaderboard.map((r: { uid: string; booked: number; rank: number }) => [r.rank, r.uid, r.booked])).toEqual([
      [1, 'ana', 2],
      [2, 'ben', 1],
    ]);
    expect(body.leaderboard[0]).toMatchObject({ name: 'Ana Rivera', mix: [{ tier: 'In person', count: 1 }, { tier: 'Virtual', count: 1 }] });
    expect(body.currentUser).toMatchObject({ uid: 'ana', rank: 1, booked: 2 });
    expect(body.totalRanked).toBe(2);
  });

  it('filters by when the consult was booked (createdAt), per period', async () => {
    db.store.set('solarBookings', new Map(Object.entries({
      thisWeek: booking('ana', '2026-10-12T15:00:00Z', { start: '2027-01-05T15:00:00Z' }),
      thisMonth: booking('ben', '2026-10-02T15:00:00Z', { start: '2026-10-14T15:00:00Z' }),
      lastYear: booking('cy', '2025-06-02T15:00:00Z'),
    })));
    const ids = async (q: string) => (await (await get(q)).json()).leaderboard.map((r: { uid: string }) => r.uid);
    expect(await ids('?period=week')).toEqual(['ana']);
    expect(await ids('?period=month')).toEqual(['ana', 'ben']);
    expect(await ids('?period=year')).toEqual(['ana', 'ben']);
    expect(await ids('?period=all')).toEqual(['ana', 'ben', 'cy']);
    expect(await ids('?period=month&month=2025-06')).toEqual(['cy']);
  });

  it('refuses a future month', async () => {
    expect((await get('?period=month&month=2027-01')).status).toBe(400);
  });

  it("credits each booking to its lead's owner, as Demoed and Closed do; booking.repUid only without one", async () => {
    db.store.set('solarLeads', new Map(Object.entries({
      L1: { repUid: 'cy', status: 'booked' },
      L2: { repUid: 'cy', status: 'booked' },
      L3: { status: 'booked' },
    })));
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking(null, '2026-10-12T15:00:00Z', { leadId: 'L1' }),
      b2: booking(null, '2026-10-12T16:00:00Z', { leadId: undefined, lead: 'L2' }),
      // Booked by Ana on Cy's lead: Cy's, like the lead's demo and sale.
      b3: booking('ana', '2026-10-12T17:00:00Z', { leadId: 'L1' }),
      // Lead without a rep, or missing: the booking's own repUid.
      b4: booking('ana', '2026-10-12T18:00:00Z', { leadId: 'L3' }),
      b5: booking('ben', '2026-10-12T19:00:00Z', { leadId: 'gone' }),
      orphan: booking(null, '2026-10-12T20:00:00Z', { leadId: 'missing' }),
    })));
    const body = await (await get('?period=week')).json();
    expect(body.leaderboard.map((r: { uid: string; booked: number }) => [r.uid, r.booked])).toEqual([
      ['cy', 3],
      ['ana', 1],
      ['ben', 1],
    ]);
  });

  it('with the team: solar reps at 0 (never fiber reps) and the newest consults, no customer data', async () => {
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking('ana', '2026-10-12T15:00:00Z', { customerName: 'Pat Customer', customerEmail: 'pat@example.com' }),
    })));
    const body = await (await get('?period=week&include=team')).json();
    expect(body.unranked).toEqual([
      { uid: 'ben', name: 'Ben Cole' },
      { uid: 'cy', name: 'Cy Diaz' },
    ]);
    expect(body.recent).toEqual([{ repName: 'Ana Rivera', plan: 'Virtual', at: '2026-10-12T15:00:00.000Z' }]);
    expect(JSON.stringify(body)).not.toContain('Pat Customer');
    expect(JSON.stringify(body)).not.toContain('pat@example.com');
  });

  it('counts a rebooked lead once (the cancelled booking plus its replacement)', async () => {
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking('ana', '2026-10-12T15:00:00Z', { leadId: 'L1', status: 'cancelled' }),
      b2: booking('ana', '2026-10-13T15:00:00Z', { leadId: 'L1' }),
    })));
    const body = await (await get('?period=week')).json();
    expect(body.leaderboard.map((r: { uid: string; booked: number }) => [r.uid, r.booked])).toEqual([['ana', 1]]);
  });

  it('view as rep: "you" is the viewed rep, not the owner', async () => {
    const owner = { ok: true, uid: 'own', name: 'Owner', role: 'owner', solarRole: null, demoAccount: false, isAdmin: true, isOwner: true };
    mockGate.mockResolvedValue(owner);
    vi.mocked(resolveSubject).mockResolvedValueOnce({ ok: true, viewing: true, uid: 'ben', ownerUid: 'own', target: {} as never });
    db.store.set('solarBookings', new Map(Object.entries({ b1: booking('ben', '2026-10-13T15:00:00Z') })));
    const body = await (await get('?period=week')).json();
    expect(body.currentUser).toMatchObject({ uid: 'ben', booked: 1, count: 1 });
  });

  it('passes a refused view-as through', async () => {
    vi.mocked(resolveSubject).mockResolvedValueOnce({ ok: false, error: 'Forbidden: owner access required', status: 403 });
    expect((await get()).status).toBe(403);
  });

  it('fails with 500 instead of an empty board', async () => {
    vi.spyOn(db, 'collection').mockImplementationOnce(() => { throw new Error('unavailable'); });
    expect((await get()).status).toBe(500);
  });
});

describe('GET /api/portal/solar/leaderboard — test accounts', () => {
  const qaRep = { ...solarRep, uid: 'qa', name: 'Test Setter', testAccount: true };
  beforeEach(() => {
    db.store.get('users')!.set('qa', { status: 'active', displayName: 'Test Setter', solarRole: 'entry_canvasser', testAccount: true });
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking('ana', '2026-10-12T15:00:00Z'),
      q1: booking('qa', '2026-10-13T15:00:00Z', { testAccount: true }),
      q2: booking('qa', '2026-10-13T16:00:00Z', { testAccount: true }),
    })));
    db.store.set('solarLeads', new Map(Object.entries({
      L1: { repUid: 'ana', stage: 'appointment_demoed', stageOutcome: 'sale',
        stageHistory: [{ stage: 'appointment_demoed', outcome: 'sale', at: new Date('2026-10-13T15:00:00Z') }] },
      Q1: { repUid: 'qa', testAccount: true, stage: 'appointment_demoed', stageOutcome: 'sale',
        stageHistory: [{ stage: 'appointment_demoed', outcome: 'sale', at: new Date('2026-10-13T15:00:00Z') }] },
    })));
  });
  const ids = async (q: string) =>
    (await (await get(q)).json()).leaderboard.map((r: { uid: string }) => r.uid);

  it("keeps a test account's bookings and leads off everyone else's board, and out of the team roster", async () => {
    expect(await ids('?period=week')).toEqual(['ana']);
    expect(await ids('?period=week&metric=demoed')).toEqual(['ana']);
    expect(await ids('?period=week&metric=closed')).toEqual(['ana']);
    const body = await (await get('?period=week&include=team')).json();
    expect(JSON.stringify(body)).not.toContain('Test Setter');
  });

  it('shows the test account its own numbers', async () => {
    mockGate.mockResolvedValue(qaRep);
    expect(await ids('?period=week')).toEqual(['qa', 'ana']);
    const mine = await (await get('?period=week&view=mine')).json();
    expect(mine.mine).toEqual({ set: 2, demoed: 1, closed: 1 });
  });
});

describe('GET /api/portal/solar/leaderboard — metric=set|demoed|closed', () => {
  const at = (iso: string) => new Date(iso);
  beforeEach(() => {
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking('cy', '2026-10-12T15:00:00Z'),
    })));
    db.store.set('solarLeads', new Map(Object.entries({
      // Ana: demoed this week (proposal sent), demoed + sold this week, sold last month.
      L1: { repUid: 'ana', stage: 'appointment_demoed', stageOutcome: 'proposal_sent', updatedAt: at('2026-10-14T15:00:00Z'),
        stageHistory: [{ stage: 'appointment_demoed', outcome: 'proposal_sent', at: at('2026-10-12T15:00:00Z') }] },
      L2: { repUid: 'ana', stage: 'site_survey', updatedAt: at('2026-10-14T15:00:00Z'),
        stageHistory: [
          { stage: 'appointment_demoed', outcome: 'sale', at: at('2026-10-13T15:00:00Z') },
          { stage: 'site_survey', at: at('2026-10-14T15:00:00Z') },
        ] },
      L3: { repUid: 'ana', status: 'sold', statusChangedAt: at('2026-09-10T15:00:00Z'), updatedAt: at('2026-10-14T15:00:00Z') },
      // Ben: old lost lead this week (demoed, no sale); demo reached last month, sale this week.
      L4: { repUid: 'ben', status: 'lost', statusChangedAt: at('2026-10-13T16:00:00Z') },
      L5: { repUid: 'ben', stage: 'appointment_demoed', stageOutcome: 'sale',
        stageHistory: [
          { stage: 'appointment_demoed', outcome: 'proposal_sent', at: at('2026-09-20T15:00:00Z') },
          { stage: 'appointment_demoed', outcome: 'sale', at: at('2026-10-14T15:00:00Z') },
        ] },
      // Not counted: not demoed, a demo account's lead, no rep.
      L6: { repUid: 'cy', status: 'booked', updatedAt: at('2026-10-14T15:00:00Z') },
      L7: { repUid: 'cy', status: 'demo', stage: 'appointment_demoed', updatedAt: at('2026-10-14T15:00:00Z') },
      L8: { status: 'sold', statusChangedAt: at('2026-10-14T15:00:00Z') },
    })));
  });
  const rows = async (q: string) =>
    (await (await get(q)).json()).leaderboard.map((r: { uid: string; count: number }) => [r.uid, r.count]);

  it('defaults to set (booked consults), with booked kept on the rows', async () => {
    const body = await (await get('?period=week')).json();
    expect(body.metric).toBe('booked');
    expect(body.leaderboard).toEqual([expect.objectContaining({ uid: 'cy', count: 1, booked: 1 })]);
    expect(await rows('?period=week&metric=set')).toEqual([['cy', 1]]);
    expect(await rows('?period=week&metric=bookedConsults')).toEqual([['cy', 1]]);
    expect(await rows('?period=week&metric=nonsense')).toEqual([['cy', 1]]);
  });

  it('demoed: leads that reached the demo, any outcome, by when, credited to the setter', async () => {
    const body = await (await get('?period=week&metric=demoed&include=team')).json();
    expect(body.metric).toBe('demoed');
    expect(body.leaderboard.map((r: { uid: string; count: number }) => [r.uid, r.count])).toEqual([['ana', 2], ['ben', 1]]);
    expect(body.leaderboard[0]).not.toHaveProperty('booked');
    expect(body.leaderboard[0].mix).toEqual([{ tier: 'Proposal sent', count: 1 }, { tier: 'Sale', count: 1 }]);
    expect(body.recent[0]).toEqual({ repName: 'Ben Cole', plan: 'No sale', at: '2026-10-13T16:00:00.000Z' });
    expect(await rows('?period=month&metric=solarDemoed')).toEqual([['ana', 2], ['ben', 1]]);
    expect(await rows('?period=month&month=2026-09&metric=demoed')).toEqual([['ana', 1], ['ben', 1]]);
    expect(await rows('?period=all&metric=demoed')).toEqual([['ana', 3], ['ben', 2]]);
  });

  it('closed: sales only, by when the sale showed', async () => {
    const body = await (await get('?period=week&metric=closed')).json();
    expect(body.metric).toBe('closed');
    expect(body.leaderboard[0].mix).toEqual([]);
    expect(body.leaderboard.map((r: { uid: string; count: number }) => [r.uid, r.count])).toEqual([['ana', 1], ['ben', 1]]);
    expect(await rows('?period=month&month=2026-09&metric=closed')).toEqual([['ana', 1]]);
    expect(await rows('?period=all&metric=solarClosed')).toEqual([['ana', 2], ['ben', 1]]);
  });

  it('firstMonth follows the metric', async () => {
    expect((await (await get('?period=month&metric=demoed')).json()).firstMonth).toBe('2026-09');
    expect((await (await get('?period=month')).json()).firstMonth).toBe('2026-10');
  });

  it('demoed/closed never read the bookings, and keep gating and view-as', async () => {
    const spy = vi.spyOn(db, 'collection');
    spy.mockClear();
    await get('?period=week&metric=closed');
    expect(spy.mock.calls.map(([name]) => name)).not.toContain('solarBookings');
    mockGate.mockResolvedValue(fiberRep);
    expect((await get('?metric=closed')).status).toBe(403);
    mockGate.mockResolvedValue({ ok: true, uid: 'own', name: 'Owner', role: 'owner', solarRole: null, demoAccount: false, isAdmin: true, isOwner: true });
    vi.mocked(resolveSubject).mockResolvedValueOnce({ ok: true, viewing: true, uid: 'ben', ownerUid: 'own', target: {} as never });
    expect((await (await get('?period=week&metric=closed')).json()).currentUser).toMatchObject({ uid: 'ben', count: 1 });
  });

  it('view=mine: the viewer\'s Set, Demoed and Closed in one answer, each matching their row on that board', async () => {
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking('cy', '2026-10-12T15:00:00Z'),
      b2: booking('ana', '2026-10-13T15:00:00Z'),
      b3: booking('ana', '2026-10-14T15:00:00Z', { status: 'cancelled' }),
    })));
    const body = await (await get('?period=week&view=mine')).json();
    expect(body).toEqual({ period: 'week', mine: { set: 1, demoed: 2, closed: 1 } });
    for (const [metric, key] of [['set', 'set'], ['demoed', 'demoed'], ['closed', 'closed']] as const) {
      const board = await (await get(`?period=week&metric=${metric}`)).json();
      expect(board.currentUser?.count ?? 0).toBe(body.mine[key]);
    }
  });

  it('view=mine: zeros for a rep with nothing this week, never reads users, and keeps gating and view-as', async () => {
    mockGate.mockResolvedValue({ ...solarRep, uid: 'cy' });
    const spy = vi.spyOn(db, 'collection');
    spy.mockClear();
    expect((await (await get('?period=week&view=mine')).json()).mine).toEqual({ set: 1, demoed: 0, closed: 0 });
    expect(spy.mock.calls.map(([name]) => name)).not.toContain('users');
    mockGate.mockResolvedValue(fiberRep);
    expect((await get('?period=week&view=mine')).status).toBe(403);
    mockGate.mockResolvedValue({ ok: true, uid: 'own', name: 'Owner', role: 'owner', solarRole: null, demoAccount: false, isAdmin: true, isOwner: true });
    vi.mocked(resolveSubject).mockResolvedValueOnce({ ok: true, viewing: true, uid: 'ben', ownerUid: 'own', target: {} as never });
    expect((await (await get('?period=week&view=mine')).json()).mine).toEqual({ set: 0, demoed: 1, closed: 1 });
  });
});

describe('GET /api/portal/solar/leaderboard — from/to range and campaignId', () => {
  const at = (iso: string) => new Date(iso);
  // from=2026-10-01&to=2026-10-10 on the office clock (CDT, UTC-5):
  // [2026-10-01T05:00:00Z, 2026-10-11T05:00:00Z).
  const FIRST_MS = '2026-10-01T05:00:00.000Z';
  const BEFORE = '2026-10-01T04:59:59.999Z';
  const LAST_MS = '2026-10-11T04:59:59.999Z';
  const AFTER = '2026-10-11T05:00:00.000Z';
  const RANGE = '?from=2026-10-01&to=2026-10-10';

  beforeEach(() => {
    db.store.set('solarLeads', new Map(Object.entries({
      // Set leads (booked only), one per campaign.
      SA: { repUid: 'ana', status: 'booked', campaignId: 'camp-1' },
      SC: { repUid: 'cy', status: 'booked', campaignId: 'camp-2' },
      // Ana: demoed with a sale at the first instant of `from`.
      D1: { repUid: 'ana', stage: 'appointment_demoed', stageOutcome: 'sale', campaignId: 'camp-1',
        stageHistory: [{ stage: 'appointment_demoed', outcome: 'sale', at: at(FIRST_MS) }] },
      // Cy: demoed (proposal sent) at the last instant of `to`.
      D3: { repUid: 'cy', stage: 'appointment_demoed', stageOutcome: 'proposal_sent', campaignId: 'camp-2',
        stageHistory: [{ stage: 'appointment_demoed', outcome: 'proposal_sent', at: at(LAST_MS) }] },
      // Ben: a sale just after `to`, and an old sold lead just before `from`.
      D2: { repUid: 'ben', stage: 'appointment_demoed', stageOutcome: 'sale',
        stageHistory: [{ stage: 'appointment_demoed', outcome: 'sale', at: at(AFTER) }] },
      D4: { repUid: 'ben', status: 'sold', statusChangedAt: at(BEFORE) },
    })));
    db.store.set('solarBookings', new Map(Object.entries({
      inFirst: booking('ana', FIRST_MS, { leadId: 'SA' }),
      outBefore: booking('ben', BEFORE),
      inLast: booking('cy', LAST_MS, { leadId: 'SC' }),
      outAfter: booking('ben', AFTER),
    })));
  });
  const rows = async (q: string) =>
    (await (await get(q)).json()).leaderboard.map((r: { uid: string; count: number }) => [r.uid, r.count]);

  it('set: counts from the start of the from day through the end of the to day (Chicago)', async () => {
    expect(await rows(RANGE)).toEqual([['ana', 1], ['cy', 1]]);
    // One day either side lets the outside ones in.
    expect(await rows('?from=2026-09-30&to=2026-10-11')).toEqual([['ben', 2], ['ana', 1], ['cy', 1]]);
  });

  it('demoed and closed: the same boundaries', async () => {
    expect(await rows(`${RANGE}&metric=demoed`)).toEqual([['ana', 1], ['cy', 1]]);
    expect(await rows(`${RANGE}&metric=closed`)).toEqual([['ana', 1]]);
    expect(await rows('?from=2026-09-30&to=2026-10-11&metric=closed')).toEqual([['ben', 2], ['ana', 1]]);
  });

  it('overrides period and month, and answers period "range" with from, to and both bounds', async () => {
    const body = await (await get(`${RANGE}&period=month&month=garbage&metric=demoed`)).json();
    expect(body).toMatchObject({
      period: 'range',
      from: '2026-10-01',
      to: '2026-10-10',
      metric: 'demoed',
      startDate: FIRST_MS,
      endDate: AFTER,
      totalRanked: 2,
      currentUser: expect.objectContaining({ uid: 'ana', count: 1 }),
    });
    expect(body).not.toHaveProperty('month');
    expect(body).not.toHaveProperty('firstMonth');
    expect(body).not.toHaveProperty('campaignId');
    expect(await rows(`${RANGE}&period=week`)).toEqual(await rows(RANGE));
  });

  it('a range that already ended has no team extras; one running through today keeps them', async () => {
    const past = await (await get(`${RANGE}&include=team`)).json();
    expect(past).not.toHaveProperty('unranked');
    expect(past.leaderboard[0].spark).toEqual([]);
    const live = await (await get('?from=2026-10-01&to=2026-10-15&include=team')).json();
    expect(live).toHaveProperty('unranked');
  });

  it('view=mine: the same range for all three counts, matching the boards', async () => {
    const body = await (await get(`${RANGE}&view=mine`)).json();
    expect(body).toEqual({ period: 'range', from: '2026-10-01', to: '2026-10-10', mine: { set: 1, demoed: 1, closed: 1 } });
    mockGate.mockResolvedValue({ ...solarRep, uid: 'ben' });
    expect((await (await get(`${RANGE}&view=mine`)).json()).mine).toEqual({ set: 0, demoed: 0, closed: 0 });
  });

  it('refuses a bad range with 400 and a message', async () => {
    const error = async (q: string) => {
      const res = await get(q);
      return [res.status, (await res.json()).error];
    };
    expect(await error('?from=2026-10-01')).toEqual([400, 'from and to are both required for a date range']);
    expect(await error('?to=2026-10-01&view=mine')).toEqual([400, 'from and to are both required for a date range']);
    expect(await error('?from=2026-13-01&to=2026-10-01')).toEqual([400, 'from must be a date as YYYY-MM-DD']);
    expect(await error('?from=2026-10-01&to=tomorrow')).toEqual([400, 'to must be a date as YYYY-MM-DD']);
    expect(await error('?from=2026-10-10&to=2026-10-01')).toEqual([400, 'from must be on or before to']);
    expect(await error('?from=2025-01-01&to=2026-10-01')).toEqual([400, 'A date range can span at most 366 days']);
    expect(await error('?from=2026-10-16&to=2026-10-20')).toEqual([400, 'from cannot be in the future']);
  });

  it('keeps the same gating', async () => {
    mockGate.mockResolvedValue(fiberRep);
    expect((await get(RANGE)).status).toBe(403);
    mockGate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    expect((await get(`${RANGE}&view=mine`)).status).toBe(401);
  });

  it('campaignId: counts only leads created under that campaign, on every metric and view=mine', async () => {
    expect(await rows(`${RANGE}&campaignId=camp-1`)).toEqual([['ana', 1]]);
    expect(await rows(`${RANGE}&campaignId=camp-2`)).toEqual([['cy', 1]]);
    expect(await rows(`${RANGE}&campaignId=camp-1&metric=demoed`)).toEqual([['ana', 1]]);
    expect(await rows(`${RANGE}&campaignId=camp-2&metric=demoed`)).toEqual([['cy', 1]]);
    expect(await rows(`${RANGE}&campaignId=camp-2&metric=closed`)).toEqual([]);
    expect(await rows('?period=all&campaignId=nope')).toEqual([]);
    const board = await (await get(`${RANGE}&campaignId=camp-1&metric=closed`)).json();
    expect(board).toMatchObject({ campaignId: 'camp-1', leaderboard: [expect.objectContaining({ uid: 'ana', count: 1 })] });
    expect((await (await get(`${RANGE}&campaignId=camp-2&view=mine`)).json())).toEqual({
      period: 'range', from: '2026-10-01', to: '2026-10-10', campaignId: 'camp-2', mine: { set: 0, demoed: 0, closed: 0 },
    });
    // Without a range: the period still applies.
    expect((await (await get('?period=week&campaignId=camp-1&view=mine')).json()).mine).toEqual({ set: 0, demoed: 0, closed: 0 });
  });

  it('campaignId: refuses an empty or oversized id', async () => {
    expect((await get('?campaignId=')).status).toBe(400);
    expect((await get(`?campaignId=${'x'.repeat(129)}`)).status).toBe(400);
  });
});

describe('GET /api/portal/solar/leaderboard — Set reads only the bookings it can show', () => {
  // The unspied collection(), taken before any test spies on it.
  const real = db.collection.bind(db);

  // Records every where() on solarBookings, passing the fake query through.
  function recordBookingFilters() {
    const filters: unknown[][] = [];
    type Q = { where: (field: string, op: string, value: unknown) => Q };
    const wrap = <T extends Q>(q: T): T => ({
      ...q,
      where: (field: string, op: string, value: unknown) => {
        filters.push([field, op, value]);
        return wrap(q.where(field, op, value) as T);
      },
    });
    vi.spyOn(db, 'collection').mockImplementation((name: string) => (name === 'solarBookings' ? wrap(real(name)) : real(name)));
    return filters;
  }

  beforeEach(() => {
    db.store.set('solarBookings', new Map(Object.entries({
      ancient: booking('cy', '2024-03-04T15:00:00Z'),
      // Last Friday: before this week, inside Ana's streak.
      lastFri: booking('ana', '2026-10-09T15:00:00Z'),
      mon: booking('ana', '2026-10-12T15:00:00Z'),
      tue: booking('ana', '2026-10-13T15:00:00Z'),
      wed: booking('ana', '2026-10-14T15:00:00Z'),
      thu: booking('ben', '2026-10-15T15:00:00Z'),
      gone: booking('ben', '2023-01-02T15:00:00Z', { status: 'cancelled' }),
    })));
  });

  it('view=mine: a createdAt range on the window, same count', async () => {
    const filters = recordBookingFilters();
    expect((await (await get('?period=week&view=mine')).json()).mine.set).toBe(3);
    expect(filters).toEqual([
      ['createdAt', '>=', new Date('2026-10-11T05:00:00Z')],
      ['createdAt', '<', new Date('2026-10-18T05:00:00Z')],
    ]);
  });

  it('a past month: just that month', async () => {
    const filters = recordBookingFilters();
    const body = await (await get('?period=month&month=2024-03')).json();
    expect(body.leaderboard.map((r: { uid: string }) => r.uid)).toEqual(['cy']);
    expect(body.firstMonth).toBe('2024-03');
    expect(filters).toEqual([
      ['createdAt', '>=', new Date('2024-03-01T06:00:00Z')],
      ['createdAt', '<', new Date('2024-04-01T05:00:00Z')],
    ]);
  });

  it('a live board: from a year back (the streak), no upper bound; streak, recent and firstMonth unchanged', async () => {
    const filters = recordBookingFilters();
    const body = await (await get('?period=month&include=team')).json();
    expect(filters).toEqual([['createdAt', '>=', new Date(NOW.getTime() - 367 * 24 * 60 * 60 * 1000)]]);
    // Fri, (the weekend), Mon, Tue, Wed: the streak reaches back before this week.
    expect(body.leaderboard.find((r: { uid: string }) => r.uid === 'ana')).toMatchObject({ count: 4, streakDays: 4 });
    expect(body.recent.map((r: { at: string }) => r.at)).toEqual([
      '2026-10-15T15:00:00.000Z',
      '2026-10-14T15:00:00.000Z',
      '2026-10-13T15:00:00.000Z',
      '2026-10-12T15:00:00.000Z',
      '2026-10-09T15:00:00.000Z',
    ]);
    // The cancelled 2023 booking is older, but never counted.
    expect(body.firstMonth).toBe('2024-03');
  });

  it('fewer consults since the window start than the recent list holds: older ones fill it', async () => {
    db.store.get('solarBookings')!.delete('lastFri');
    db.store.get('solarBookings')!.delete('mon');
    const body = await (await get('?period=week&include=team')).json();
    expect(body.recent.map((r: { at: string }) => r.at)).toEqual([
      '2026-10-15T15:00:00.000Z',
      '2026-10-14T15:00:00.000Z',
      '2026-10-13T15:00:00.000Z',
      '2024-03-04T15:00:00.000Z',
    ]);
  });

  it('firstMonth: a full batch of uncounted oldest bookings falls back to every booking', async () => {
    const bookings = db.store.get('solarBookings')!;
    for (let i = 0; i < 30; i++) {
      bookings.set(`c${i}`, booking('ben', `2022-01-${String((i % 28) + 1).padStart(2, '0')}T15:00:00Z`, { status: 'cancelled' }));
    }
    expect((await (await get('?period=month')).json()).firstMonth).toBe('2024-03');
  });
});
