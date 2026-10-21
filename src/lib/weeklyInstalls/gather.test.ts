import { describe, expect, it } from 'vitest';
import { createFakeDb } from './fakeDb';
import { gatherAllReps, gatherRep } from './gather';

const sale = (salesRepId: string) => ({
  salesRepId,
  salesRepName: salesRepId,
  status: 'approved',
  saleDate: new Date('2026-10-05T17:00:00Z'),
  products: [],
});

describe('gatherAllReps', () => {
  it('gathers active reps with sales, never a demo account', async () => {
    const { db } = createFakeDb({
      users: {
        rep: { status: 'active', displayName: 'Rep', fieldRole: 'entry_level_rep', email: 'rep@example.com' },
        notdemo: { status: 'active', displayName: 'Not Demo', fieldRole: 'entry_level_rep', demoAccount: false },
        demo: { status: 'active', displayName: 'App Review', fieldRole: 'entry_level_rep', demoAccount: true },
        idle: { status: 'active', displayName: 'Idle', fieldRole: 'entry_level_rep' },
      },
      sales: { s1: sale('rep'), s2: sale('demo'), s3: sale('notdemo') },
      fiberOrders: {},
    });

    const reps = await gatherAllReps(db);

    expect(reps.map((rep) => rep.uid).sort()).toEqual(['notdemo', 'rep']);
  });

  it('never gathers a test account', async () => {
    const { db } = createFakeDb({
      users: {
        rep: { status: 'active', displayName: 'Rep', fieldRole: 'entry_level_rep' },
        qa: { status: 'active', displayName: 'Test Rep', fieldRole: 'ae_tier_1', testAccount: true },
      },
      sales: { s1: sale('rep'), s2: sale('qa') },
      fiberOrders: {},
    });
    expect((await gatherAllReps(db)).map((rep) => rep.uid)).toEqual(['rep']);
  });

  it('carries the carrier report stamp to every rep, null when absent', async () => {
    const seed = {
      users: { rep: { status: 'active', displayName: 'Rep', fieldRole: 'entry_level_rep' } },
      sales: { s1: sale('rep') },
      fiberOrders: {},
    };
    const stamped = createFakeDb({ ...seed, config: { fiberReportStatus: { lastReportAsOf: '2026-10-08' } } }).db;
    expect((await gatherAllReps(stamped)).map((rep) => rep.reportAsOf)).toEqual(['2026-10-08']);
    expect((await gatherRep(stamped, 'rep'))?.reportAsOf).toBe('2026-10-08');
    expect((await gatherAllReps(createFakeDb(seed).db)).map((rep) => rep.reportAsOf)).toEqual([null]);
  });
});
