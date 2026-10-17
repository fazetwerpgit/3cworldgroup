import { describe, expect, it } from 'vitest';
import { createFakeDb } from './fakeDb';
import { gatherAllReps } from './gather';

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
});
