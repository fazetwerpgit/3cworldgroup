import { describe, expect, it } from 'vitest';
import { getOnboardingItemsForUser, type OnboardingStatus } from '@/types/onboarding';
import { computeReadiness } from './activation';

describe('computeReadiness', () => {
  const items = getOnboardingItemsForUser('entry_rep', false);

  it('not ready when nothing is approved', () => {
    const r = computeReadiness(items, {});
    expect(r.ready).toBe(false);
    expect(r.missing).toContain('background_check');
  });

  it('ready when every applicable item is approved', () => {
    const statuses = Object.fromEntries(
      items.map((i) => [i.id, 'approved' as OnboardingStatus])
    );
    expect(computeReadiness(items, statuses)).toEqual({ ready: true, missing: [] });
  });

  it('a rejected background screen blocks activation', () => {
    const statuses = Object.fromEntries(
      items.map((i) => [i.id, 'approved' as OnboardingStatus])
    );
    statuses.background_check = 'rejected';
    const r = computeReadiness(items, statuses);
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['background_check']);
  });

  it('light-vetting roles are ready without screen items', () => {
    const gmItems = getOnboardingItemsForUser('general_manager', false);
    const statuses = Object.fromEntries(
      gmItems.map((i) => [i.id, 'approved' as OnboardingStatus])
    );
    expect(computeReadiness(gmItems, statuses).ready).toBe(true);
  });
});
