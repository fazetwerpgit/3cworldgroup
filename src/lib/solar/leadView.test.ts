import { describe, expect, it } from 'vitest';
import { leadView } from './leadView';
import { noSaleLine } from '@/components/portal/solar/leadDisplay';

describe('leadView noSaleReason', () => {
  it('shows "No sale: low credit" for a lead closed at pre-qualification', () => {
    const v = leadView('l1', { status: 'lost', noSaleReason: 'low_credit' }, null);
    expect(v.noSaleReason).toBe('low_credit');
    expect(noSaleLine(v)).toBe('No sale: low credit');
  });

  it("shows it for a demo account's lead too, the same as a real one", () => {
    const v = leadView('l1', { status: 'demo', noSaleReason: 'low_credit' }, null);
    expect(v.noSaleReason).toBe('low_credit');
    expect(noSaleLine(v)).toBe('No sale: low credit');
  });

  it('hides it once a stage is set, or on an open real lead', () => {
    expect(leadView('l1', { status: 'lost', noSaleReason: 'low_credit', stage: 'appointment_demoed' }, null).noSaleReason).toBeNull();
    expect(leadView('l1', { status: 'demo', noSaleReason: 'low_credit', stage: 'appointment_demoed' }, null).noSaleReason).toBeNull();
    expect(leadView('l1', { status: 'new', noSaleReason: 'low_credit' }, null).noSaleReason).toBeNull();
  });
});
