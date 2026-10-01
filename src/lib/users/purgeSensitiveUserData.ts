import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

/** Storage folders (under onboarding/{uid}/) holding identity documents: today the licence photos. */
const SENSITIVE_UPLOAD_ITEMS = ONBOARDING_ITEMS.filter(
  (item) => item.sensitive && item.referenceKind === 'storage'
).map((item) => item.id);

/** What a purge removed; `failures` names every step that did not complete. */
export interface PurgeResult {
  userSensitive: number;
  files: number;
  failures: string[];
}

/**
 * Removes the identity data of a hard-deleted account: the encrypted SSN and
 * driver's-licence number (userSensitive) and the uploaded licence photos.
 *
 * Deliberately NOT removed: the signed W-9, contract, direct-deposit and
 * compensation envelopes and their PDFs, the onboarding checklist history, and
 * sensitiveAccessLog. Those are business records a contractor relationship
 * normally has to retain, and Decommission preserves them too; the access log
 * records who viewed the data and holds no document content.
 *
 * Best-effort per step. The account is already gone when this runs, so a failed
 * step is reported and logged, never thrown; the caller decides what to tell
 * the admin.
 */
export async function purgeSensitiveUserData(uid: string): Promise<PurgeResult> {
  const result: PurgeResult = { userSensitive: 0, files: 0, failures: [] };
  if (!adminDb) {
    result.failures.push('database not configured');
    return result;
  }
  const fail = (step: string, error: unknown) => {
    result.failures.push(step);
    console.error(`purgeSensitiveUserData(${uid}): ${step} failed`, error);
  };

  try {
    const ref = adminDb.collection('userSensitive').doc(uid);
    if ((await ref.get()).exists) {
      await ref.delete();
      result.userSensitive = 1;
    }
  } catch (error) {
    fail('userSensitive', error);
  }

  for (const itemId of SENSITIVE_UPLOAD_ITEMS) {
    try {
      // Exact folder with a trailing slash: "onboarding/abc/" must never match "onboarding/abcd/".
      const [files] = await getOnboardingBucket().getFiles({ prefix: `onboarding/${uid}/${itemId}/` });
      for (const file of files) {
        await file.delete({ ignoreNotFound: true });
        result.files++;
      }
    } catch (error) {
      fail(`${itemId} files`, error);
    }
  }

  return result;
}
