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

  it("credits a booking without repUid to its lead's rep", async () => {
    db.store.set('solarLeads', new Map(Object.entries({
      L1: { repUid: 'cy', status: 'booked' },
      L2: { repUid: 'cy', status: 'booked' },
    })));
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking(null, '2026-10-12T15:00:00Z', { leadId: 'L1' }),
      b2: booking(null, '2026-10-12T16:00:00Z', { leadId: undefined, lead: 'L2' }),
      b3: booking('ana', '2026-10-12T17:00:00Z', { leadId: 'L1' }),
      orphan: booking(null, '2026-10-12T18:00:00Z', { leadId: 'missing' }),
    })));
    const body = await (await get('?period=week')).json();
    expect(body.leaderboard.map((r: { uid: string; booked: number }) => [r.uid, r.booked])).toEqual([
      ['cy', 2],
      ['ana', 1],
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

describe('GET /api/portal/solar/leaderboard — metric=set|demoed|closed', () => {
  const at = (iso: string) => new Date(iso);
  beforeEach(() => {
    db.store.set('solarBookings', new Map(Object.entries({
      b1: booking('cy', '2026-10-12T15:00:00Z'),
    })));
    db.store.set('solarLeads', new Map(Object.entries({
      // Ana: demoed this week (proposal sent), demoed + sold this week, sold last month.
      L1: { repUid: 'ana', stage: 'appointment_demoed', outcome: 'proposal_sent', updatedAt: at('2026-10-14T15:00:00Z'),
        stageHistory: [{ stage: 'appointment_demoed', outcome: 'proposal_sent', at: at('2026-10-12T15:00:00Z') }] },
      L2: { repUid: 'ana', stage: 'site_survey', updatedAt: at('2026-10-14T15:00:00Z'),
        stageHistory: [
          { stage: 'appointment_demoed', outcome: 'sale', at: at('2026-10-13T15:00:00Z') },
          { stage: 'site_survey', at: at('2026-10-14T15:00:00Z') },
        ] },
      L3: { repUid: 'ana', status: 'sold', statusChangedAt: at('2026-09-10T15:00:00Z'), updatedAt: at('2026-10-14T15:00:00Z') },
      // Ben: old lost lead this week (demoed, no sale); demo reached last month, sale this week.
      L4: { repUid: 'ben', status: 'lost', statusChangedAt: at('2026-10-13T16:00:00Z') },
      L5: { repUid: 'ben', stage: 'appointment_demoed', outcome: 'sale',
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
});
