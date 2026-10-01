import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

/** Items whose uploads are identity documents: today the licence photos. */
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
 * Where the photos live depends on how the person joined. Someone who signed up
 * directly uploaded to onboarding/{uid}/{item}/. Someone who came through an
 * invite link uploaded before they had an account, to
 * onboarding/invite_{inviteId}/{item}/, and the files were never moved: the
 * checklist item just carries that folder as its `reference`. So the folders to
 * clear are the item's recorded reference plus the uid folder.
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
  const db = adminDb;
  const fail = (step: string, error: unknown) => {
    result.failures.push(step);
    console.error(`purgeSensitiveUserData(${uid}): ${step} failed`, error);
  };

  try {
    const ref = db.collection('userSensitive').doc(uid);
    if ((await ref.get()).exists) {
      await ref.delete();
      result.userSensitive = 1;
    }
  } catch (error) {
    fail('userSensitive', error);
  }

  for (const itemId of SENSITIVE_UPLOAD_ITEMS) {
    try {
      const folders = new Set<string>([`onboarding/${uid}/${itemId}/`]);
      const stored = (await db.collection('userOnboarding').doc(`${uid}_${itemId}`).get()).data()?.reference;
      // Older references were saved without the trailing slash (signFolderFiles
      // handles the same case); normalise so those hires' photos are not skipped.
      const recorded = typeof stored === 'string' ? (stored.endsWith('/') ? stored : `${stored}/`) : null;
      // The reference is stored data, so only trust it if it is exactly this item's
      // folder under this person's own uid or an invite folder; anything else is
      // ignored, never deleted.
      const ownFolder =
        recorded !== null &&
        recorded.endsWith(`/${itemId}/`) &&
        (recorded.startsWith(`onboarding/${uid}/`) || recorded.startsWith('onboarding/invite_'));
      if (recorded !== null && ownFolder) folders.add(recorded);

      for (const prefix of folders) {
        // Trailing slash on the prefix: "onboarding/abc/x/" must never match "onboarding/abcd/x/".
        const [files] = await getOnboardingBucket().getFiles({ prefix });
        for (const file of files) {
          await file.delete({ ignoreNotFound: true });
          result.files++;
        }
      }
    } catch (error) {
      fail(`${itemId} files`, error);
    }
  }

  return result;
}
