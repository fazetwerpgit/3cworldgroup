import { adminDb } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types';

// Onboarding items flagged `sensitive` (W-9 with a full SSN, direct deposit,
// driver's-license photos, ...) are admin/owner only. Operations still reviews
// the item, but never receives the file itself.
export function isSensitiveOnboardingItem(itemId: unknown): boolean {
  return ONBOARDING_ITEMS.some((item) => item.id === itemId && item.sensitive);
}

export type SensitiveFileAccessSource = 'onboarding-review' | 'onboarding-signed-pdf';

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
