import { describe, expect, it } from 'vitest';
import { recentSales, unrankedReps } from './team';

describe('unrankedReps', () => {
  it('keeps active users with a field role and a name, minus the ranked, by name', () => {
    const users = [
      { id: 'a', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: 'Cara' } },
      { id: 'b', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: ' Ben ' } },
      { id: 'c', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: 'Ranked' } },
      { id: 'd', data: { status: 'disabled', role: 'rep', fieldRole: 'entry_rep', displayName: 'Gone' } },
      { id: 'e', data: { status: 'active', role: 'admin', displayName: 'Office' } },
      { id: 'f', data: { status: 'active', role: 'rep', fieldRole: 'entry_rep', displayName: '', email: 'x@y.z' } },
    ];
    expect(unrankedReps(users, new Set(['c']))).toEqual([
      { salesRepId: 'b', salesRepName: 'Ben' },
      { salesRepId: 'a', salesRepName: 'Cara' },
    ]);
  });
});

describe('recentSales', () => {
  const logged = new Date('2026-09-16T17:00:00.000Z');

  it('skips cancelled and rejected, stops at the limit, and drops the carrier from the plan', () => {
    const sale = (status: string) => ({
      status,
      salesRepName: 'Ana Ruiz',
      createdAt: logged,
      saleDate: logged,
      products: [{ productName: 'TFiber 2 Gig', company: 'tfiber' }],
    });
    const feed = recentSales([sale('cancelled'), sale('rejected'), sale('pending'), sale('approved'), sale('approved')], 2);
    expect(feed).toEqual([
      { repName: 'Ana Ruiz', plan: '2 Gig', at: logged.toISOString() },
      { repName: 'Ana Ruiz', plan: '2 Gig', at: logged.toISOString() },
    ]);
  });

  it('shows the sale day, not the log time, when it was logged on a later day', () => {
    const happened = new Date('2026-09-14T17:00:00.000Z');
    const [row] = recentSales([
      {
        status: 'approved',
        salesRepName: 'Ana Ruiz',
        createdAt: { toDate: () => logged },
        saleDate: happened.toISOString(),
        productSold: 'Fiber 500',
        products: [],
      },
    ]);
    expect(row).toEqual({ repName: 'Ana Ruiz', plan: 'Fiber 500', at: happened.toISOString(), dayOnly: true });
  });

  it('marks extra products on a multi-line sale', () => {
    const [row] = recentSales([
      {
        status: 'approved',
        salesRepName: 'Ana Ruiz',
        createdAt: logged,
        products: [{ productName: 'Fiber 1 Gig' }, { productName: 'TV' }],
      },
    ]);
    expect(row.plan).toBe('Fiber 1 Gig +1');
  });
});
