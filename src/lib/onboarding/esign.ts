import { ONBOARDING_ITEMS } from '@/types';

// Items signed via the configured e-sign provider.
export const ESIGN_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) => i.referenceKind === 'esign'
).map((i) => i.id);

export function isEsignItem(itemId: string): boolean {
  return ESIGN_ITEM_IDS.includes(itemId);
}

// Single source for the rep-facing instruction on esign items.
export const ESIGN_HELPER_TEXT = "We've emailed you this document for e-signature. Check your inbox - it completes here automatically once signed.";
