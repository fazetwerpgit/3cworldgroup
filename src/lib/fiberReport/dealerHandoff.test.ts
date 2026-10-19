import { describe, expect, it } from 'vitest';
import { closeHandoffs, handoffOwner, readHandoffs, saleDays } from './dealerHandoff';

// Miles sells on Jeremy's code 4808955 from 2026-10-05 while his own code is down.
const OPEN = { '4808955': { userId: 'miles', from: '2026-10-05', to: null } };

describe('handoffOwner', () => {
  it("gives the borrower the code's orders from the start day on, and leaves earlier ones alone", () => {
    expect(handoffOwner({ repDealerId: '4808955', orderDate: '2026-10-05' }, OPEN)).toBe('miles');
    expect(handoffOwner({ repDealerId: '4808955', orderDate: '2026-10-04' }, OPEN)).toBeNull();
    expect(handoffOwner({ repDealerId: '1111111', orderDate: '2026-10-06' }, OPEN)).toBeNull();
  });

  it('dates a breakage row (no order date) by its install day', () => {
    expect(handoffOwner({ repDealerId: '4808955', orderDate: null, estInstallDate: '2026-10-09' }, OPEN)).toBe('miles');
    expect(handoffOwner({ repDealerId: '4808955', orderDate: null, estInstallDate: null }, OPEN)).toBeNull();
  });

  it("dates a breakage row by its order's sale day when known, so a pre-handoff sale stays the code owner's", () => {
    // Jeremy sold on 4808955 on 10/01; the 10/08 install was missed after Miles took the code.
    expect(handoffOwner({ repDealerId: '4808955', orderDate: null, estInstallDate: '2026-10-08' }, OPEN, '2026-10-01')).toBeNull();
    expect(handoffOwner({ repDealerId: '4808955', orderDate: null, estInstallDate: '2026-10-08' }, OPEN, '2026-10-06')).toBe('miles');
  });

  it('stops at the end day, which goes back to the code owner', () => {
    const closed = { '4808955': { userId: 'miles', from: '2026-10-05', to: '2026-10-20' } };
    expect(handoffOwner({ repDealerId: '4808955', orderDate: '2026-10-19' }, closed)).toBe('miles');
    expect(handoffOwner({ repDealerId: '4808955', orderDate: '2026-10-20' }, closed)).toBeNull();
  });
});

describe('closeHandoffs', () => {
  it("ends the handoff on the borrower's first order on their own code", () => {
    const { handoffs, closed } = closeHandoffs(OPEN, [
      { repDealerId: '4808955', orderDate: '2026-10-22', matchedUserId: 'miles' },
      { repDealerId: '7777777', orderDate: '2026-10-21', matchedUserId: 'miles' },
      { repDealerId: '7777777', orderDate: '2026-10-20', matchedUserId: 'miles' },
    ]);
    expect(closed).toEqual(['4808955']);
    expect(handoffs['4808955'].to).toBe('2026-10-20');
  });

  it("stays open while the borrower only shows up on the borrowed code, or on their own code before the start", () => {
    const { closed } = closeHandoffs(OPEN, [
      { repDealerId: '4808955', orderDate: '2026-10-06', matchedUserId: 'miles' },
      { repDealerId: '7777777', orderDate: '2026-09-01', matchedUserId: 'miles' },
      { repDealerId: '7777777', orderDate: '2026-10-07', matchedUserId: 'someone-else' },
    ]);
    expect(closed).toEqual([]);
  });

  it("stays open on an undated row on the borrower's own code (a missed install of an old sale, or a pre-sale)", () => {
    const { handoffs, closed } = closeHandoffs(OPEN, [
      { repDealerId: '7777777', orderDate: null, estInstallDate: '2026-10-07', matchedUserId: 'miles' },
    ]);
    expect(closed).toEqual([]);
    expect(handoffs['4808955'].to).toBeNull();
  });

  it('never moves an end day once set', () => {
    const ended = { '4808955': { userId: 'miles', from: '2026-10-05', to: '2026-10-20' } };
    const { handoffs, closed } = closeHandoffs(ended, [{ repDealerId: '7777777', orderDate: '2026-10-08', matchedUserId: 'miles' }]);
    expect(closed).toEqual([]);
    expect(handoffs['4808955'].to).toBe('2026-10-20');
  });
});

describe('readHandoffs', () => {
  it('drops malformed entries', () => {
    expect(readHandoffs({ a: { userId: 'x', from: 'soon' }, b: null, c: { userId: 'y', from: '2026-10-05' } })).toEqual({
      c: { userId: 'y', from: '2026-10-05', to: null },
    });
  });
});

describe('saleDays', () => {
  it("gives a breakage row the order date of the same code's row at its address, placed by its install day", () => {
    const sale = { repDealerId: '4808955', orderDate: '2026-10-01', estInstallDate: '2026-10-08', address: '5780 Hall St.', unit: null };
    const later = { repDealerId: '4808955', orderDate: '2026-10-12', estInstallDate: '2026-10-20', address: '5780 Hall St.', unit: null };
    const otherCode = { repDealerId: '7777777', orderDate: '2026-10-06', estInstallDate: '2026-10-08', address: '5780 hall st', unit: null };
    const breakage = { repDealerId: '4808955', orderDate: null, estInstallDate: '2026-10-08', address: '5780 HALL ST', unit: '' };
    const unlinked = { repDealerId: '4808955', orderDate: null, estInstallDate: '2026-10-09', address: '1 Elm St', unit: null };
    const days = saleDays([sale, later, otherCode, breakage, unlinked]);
    expect(days.get(breakage)).toBe('2026-10-01');
    expect(days.has(unlinked)).toBe(false);
    expect(days.has(sale)).toBe(false);
  });
});
