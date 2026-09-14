import { describe, expect, it } from 'vitest';
import type { FiberOrder, Sale } from '@/types';
import { applyCarrierInstallDates, carrierInstallDate } from './carrierInstall';

const order = (o: Partial<FiberOrder>): FiberOrder => ({ status: 'active', activationDate: '2026-09-12', ...o }) as FiberOrder;
const sale = (s: Partial<Sale>): Sale => ({ id: 's1', installDate: new Date('2026-08-07T12:00:00'), ...s }) as Sale;

describe('carrierInstallDate', () => {
  it('is the activation date of an active order, at local noon', () => {
    expect(carrierInstallDate(order({}))).toEqual(new Date(2026, 8, 12, 12, 0, 0));
  });

  it('is nothing until the carrier has actually activated', () => {
    expect(carrierInstallDate(order({ status: 'pending_install' }))).toBeNull();
    expect(carrierInstallDate(order({ status: 'active', activationDate: null }))).toBeNull();
    expect(carrierInstallDate(null)).toBeNull();
  });
});

describe('applyCarrierInstallDates', () => {
  it('moves a sale to the day the carrier says it went live', () => {
    // Rosaria: install typed Aug 7, broke at the door, carrier activated Sep 12.
    const [moved] = applyCarrierInstallDates([sale({})], new Map([['s1', order({})]]));
    expect(moved.installDate).toEqual(new Date(2026, 8, 12, 12, 0, 0));
  });

  it('leaves a sale alone when there is no match or no activation', () => {
    const untouched = sale({});
    expect(applyCarrierInstallDates([untouched], new Map())[0]).toBe(untouched);
    expect(applyCarrierInstallDates([untouched], new Map([['s1', order({ status: 'breakage' })]]))[0]).toBe(untouched);
  });

  it('returns the same object when the dates already agree, so identity sets keep working', () => {
    const agreed = sale({ installDate: new Date(2026, 8, 12, 12, 0, 0) });
    expect(applyCarrierInstallDates([agreed], new Map([['s1', order({})]]))[0]).toBe(agreed);
  });

  it('fills an install date the rep never gave', () => {
    const [filled] = applyCarrierInstallDates([sale({ installDate: undefined })], new Map([['s1', order({})]]));
    expect(filled.installDate).toEqual(new Date(2026, 8, 12, 12, 0, 0));
  });
});
