import { describe, expect, it } from 'vitest';
import { LEADS_CATEGORIES, LEADS_REASONS } from './formOptions';
import { leadsConditions } from './leadsPredicates';

describe('leadsConditions', () => {
  it('marks hostile reason as needing hostile', () => {
    expect(leadsConditions({ category: '', reason: LEADS_REASONS[2], location: '' }).needsHostile).toBe(true);
  });

  it.each([
    ['reason', '', LEADS_REASONS[3]],
    ['category', LEADS_CATEGORIES[4], ''],
  ])('marks blind knock by %s', (_label, category, reason) => {
    expect(leadsConditions({ category, reason, location: '' }).needsBlindKnock).toBe(true);
  });

  it('marks worked territory reason as needing lasso', () => {
    expect(leadsConditions({ category: '', reason: LEADS_REASONS[1], location: '' }).needsLasso).toBe(true);
  });

  it.each([
    ['reason', '', LEADS_REASONS[0]],
    ['category', LEADS_CATEGORIES[0], ''],
  ])('marks new rep by %s', (_label, category, reason) => {
    expect(leadsConditions({ category, reason, location: '' }).needsNewRep).toBe(true);
  });

  it.each([
    LEADS_CATEGORIES[1],
    LEADS_CATEGORIES[2],
    LEADS_CATEGORIES[3],
  ])('marks %s as needing lead pack code', (category) => {
    expect(leadsConditions({ category, reason: '', location: '' }).needsLeadPackCode).toBe(true);
  });

  it('marks Special Request location as needing special request', () => {
    expect(leadsConditions({ category: '', reason: '', location: 'Special Request' }).needsSpecialRequest).toBe(true);
  });

  it('returns all false for empty input', () => {
    expect(leadsConditions({ category: '', reason: '', location: '' })).toEqual({
      needsHostile: false,
      needsBlindKnock: false,
      needsLasso: false,
      needsNewRep: false,
      needsLeadPackCode: false,
      needsSpecialRequest: false,
    });
  });
});
