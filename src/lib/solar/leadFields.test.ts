import { describe, expect, it } from 'vitest';
import {
  CREDIT_TIER_LABELS,
  NO_SALE_REASON_LABELS,
  hasLeadExtras,
  isLowCreditDecline,
  isNoSaleReason,
  parseLead,
  parseLeadExtras,
} from './leadFields';

const LEAD = { first: 'Ana', last: 'Ruiz', email: 'ana@example.com' };

describe('monthlyKwh null', () => {
  it('reads as a clear on PATCH and counts as an extra', () => {
    expect(hasLeadExtras({ monthlyKwh: null })).toBe(true);
    expect(parseLeadExtras({ monthlyKwh: null })).toEqual({ ok: true, extras: { monthlyKwh: null } });
    expect(parseLeadExtras({ monthlyKwh: 950.4 })).toEqual({ ok: true, extras: { monthlyKwh: 950 } });
  });

  it('means just "none" on create', () => {
    const res = parseLead({ ...LEAD, monthlyKwh: null }, 'rep1');
    expect(res.ok && 'monthlyKwh' in res.fields).toBe(false);
  });
});

describe('usage shape', () => {
  it('takes primitives and flat arrays of primitives', () => {
    const usage = { mode: 'months', monthly: null, daily: 30.5, ok: true, months: [900, null, 1000] };
    expect(parseLeadExtras({ usage })).toEqual({ ok: true, extras: { usage } });
  });

  it('refuses nesting, empty keys, and over 4KB', () => {
    expect(parseLeadExtras({ usage: { deep: { x: 1 } } }).ok).toBe(false);
    expect(parseLeadExtras({ usage: { months: [[1]] } }).ok).toBe(false);
    expect(parseLeadExtras({ usage: { months: [{ x: 1 }] } }).ok).toBe(false);
    expect(parseLeadExtras({ usage: { '': 1 } }).ok).toBe(false);
    expect(parseLeadExtras({ usage: [1, 2] }).ok).toBe(false);
    expect(parseLeadExtras({ usage: { note: 'x'.repeat(5000) } })).toEqual({ ok: false, error: 'usage is too large' });
  });

  it('noSaleReason: only low_credit, and the decline it marks', () => {
    expect(isNoSaleReason('low_credit')).toBe(true);
    expect(isNoSaleReason('other')).toBe(false);
    expect(NO_SALE_REASON_LABELS.low_credit).toBe('No sale: low credit');
    expect(isLowCreditDecline({ status: 'lost', noSaleReason: 'low_credit' })).toBe(true);
    expect(isLowCreditDecline({ status: 'demo', noSaleReason: 'low_credit' })).toBe(true);
    expect(isLowCreditDecline({ status: 'lost' })).toBe(false);
    expect(isLowCreditDecline({ status: 'new', noSaleReason: 'low_credit' })).toBe(false);
    expect(isLowCreditDecline({ status: 'lost', noSaleReason: 'low_credit', stage: 'appointment_demoed' })).toBe(false);
  });

  it('credit tier labels match the prequal cards', () => {
    expect(CREDIT_TIER_LABELS).toEqual({ purchase_600: 'Purchase (600–679)', lease_ppa_680: 'Lease, PPA or Purchase (680+)' });
  });
});
