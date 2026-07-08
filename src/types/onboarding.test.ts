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
    const entryRep = getOnboardingItemsForUser('entry_rep', false).map((i) => i.id);
    expect(entryRep).toContain('fcra_auth');
    expect(entryRep).toContain('background_check');
    expect(entryRep).toContain('dl_photos');
  });

  it('excludes heavy-vetting items for light-vetting roles', () => {
    for (const role of ['general_manager', 'gm_in_training', 'office_manager'] as const) {
      const ids = getOnboardingItemsForUser(role, false).map((i) => i.id);
      expect(ids).not.toContain('background_check');
      expect(ids).not.toContain('dl_photos');
      expect(ids).not.toContain('fcra_auth');
      expect(ids).toContain('w9');
      expect(ids).toContain('contract');
    }
  });

  it('requiresHeavyVetting is true only for base roles', () => {
    expect(requiresHeavyVetting('entry_rep')).toBe(true);
    expect(requiresHeavyVetting('ibo_level_2')).toBe(true);
    expect(requiresHeavyVetting('general_manager')).toBe(false);
    expect(requiresHeavyVetting('office_manager')).toBe(false);
  });

  it('items are ordered without duplicate order values', () => {
    const orders = ONBOARDING_ITEMS.map((i) => i.order);
    expect(new Set(orders).size).toBe(orders.length);
  });
});
