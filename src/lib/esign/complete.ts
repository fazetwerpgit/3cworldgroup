import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { resolveSigningAlertTasks } from '@/lib/alerts/alertTasks';
import { createNotification } from '@/lib/notifications/createNotification';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';
import { notifyDocSigned } from '@/lib/onboarding/ownerNotify';
import { ONBOARDING_ITEMS } from '@/types/onboarding';
import { envelopeSuperseded } from '@/lib/esign/superseded';

const LOG = '[esign complete]';

export interface CompleteEsignItemInput {
  userId: string;
  itemId: string;
  envelopeId: string;
  /** Signed PDF bytes, or null when there are none (approval is still recorded, upload skipped). */
  pdf: Buffer | null;
}

export interface CompleteEsignItemResult {
  /** Storage path of the stored PDF, or null when there was nothing to store or storing it failed. */
  completedPdfPath: string | null;
  /**
   * 'approved': the item is approved (with the PDF when there was one).
   * 'upload_failed': the PDF never landed, so nothing was approved or sent.
   * 'superseded': a reviewer rejected the item or a newer envelope replaced
   * this one while it was being signed, so nothing was approved or sent.
   */
  status: 'approved' | 'upload_failed' | 'superseded';
}

export function completedPdfPathFor(userId: string, itemId: string): string {
  return `esign-completed/${userId}/${itemId}.pdf`;
}

// The signed PDF is the evidence behind the approval, so it is stored before
// anything is approved. Every failure here is logged and reported as null;
// the sign route then refuses the signature and lets the rep retry, with no
// approval or "signed" notice left behind.
async function storeCompletedPdf(
  { userId, itemId, envelopeId }: Omit<CompleteEsignItemInput, 'pdf'>,
  pdf: Buffer
): Promise<string | null> {
  try {
    const bucketName = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
    if (!adminStorage || !bucketName) {
      throw new Error('Storage bucket is not configured');
    }
    const completedPdfPath = completedPdfPathFor(userId, itemId);
    await adminStorage
      .bucket(bucketName)
      .file(completedPdfPath)
      .save(pdf, { contentType: 'application/pdf', resumable: false });
    return completedPdfPath;
  } catch (error) {
    console.error(`${LOG} completed pdf failed`, { userId, itemId, envelopeId, error });
    return null;
  }
}

// Owners read this in an email, so resolve a real name — but never at the cost
// of the notification itself, which is why the uid is an acceptable fallback.
async function resolveRepName(userId: string): Promise<string> {
  try {
    const userSnap = await adminDb!.doc(`users/${userId}`).get();
    return (
      (userSnap.get('displayName') as string | undefined) ||
      (userSnap.get('email') as string | undefined) ||
      userId
    );
  } catch (error) {
    console.error(`${LOG} failed to resolve rep name for owner notification`, { userId, error });
    return userId;
  }
}

/**
 * Records a signed e-sign document as approved and runs everything that hangs
 * off that: storing the signed PDF, notifying the rep and the owners, closing
 * signing alerts the rep no longer needs, and re-checking activation readiness.
 *
 * Called by the sign act (signEnvelope), which hands over the stamped bytes.
 * Ordering matters: the PDF is stored first, then the approval (with the PDF
 * path) is written in a transaction that re-checks the item still points at
 * this envelope, so a rejection that lands mid-signing is not overwritten.
 * Only after the approval exists do the notices go out, and each of them is
 * contained so a flaky mailbox or activation read cannot make the caller
 * report a failure (and invite a duplicate approval) for a completed signature.
 */
export async function completeEsignItem({
  userId,
  itemId,
  envelopeId,
  pdf,
}: CompleteEsignItemInput): Promise<CompleteEsignItemResult> {
  if (!adminDb) {
    throw new Error('Database not configured');
  }
  const db = adminDb;
  const item = ONBOARDING_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Unknown onboarding item: ${itemId}`);
  }

  const completedPdfPath = pdf ? await storeCompletedPdf({ userId, itemId, envelopeId }, pdf) : null;
  if (pdf && !completedPdfPath) {
    return { completedPdfPath: null, status: 'upload_failed' };
  }

  const onboardingRef = db.doc(`userOnboarding/${userId}_${itemId}`);
  const now = new Date();
  const approved = await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(onboardingRef);
    if (envelopeSuperseded(snap.exists ? snap.data() : undefined, envelopeId)) return false;
    transaction.set(
      onboardingRef,
      {
        userId,
        itemId,
        status: 'approved',
        rejectionReason: null,
        reviewedBy: 'system',
        reviewerName: 'E-sign (auto)',
        reviewedAt: now,
        updatedAt: now,
        ...(completedPdfPath ? { completedPdfPath } : {}),
      },
      { merge: true }
    );
    return true;
  });
  if (!approved) {
    console.error(`${LOG} envelope superseded before approval`, { userId, itemId, envelopeId });
    return { completedPdfPath: null, status: 'superseded' };
  }

  try {
    await createNotification({
      userId,
      type: 'esign_completed',
      title: 'Document signed',
      message: `${item.label} is complete.`,
      link: '/portal/onboarding',
    });
  } catch (error) {
    console.error(`${LOG} rep signed notification failed`, { userId, itemId, error });
  }

  const repName = await resolveRepName(userId);
  try {
    await notifyDocSigned({ userId, repName, itemLabel: item.label });
  } catch (error) {
    console.error(`${LOG} owner signed notification failed`, { userId, itemId, error });
  }

  // An active rep never passes through activation again, which is the other
  // place their alerts get closed, so a signing alert would otherwise re-nag
  // the back office daily about a document that is already signed.
  try {
    await resolveSigningAlertTasks(userId);
  } catch (error) {
    console.error(`${LOG} failed to resolve signing alerts`, { userId, itemId, error });
  }

  try {
    await maybeFlagActivationReady(userId);
  } catch (error) {
    console.error(`${LOG} failed to flag activation readiness`, { userId, itemId, error });
  }

  return { completedPdfPath, status: 'approved' };
}
