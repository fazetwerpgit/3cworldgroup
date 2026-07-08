import { describe, it, expect } from 'vitest';
import { needsPromotionWarning, BASE_COMPLETION_ITEM_IDS } from './promotionCheck';
import type { OnboardingStatus } from '@/types/onboarding';

function allApproved(): Record<string, OnboardingStatus> {
  return Object.fromEntries(BASE_COMPLETION_ITEM_IDS.map((id) => [id, 'approved' as const]));
}

describe('needsPromotionWarning', () => {
  it('never warns for non-light roles', () => {
    expect(needsPromotionWarning('entry_rep', {})).toBe(false);
    expect(needsPromotionWarning('l1_manager', {})).toBe(false);
  });

  it('warns when a light role is assigned with no onboarding history', () => {
    expect(needsPromotionWarning('general_manager', {})).toBe(true);
    expect(needsPromotionWarning('office_manager', {})).toBe(true);
  });

  it('does not warn when all base items are approved', () => {
    expect(needsPromotionWarning('gm_in_training', allApproved())).toBe(false);
  });

  it('warns when any base item is not approved', () => {
    const statuses = allApproved();
    statuses['background_check'] = 'submitted';
    expect(needsPromotionWarning('general_manager', statuses)).toBe(true);
  });
});
