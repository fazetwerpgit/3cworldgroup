import { describe, expect, it } from 'vitest';
import { hasLeadExtras, parseLead, parseLeadExtras } from './leadFields';

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
