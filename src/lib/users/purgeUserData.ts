import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';

const BATCH_LIMIT = 400;

/** Counts of what a purge removed; the failures array names anything that did not go. */
export interface PurgeResult {
  userSensitive: number;
  onboardingItems: number;
  envelopes: number;
  files: number;
  failures: string[];
}

/**
 * Removes the sensitive onboarding records tied to a person once their account
 * is hard-deleted: the encrypted SSN / licence number (userSensitive), every
 * checklist item (userOnboarding), their e-sign envelopes with the signed PDFs
 * (W-9s carry the SSN), and the uploaded files under onboarding/{uid}/ (licence
 * photos).
 *
 * sensitiveAccessLog is deliberately kept: it is the record of who looked at
 * this person's data, and it holds no document content.
 *
 * Best-effort per step. The account is already gone when this runs, so a failed
 * step is reported and logged loudly, never thrown; the caller decides what to
 * tell the admin.
 */
export async function purgeUserData(uid: string): Promise<PurgeResult> {
  const result: PurgeResult = { userSensitive: 0, onboardingItems: 0, envelopes: 0, files: 0, failures: [] };
  if (!adminDb) {
    result.failures.push('database not configured');
    return result;
  }
  const db = adminDb;
  const fail = (step: string, error: unknown) => {
    result.failures.push(step);
    console.error(`purgeUserData(${uid}): ${step} failed`, error);
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

  try {
    const snap = await db.collection('userOnboarding').where('userId', '==', uid).get();
    for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
      const batch = db.batch();
      snap.docs.slice(i, i + BATCH_LIMIT).forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
    result.onboardingItems = snap.size;
  } catch (error) {
    fail('userOnboarding', error);
  }

  try {
    const snap = await db.collection('esignEnvelopes').where('userId', '==', uid).get();
    for (const doc of snap.docs) {
      const path = doc.get('signedPdfPath');
      if (typeof path === 'string' && path) {
        try {
          await getOnboardingBucket().file(path).delete({ ignoreNotFound: true });
          result.files++;
        } catch (error) {
          fail(`signed PDF ${path}`, error);
          continue; // keep the envelope so the orphaned path stays traceable
        }
      }
      await doc.ref.delete();
      result.envelopes++;
    }
  } catch (error) {
    fail('esignEnvelopes', error);
  }

  try {
    // Trailing slash: "onboarding/abc/" must never match "onboarding/abcd/".
    const [files] = await getOnboardingBucket().getFiles({ prefix: `onboarding/${uid}/` });
    for (const file of files) {
      await file.delete({ ignoreNotFound: true });
      result.files++;
    }
  } catch (error) {
    fail('onboarding files', error);
  }

  return result;
}
