import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

/** Items whose uploads are identity documents: today the licence photos. */
const SENSITIVE_UPLOAD_ITEMS = ONBOARDING_ITEMS.filter(
  (item) => item.sensitive && item.referenceKind === 'storage'
).map((item) => item.id);

/** An invite id is one path segment: anything with a slash or dots is ignored, never deleted. */
const SAFE_INVITE_ID = /^[A-Za-z0-9_-]+$/;

/** What a purge removed; `failures` names every step that did not complete. */
export interface PurgeResult {
  userSensitive: number;
  files: number;
  failures: string[];
}

/**
 * Removes the identity data of an account being hard-deleted: the encrypted SSN
 * and driver's-licence number (userSensitive) and the uploaded licence photos.
 * Call it BEFORE the users doc is deleted: it reads that doc for the invite the
 * hire came through.
 *
 * Where the photos live depends on how the person joined. Someone who signed up
 * directly uploaded to onboarding/{uid}/{item}/. Someone who came through an
 * invite link uploaded before they had an account, to
 * onboarding/invite_{inviteId}/{item}/, and the files were never moved. If that
 * hire's item was later rejected and re-uploaded from the portal, the checklist
 * reference now points at the uid folder and nothing points at the invite folder
 * any more. So the invite ids come from the account itself (users.onboardingInviteId
 * and candidateOnboarding.convertedUserId), and every one of their folders is
 * cleared, plus the uid folder. The checklist's recorded reference is only
 * followed when it is exactly one of those folders.
 *
 * Deliberately NOT removed: the signed W-9, contract, direct-deposit and
 * compensation envelopes and their PDFs, the onboarding checklist history, and
 * sensitiveAccessLog. Those are business records a contractor relationship
 * normally has to retain, and Decommission preserves them too; the access log
 * records who viewed the data and holds no document content.
 *
 * Best-effort per step: a failed step is reported in `failures` and logged, never
 * thrown. Safe to run again: everything it deletes is gone-or-deleted.
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

  // The invite(s) this person joined through. Without them an invited hire's
  // original licence photos could be left behind, so a failed lookup is a failure.
  const inviteIds = new Set<string>();
  try {
    const [profile, converted] = await Promise.all([
      db.collection('users').doc(uid).get(),
      db.collection('candidateOnboarding').where('convertedUserId', '==', uid).get(),
    ]);
    const fromProfile = profile.data()?.onboardingInviteId;
    if (typeof fromProfile === 'string') inviteIds.add(fromProfile);
    for (const doc of converted.docs) inviteIds.add(doc.id);
  } catch (error) {
    fail('invite lookup', error);
  }
  const inviteFolders = [...inviteIds]
    .filter((id) => SAFE_INVITE_ID.test(id))
    .map((id) => `onboarding/invite_${id}/`);

  for (const itemId of SENSITIVE_UPLOAD_ITEMS) {
    try {
      // Trailing slashes everywhere: "onboarding/abc/x/" must never match "onboarding/abcd/x/".
      const allowed = [`onboarding/${uid}/${itemId}/`, ...inviteFolders.map((base) => `${base}${itemId}/`)];
      const folders = new Set<string>(allowed);

      const stored = (await db.collection('userOnboarding').doc(`${uid}_${itemId}`).get()).data()?.reference;
      // Older references were saved without the trailing slash (signFolderFiles
      // handles the same case). The recorded reference is followed when it is one
      // of this person's known folders, or exactly an invite folder for this item:
      // hires from before the invite link was stored on the profile are only
      // findable that way. References are written by the server only, each invite
      // folder belongs to one invitee, and the exact shape rules out `..` and other
      // items. Anything else is ignored, never deleted.
      if (typeof stored === 'string') {
        const recorded = stored.endsWith('/') ? stored : `${stored}/`;
        const inviteFolder = new RegExp(`^onboarding/invite_[A-Za-z0-9_-]+/${itemId}/$`).test(recorded);
        if (allowed.includes(recorded) || inviteFolder) folders.add(recorded);
      }

      for (const prefix of folders) {
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
