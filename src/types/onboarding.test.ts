import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_ITEMS,
  getOnboardingItemsForUser,
  requiresHeavyVetting,
} from './onboarding';

describe('checklist role filtering', () => {
  it('includes fcra_auth as a 4th esign item for base roles', () => {
    const esign = ONBOARDING_ITEMS.filter((i) => i.referenceKind === 'esign').map((i) => i.id);
    expect(esign.sort()).toEqual(['contract', 'direct_deposit', 'fcra_auth', 'pay_structure']);
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
    expect(getOnboardingItemsForUser('entry_rep', false)).toEqual([]);
    expect(getOnboardingItemsForUser('general_manager', false)).toEqual([]);
  });
});
