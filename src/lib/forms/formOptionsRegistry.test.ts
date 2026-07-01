import { describe, it, expect } from 'vitest';
import { mergeOptions, FORM_OPTION_DEFAULTS, EDITABLE_OPTION_KEYS } from './formOptionsRegistry';

describe('mergeOptions', () => {
  it('returns all defaults when no overrides', () => {
    expect(mergeOptions({})).toEqual(FORM_OPTION_DEFAULTS);
  });
  it('override wins for a provided key', () => {
    const merged = mergeOptions({ hireMarkets: ['Dallas TX'] });
    expect(merged.hireMarkets).toEqual(['Dallas TX']);
    expect(merged.hireManagers).toEqual(FORM_OPTION_DEFAULTS.hireManagers);
  });
  it('respects an explicit empty-array override (admin cleared a list)', () => {
    expect(mergeOptions({ hireMarkets: [] }).hireMarkets).toEqual([]);
  });
  it('ignores unknown keys', () => {
    const merged = mergeOptions({ bogusKey: ['x'] } as never);
    expect('bogusKey' in merged).toBe(false);
  });
  it('hire + leads managers defaults reflect the corrected roster', () => {
    expect(FORM_OPTION_DEFAULTS.leadsManagers).toEqual(['Jacob Myers']);
    expect(FORM_OPTION_DEFAULTS.hireManagers).toEqual(['Jacob Myers', 'Will Teasdale', 'Jeremy McFarland']);
  });
  it('logic-bearing lists are NOT editable', () => {
    expect(EDITABLE_OPTION_KEYS).not.toContain('leadsCategories');
    expect(EDITABLE_OPTION_KEYS).not.toContain('leadsReasons');
  });
});
