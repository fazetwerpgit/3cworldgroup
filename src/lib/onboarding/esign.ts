import { ONBOARDING_ITEMS } from '@/types';

// Items signed via the configured e-sign provider.
export const ESIGN_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) => i.referenceKind === 'esign'
).map((i) => i.id);

export function isEsignItem(itemId: string): boolean {
  return ESIGN_ITEM_IDS.includes(itemId);
}

// Single source for the rep-facing instruction on esign items.
export const ESIGN_HELPER_TEXT =
  'This document is signed electronically right here in the portal - it completes automatically once signed.';

export const ESIGN_FAILURE_HELPER_TEXT = 'We hit a snag preparing this document. We are on it - no action needed from you.';
