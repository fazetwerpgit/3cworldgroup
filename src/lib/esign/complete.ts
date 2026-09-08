import { adminDb, adminStorage } from '@/lib/firebase/admin';
import { createNotification } from '@/lib/notifications/createNotification';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';
import { notifyDocSigned } from '@/lib/onboarding/ownerNotify';
import { ONBOARDING_ITEMS } from '@/types/onboarding';

const LOG = '[esign complete]';

type OnboardingRef = ReturnType<NonNullable<typeof adminDb>['doc']>;

export interface CompleteEsignItemInput {
  userId: string;
  itemId: string;
  envelopeId: string;
  /** Signed PDF bytes, or null when the provider fetch failed (approval is still recorded, upload skipped). */
  pdf: Buffer | null;
}

export interface CompleteEsignItemResult {
  /** Storage path of the stored PDF, or null when there was nothing to store or storing it failed. */
  completedPdfPath: string | null;
}

export function completedPdfPathFor(userId: string, itemId: string): string {
  return `esign-completed/${userId}/${itemId}.pdf`;
}

// The signed PDF is evidence, not the approval itself: a rep who signed stays
// approved even when Storage is unavailable, so every failure here is logged
// and swallowed. A null path tells the caller the bytes are not retrievable —
// the in-house sign route uses that to refuse the signature and let the rep
// retry, the webhook accepts it because the provider still holds the original.
async function storeCompletedPdf(
  ref: OnboardingRef,
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
    await ref.set({ completedPdfPath }, { merge: true });
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
 * off that: storing the signed PDF, notifying the rep and the owners, and
 * re-checking activation readiness.
 *
 * Shared by the provider webhook (SignWell) and the in-house sign route, so it
 * takes bytes rather than fetching them. Ordering matters: the approval write
 * comes first and is the only step allowed to fail loudly, because a caller
 * that retries must not lose the approval. Every later step is contained so a
 * flaky bucket, mailbox, or activation read cannot undo a completed signature.
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
  const item = ONBOARDING_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) {
    throw new Error(`Unknown onboarding item: ${itemId}`);
  }

  const onboardingRef = adminDb.doc(`userOnboarding/${userId}_${itemId}`);
  const now = new Date();
  await onboardingRef.set(
    {
      userId,
      itemId,
      status: 'approved',
      rejectionReason: null,
      reviewedBy: 'system',
      reviewerName: 'E-sign (auto)',
      reviewedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );

  const completedPdfPath = pdf
    ? await storeCompletedPdf(onboardingRef, { userId, itemId, envelopeId }, pdf)
    : null;

  // Deliberately not contained: the rep's checklist notification is the only
  // signal that the document landed, so a failure here should surface to the
  // caller (which retries) rather than pass silently.
  await createNotification({
    userId,
    type: 'esign_completed',
    title: 'Document signed',
    message: `${item.label} is complete.`,
    link: '/portal/onboarding',
  });

  const repName = await resolveRepName(userId);
  try {
    await notifyDocSigned({ userId, repName, itemLabel: item.label });
  } catch (error) {
    console.error(`${LOG} owner signed notification failed`, { userId, itemId, error });
  }

  try {
    await maybeFlagActivationReady(userId);
  } catch (error) {
    console.error(`${LOG} failed to flag activation readiness`, { userId, itemId, error });
  }

  return { completedPdfPath };
}
