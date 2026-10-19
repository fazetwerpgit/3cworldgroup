import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: null }));

import { canApproveOnboardingItem } from './sensitiveAccess';

const operations = { isAdmin: false, isOwner: false };
const admin = { isAdmin: true, isOwner: false };
const owner = { isAdmin: true, isOwner: true };

describe('canApproveOnboardingItem', () => {
  it('lets any management caller approve an ordinary item', () => {
    expect(canApproveOnboardingItem('onboarding_submission', operations)).toBe(true);
  });

  it('keeps sensitive items (license photos, background check) to admins and owners', () => {
    expect(canApproveOnboardingItem('dl_photos', operations)).toBe(false);
    expect(canApproveOnboardingItem('background_check', operations)).toBe(false);
    expect(canApproveOnboardingItem('dl_photos', admin)).toBe(true);
    expect(canApproveOnboardingItem('dl_photos', owner)).toBe(true);
  });

  it('keeps tax and banking items to owners, as the review POST does', () => {
    expect(canApproveOnboardingItem('w9', admin)).toBe(false);
    expect(canApproveOnboardingItem('direct_deposit', admin)).toBe(false);
    expect(canApproveOnboardingItem('w9', owner)).toBe(true);
  });
});
