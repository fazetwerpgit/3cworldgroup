import { adminDb } from '@/lib/firebase/admin';
import { isOwnerOnlyOnboardingDocument, isOwnerOnlyOnboardingItem, ONBOARDING_ITEMS } from '@/types';

export { isOwnerOnlyOnboardingDocument, isOwnerOnlyOnboardingItem };

// Onboarding items flagged `sensitive` (driver's-license photos, ...) are
// admin/owner only. Operations still reviews the item, but never receives the
// file itself. The tax and banking items (W-9, direct deposit) are narrower
// still: owner only, see isOwnerOnlyOnboardingItem.
export function isSensitiveOnboardingItem(itemId: unknown): boolean {
  return ONBOARDING_ITEMS.some((item) => item.id === itemId && item.sensitive);
}

// May this caller open the files / PDF of this onboarding item? Owner-only
// documents (W-9, direct deposit, and the contract, which carries the EIN)
// need the owner role; other sensitive items need admin or owner; the rest are
// open to any management caller.
export function canOpenOnboardingItem(
  itemId: unknown,
  caller: { isAdmin: boolean; isOwner: boolean }
): boolean {
  if (isOwnerOnlyOnboardingDocument(itemId)) return caller.isOwner;
  if (isSensitiveOnboardingItem(itemId)) return caller.isAdmin;
  return true;
}

// May this caller approve this onboarding item? Approving takes the same
// right as opening the files (see the review POST): owner-only items need the
// owner role, other sensitive items need admin or owner. Items a caller cannot approve are not "waiting on" them, so
// they stay out of that caller's To do count and Hiring badge.
export function canApproveOnboardingItem(
  itemId: unknown,
  caller: { isAdmin: boolean; isOwner: boolean }
): boolean {
  return canOpenOnboardingItem(itemId, caller);
}

export type SensitiveFileAccessSource =
  | 'onboarding-review'
  | 'onboarding-files'
  | 'onboarding-signed-pdf'
  // The owner's onboarding file on a person's record: every opening is logged,
  // sensitive item or not.
  | 'onboarding-file-files'
  | 'onboarding-file-signed-pdf';

// Writes the same audit row the SSN/DL# reveal route writes (who, whose, when),
// plus which onboarding item was opened and from where. Throws on failure so a
// caller can fail closed: no audit row, no file.
export async function logSensitiveFileAccess(entry: {
  targetUid: string;
  itemId: string;
  revealedBy: string;
  revealedByName: string;
  source: SensitiveFileAccessSource;
}): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  await adminDb.collection('sensitiveAccessLog').add({
    targetUid: entry.targetUid,
    revealedBy: entry.revealedBy,
    revealedByName: entry.revealedByName,
    itemId: entry.itemId,
    source: entry.source,
    at: new Date(),
  });
}
