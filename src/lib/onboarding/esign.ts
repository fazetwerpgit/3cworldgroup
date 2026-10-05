import { ONBOARDING_ITEMS } from '@/types';

// Items signed electronically in the portal.
export const ESIGN_ITEM_IDS: string[] = ONBOARDING_ITEMS.filter(
  (i) => i.referenceKind === 'esign'
).map((i) => i.id);

export function isEsignItem(itemId: string): boolean {
  return ESIGN_ITEM_IDS.includes(itemId);
}

/**
 * Sent for signature and not signed yet. The item reads 'submitted' once the
 * documents go out, but the next move is the rep's, not the manager's: signing
 * approves it.
 */
export function awaitsSignature(item: { id: string; status: string; signPath?: string | null }): boolean {
  return item.status === 'submitted' && isEsignItem(item.id) && !!item.signPath;
}

// Single source for the rep-facing instruction on esign items.
export const ESIGN_HELPER_TEXT =
  'This document is signed electronically right here in the portal. It completes automatically once signed.';

export const ESIGN_FAILURE_HELPER_TEXT = 'We hit a snag preparing this document. We are on it, and there is nothing you need to do.';
