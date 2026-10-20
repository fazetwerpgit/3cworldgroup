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

describe('leadView campaignId', () => {
  it('exposes the knock campaign a lead was created under, and null without one', () => {
    expect(leadView('l1', { source: 'knock', campaignId: ' camp-42 ', doorId: 'door-9', uploadId: 'u1' }, null).campaignId).toBe('camp-42');
    expect(leadView('l2', { source: 'portal' }, null).campaignId).toBeNull();
    expect(leadView('l3', { campaignId: '' }, null).campaignId).toBeNull();
    expect(leadView('l4', { campaignId: 42 }, null).campaignId).toBeNull();
  });

  it('adds no other private stored field (doorId, uploadId stay off the view)', () => {
    const v = leadView('l1', { campaignId: 'c', doorId: 'door-9', uploadId: 'u1', clientId: 'x' }, null) as unknown as Record<string, unknown>;
    expect(v).not.toHaveProperty('doorId');
    expect(v).not.toHaveProperty('uploadId');
    expect(v).not.toHaveProperty('clientId');
  });
});
