import { describe, it, expect } from 'vitest';
import { submittedByRep, submissionMatches } from './submittedByRep';
import type { Sale } from '@/types/sales';

const sale = (over: Partial<Sale>): Sale => ({
  id: 's1',
  salesRepId: 'u1',
  salesRepName: 'Noah St John',
  customerAddress: '58030 Jewell Rd',
  customerName: 'A Customer',
  saleType: 'new_service',
  products: [],
  totalValue: 60,
  totalPoints: 8,
  status: 'approved',
  saleDate: new Date('2026-08-10T12:00:00'),
  ...over,
} as unknown as Sale);

describe('submittedByRep', () => {
  it('groups on the rep id, not the name the carrier spells differently', () => {
    const groups = submittedByRep([
      sale({ id: 'a', salesRepId: 'u1', salesRepName: 'Noah St John' }),
      sale({ id: 'b', salesRepId: 'u1', salesRepName: 'Noah st john' }),
      sale({ id: 'c', salesRepId: 'u2', salesRepName: 'Will Teasdale' }),
    ]);
    expect([...groups.keys()].sort()).toEqual(['u1', 'u2']);
    expect(groups.get('u1')).toHaveLength(2);
  });

  it('orders each rep newest first', () => {
    const groups = submittedByRep([
      sale({ id: 'old', saleDate: new Date('2026-06-01T12:00:00') }),
      sale({ id: 'new', saleDate: new Date('2026-08-01T12:00:00') }),
      sale({ id: 'mid', saleDate: new Date('2026-07-01T12:00:00') }),
    ]);
    expect(groups.get('u1')?.map((s) => s.id)).toEqual(['new', 'mid', 'old']);
  });

  // A submission that cannot be dated is the one most likely to be the answer
  // somebody is hunting for, so it appears — just last.
  it('keeps an undated submission, at the end', () => {
    const groups = submittedByRep([
      sale({ id: 'undated', saleDate: undefined }),
      sale({ id: 'dated', saleDate: new Date('2026-08-01T12:00:00') }),
    ]);
    expect(groups.get('u1')?.map((s) => s.id)).toEqual(['dated', 'undated']);
  });

  it('drops a sale with no rep id — there is no group to file it under', () => {
    const groups = submittedByRep([sale({ id: 'orphan', salesRepId: '' })]);
    expect(groups.size).toBe(0);
  });
});

describe('submissionMatches', () => {
  it('matches on the address', () => {
    expect(submissionMatches(sale({}), 'jewell')).toBe(true);
  });
  it('matches on the customer name', () => {
    expect(submissionMatches(sale({ customerName: 'Marcus Hale' }), 'marcus')).toBe(true);
  });
  it('an empty search matches everything', () => {
    expect(submissionMatches(sale({}), '')).toBe(true);
  });
  it('no match is no match', () => {
    expect(submissionMatches(sale({}), 'cedar')).toBe(false);
  });
});
