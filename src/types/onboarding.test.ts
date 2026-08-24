import { describe, it, expect } from 'vitest';
import {
  BASE_VETTING_ROLES,
  ONBOARDING_ITEMS,
  getOnboardingItemsForUser,
  requiresHeavyVetting,
} from './onboarding';
import { INVITABLE_FIELD_ROLES, LIGHT_VETTING_ROLES } from './auth';

describe('checklist role filtering', () => {
  it('includes w9 as the 5th esign item for base roles', () => {
    const esign = ONBOARDING_ITEMS.filter((i) => i.referenceKind === 'esign').map((i) => i.id);
    expect(esign.sort()).toEqual(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure', 'w9']);
    const entryLevelRep = getOnboardingItemsForUser('entry_level_rep', false).map((i) => i.id);
    expect(entryLevelRep).toContain('fcra_auth');
    expect(entryLevelRep).toContain('background_check');
    expect(entryLevelRep).toContain('dl_photos');
  });

  it('returns no checklist for non-onboarding roles', () => {
    for (const role of ['general_manager', 'gm_in_training', 'office_manager'] as const) {
      const ids = getOnboardingItemsForUser(role, false).map((i) => i.id);
      expect(ids).toEqual([]);
    }
  });

  it('requiresHeavyVetting is true only for base roles', () => {
    expect(requiresHeavyVetting('entry_level_rep')).toBe(true);
    expect(requiresHeavyVetting('ibo_level_2')).toBe(true);
    expect(requiresHeavyVetting('general_manager')).toBe(false);
    expect(requiresHeavyVetting('office_manager')).toBe(false);
  });

  it('items are ordered without duplicate order values', () => {
    const orders = ONBOARDING_ITEMS.map((i) => i.order);
    expect(new Set(orders).size).toBe(orders.length);
  });

  it('returns no checklist for roles that do not require onboarding', () => {
    expect(getOnboardingItemsForUser('general_manager', false)).toEqual([]);
    expect(getOnboardingItemsForUser('general_manager', false)).toEqual([]);
  });

  it.each([
    ['l1_manager', false, 8],
    ['ibo_level_1', true, 11],
    ['ibo_level_1', false, 8],
  ] as const)('returns the expected packet for %s (isIBO=%s)', (role, isIBO, count) => {
    expect(getOnboardingItemsForUser(role, isIBO)).toHaveLength(count);
  });

  // The two sets no longer match one-for-one: BASE_VETTING_ROLES keeps the
  // legacy/IBO tiers that are no longer invitable, and the light-vetted
  // regional_manager / director are invitable without a background screen. What
  // must still hold is the reason the lockstep check existed - no invite target
  // may land on an empty checklist.
  it('gives every invitable role a non-empty checklist', () => {
    for (const role of INVITABLE_FIELD_ROLES) {
      expect(getOnboardingItemsForUser(role, false).length).toBeGreaterThan(0);
    }
  });

  it('heavy-vets every invitable role that is not light-vetted', () => {
    for (const role of INVITABLE_FIELD_ROLES) {
      if (LIGHT_VETTING_ROLES.includes(role)) continue;
      expect(BASE_VETTING_ROLES).toContain(role);
    }
  });
});
