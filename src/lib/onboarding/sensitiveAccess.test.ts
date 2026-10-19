import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/admin', () => ({ adminDb: null }));

import { canApproveOnboardingItem, canOpenOnboardingItem, isOwnerOnlyOnboardingDocument } from './sensitiveAccess';

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

describe('canOpenOnboardingItem', () => {
  // The contract stamps the IBO's EIN (lib/esign/documents), a tax ID like the
  // W-9's TIN, so its document is owner only even though the item is not.
  it.each(['w9', 'direct_deposit', 'contract'])('opens the %s document to owners only', (itemId) => {
    expect(isOwnerOnlyOnboardingDocument(itemId)).toBe(true);
    expect(canOpenOnboardingItem(itemId, operations)).toBe(false);
    expect(canOpenOnboardingItem(itemId, admin)).toBe(false);
    expect(canOpenOnboardingItem(itemId, owner)).toBe(true);
  });

  it('opens other sensitive items to admins, not operations', () => {
    expect(canOpenOnboardingItem('dl_photos', operations)).toBe(false);
    expect(canOpenOnboardingItem('dl_photos', admin)).toBe(true);
  });

  it('opens a plain item to any management caller', () => {
    expect(isOwnerOnlyOnboardingDocument('pay_structure')).toBe(false);
    expect(canOpenOnboardingItem('pay_structure', operations)).toBe(true);
  });
});
