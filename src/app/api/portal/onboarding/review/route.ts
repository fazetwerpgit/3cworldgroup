import { after, NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import {
  getOnboardingItemsForUser,
  ONBOARDING_ITEMS,
  resolveRoles,
  RoleDisplayNames,
  type OnboardingItem,
  type OnboardingStatus,
} from '@/types';
import { isStorageItem } from '@/lib/onboarding/uploads';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { appBaseUrl, itemRejectedEmail } from '@/lib/email/templates';
import { onboardingFrom } from '@/lib/email/sendEmail';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';
import { isEsignItem } from '@/lib/onboarding/esign';
import { sendPendingEsignDocs } from '@/lib/esign/autoSend';
import { logSensitiveFileAccess } from '@/lib/onboarding/sensitiveAccess';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

// For a storage-item reference (a folder path), list its files and mint a
// 15-minute signed read URL for each. Degrades to [] on any error so one bad
// reference never 500s the whole review queue.
async function signFolderFiles(
  reference: string | null
): Promise<{ name: string; url: string; contentType: string }[]> {
  if (!reference) return [];
  try {
    const bucket = getOnboardingBucket();
    // Always list within the exact folder. A trailing slash prevents a legacy
    // reference like ".../dl_photos" from over-matching ".../dl_photos_x/...".
    const prefix = reference.endsWith('/') ? reference : `${reference}/`;
    const [files] = await bucket.getFiles({ prefix });
    const expires = Date.now() + SIGNED_URL_TTL_MS;
    return Promise.all(
      files.map(async (f) => {
        const [url] = await f.getSignedUrl({ action: 'read', expires });
        return {
          name: f.name.split('/').pop() ?? f.name,
          url,
          contentType: String(f.metadata.contentType ?? ''),
        };
      })
    );
  } catch (error) {
    console.error('Failed to sign storage files for review:', error);
    return [];
  }
}

type ProgressData = FirebaseFirestore.DocumentData;

// GET /api/portal/onboarding/review - Onboarding grouped by person.
// `people`: every rep with onboarding progress or still pending, each with
// their whole checklist (items never started included), reps with something
// waiting first. `submissions`: the flat review queue (submitted, not e-sign),
// oldest first; the admin dashboard counts it.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // The review queue exposes other users' submissions; management only.
    // Files on sensitive items (driver's-license photos, ...) are signed only
    // for admin/owner callers; operations sees the item with no file URLs.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const [submittedSnap, reviewedSnap, pendingSnap] = await Promise.all([
      adminDb.collection('userOnboarding').where('status', '==', 'submitted').get(),
      adminDb.collection('userOnboarding').where('status', 'in', ['approved', 'rejected']).get(),
      // A new hire who has not submitted anything yet still has a checklist.
      adminDb.collection('users').where('status', '==', 'pending').get(),
    ]);

    const progressByUser = new Map<string, Map<string, ProgressData>>();
    for (const doc of [...submittedSnap.docs, ...reviewedSnap.docs]) {
      const data = doc.data();
      const userId = data.userId as string | undefined;
      const itemId = data.itemId as string | undefined;
      if (!userId || !itemId) continue;
      if (!progressByUser.has(userId)) progressByUser.set(userId, new Map());
      progressByUser.get(userId)!.set(itemId, data);
    }

    const users = new Map<string, ProgressData>();
    for (const doc of pendingSnap.docs) {
      // A pending self-signup has no field role yet, so no checklist.
      const data = doc.data();
      if (resolveRoles(data.role, data.fieldRole).fieldRole) users.set(doc.id, data);
    }
    const missing = [...progressByUser.keys()].filter((id) => !users.has(id));
    if (missing.length > 0) {
      const userDocs = await adminDb.getAll(...missing.map((id) => adminDb!.collection('users').doc(id)));
      for (const doc of userDocs) {
        if (doc.exists) users.set(doc.id, doc.data() ?? {});
      }
    }

    // Signs a storage item's files. For a sensitive item the caller must be
    // admin/owner, and every minted URL set is audited in sensitiveAccessLog;
    // if the audit write fails the files are withheld (fail closed).
    const filesFor = async (
      userId: string,
      itemId: string,
      reference: string | null,
      sensitive: boolean
    ) => {
      if (!isStorageItem(itemId)) return [];
      if (sensitive && !gate.isAdmin) return [];
      const files = await signFolderFiles(reference);
      if (!sensitive || files.length === 0) return files;
      try {
        await logSensitiveFileAccess({
          targetUid: userId,
          itemId,
          revealedBy: gate.uid,
          revealedByName: gate.name,
          source: 'onboarding-review',
        });
        return files;
      } catch (error) {
        console.error('Failed to audit sensitive onboarding file access:', error);
        return [];
      }
    };

    const toRow = async (userId: string, item: OnboardingItem, data: ProgressData | null) => {
      const status = (data?.status ?? 'not_started') as OnboardingStatus;
      const reference = (data?.reference as string | undefined) ?? null;
      return {
        id: `${userId}_${item.id}`,
        userId,
        itemId: item.id,
        itemLabel: item.label,
        category: item.category,
        sensitive: item.sensitive,
        // True when the item holds sensitive files this caller may not open
        // (operations). The UI shows an "Admin only" note instead of links.
        adminOnly: item.sensitive && !gate.isAdmin,
        referenceKind: item.referenceKind,
        reference,
        // Files are signed only for items under review: that is where they
        // are looked at, and each sensitive signing is an audited reveal.
        files: status === 'submitted' ? await filesFor(userId, item.id, reference, item.sensitive) : [],
        status,
        submittedAt: (data?.submittedAt?.toDate?.() as Date | undefined) ?? null,
        reviewedAt: (data?.reviewedAt?.toDate?.() as Date | undefined) ?? null,
        reviewerName: (data?.reviewerName as string | undefined) ?? null,
        rejectionReason: (data?.rejectionReason as string | undefined) ?? null,
        esignEnvelopeId: typeof data?.esignEnvelopeId === 'string' ? data.esignEnvelopeId : null,
        // Only a stored PDF opens. Envelopes from the old provider (Mason's 8/24
        // documents) and unsigned ones can't be fetched, so they read "No PDF".
        hasSignedPdf: item.referenceKind === 'esign' && Boolean(data?.completedPdfPath),
        manualCompletion: data?.manualCompletion
          ? {
              note: data.manualCompletion.note as string,
              byName: data.manualCompletion.byName as string,
              at: (data.manualCompletion.at?.toDate?.() as Date | undefined) ?? null,
            }
          : null,
      };
    };

    const userIds = new Set([...users.keys(), ...progressByUser.keys()]);
    const people = await Promise.all(
      [...userIds].map(async (userId) => {
        const user = users.get(userId);
        const progress = progressByUser.get(userId) ?? new Map<string, ProgressData>();
        const { role, fieldRole } = resolveRoles(user?.role, user?.fieldRole);
        // The rep's checklist, plus anything they have progress on that no
        // longer applies (a role change) so nothing they did is hidden.
        const applicable = new Set(
          (fieldRole ? getOnboardingItemsForUser(fieldRole, user?.isIBO === true) : []).map((item) => item.id)
        );
        const checklist = ONBOARDING_ITEMS.filter(
          (item) => applicable.has(item.id) || progress.has(item.id)
        ).sort((a, b) => a.order - b.order);
        const items = await Promise.all(
          checklist.map((item) => toRow(userId, item, progress.get(item.id) ?? null))
        );
        const waitingItems = items.filter((item) => item.status === 'submitted');
        const waitingSince = waitingItems.reduce(
          (min, item) => Math.min(min, item.submittedAt?.getTime() ?? Infinity),
          Infinity
        );
        const roleKey = fieldRole ?? role;
        return {
          userId,
          userName: (user?.displayName as string | undefined) || (user?.email as string | undefined) || userId,
          userEmail: (user?.email as string | undefined) ?? '',
          roleLabel: roleKey ? RoleDisplayNames[roleKey] : null,
          atRisk: user?.atRisk === true,
          items,
          done: items.filter((item) => item.status === 'approved').length,
          total: items.length,
          // Submitted and waiting on management.
          toReview: waitingItems.filter((item) => !isEsignItem(item.itemId)).length,
          // Out for signature and waiting on the rep.
          unsigned: waitingItems.filter((item) => isEsignItem(item.itemId)).length,
          waitingSince: Number.isFinite(waitingSince) ? new Date(waitingSince) : null,
        };
      })
    );

    // Anyone with something waiting first, longest wait at the top; then by name.
    people.sort((a, b) => {
      const aWaiting = a.toReview + a.unsigned > 0;
      const bWaiting = b.toReview + b.unsigned > 0;
      if (aWaiting !== bWaiting) return aWaiting ? -1 : 1;
      const aTime = a.waitingSince?.getTime() ?? 0;
      const bTime = b.waitingSince?.getTime() ?? 0;
      if (aTime !== bTime) return aTime - bTime;
      return a.userName.localeCompare(b.userName);
    });

    const submissions = people
      .flatMap((person) => person.items)
      .filter((item) => item.status === 'submitted' && !isEsignItem(item.itemId))
      .sort((a, b) => (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0));

    return NextResponse.json({ people, submissions });
  } catch (error) {
    console.error('Error fetching review queue:', error);
    return NextResponse.json(
      { error: 'Failed to fetch review queue' },
      { status: 500 }
    );
  }
}

// POST /api/portal/onboarding/review - Approve or reject a submitted item
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Only admin/operations may approve/reject onboarding submissions. Gate
    // before reading the body: the reviewer is whoever holds the token, never a
    // reviewerId the client names.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await request.json();
    // userId is the TARGET rep whose item is under review — data, not identity.
    const { userId, itemId, status, rejectionReason } = body;

    if (!userId || !itemId || !status) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, itemId, status' },
        { status: 400 }
      );
    }

    if (!['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "approved" or "rejected"' },
        { status: 400 }
      );
    }

    if (status === 'rejected' && !rejectionReason?.trim()) {
      return NextResponse.json(
        { error: 'A rejection reason is required' },
        { status: 400 }
      );
    }

    const item = ONBOARDING_ITEMS.find((i) => i.id === itemId);
    if (!item) {
      return NextResponse.json(
        { error: 'Unknown onboarding item' },
        { status: 400 }
      );
    }

    if (status === 'approved' && isEsignItem(itemId)) {
      return NextResponse.json(
        { error: 'E-signature items are completed only by the e-sign provider' },
        { status: 400 }
      );
    }

    const docRef = adminDb.collection('userOnboarding').doc(`${userId}_${itemId}`);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const currentStatus = doc.data()?.status;
    if (currentStatus !== 'submitted') {
      return NextResponse.json(
        { error: `Item is not under review (current status: ${currentStatus})` },
        { status: 400 }
      );
    }

    const now = new Date();
    const isRejectedEsign = status === 'rejected' && isEsignItem(itemId);
    const currentEnvelopeId = isRejectedEsign
      ? (doc.get('esignEnvelopeId') as string | undefined)
      : undefined;
    await docRef.update({
      status,
      reviewedBy: gate.uid,
      reviewerName: gate.name,
      reviewedAt: now,
      rejectionReason: status === 'rejected' ? rejectionReason.trim() : null,
      ...(isRejectedEsign
        ? {
            ...(currentEnvelopeId
              ? { supersededEnvelopeIds: FieldValue.arrayUnion(currentEnvelopeId) }
              : {}),
            reference: FieldValue.delete(),
            esignEnvelopeId: FieldValue.delete(),
            esignDispatch: FieldValue.delete(),
          }
        : {}),
      updatedAt: now,
    });

    if (isRejectedEsign) {
      // The signing URL is a bearer capability for the superseded envelope -
      // once rejected, offering it back to the candidate would let them keep
      // signing a document management has already thrown out.
      try {
        await adminDb.collection('esignSigningUrls').doc(`${userId}_${itemId}`).delete();
      } catch (error) {
        console.error('Failed to delete stale esign signing url:', error);
      }
      after(() =>
        sendPendingEsignDocs(userId).catch((error) => {
          console.error('Failed to resend e-sign documents after rejection:', error);
        })
      );
    }

    try {
      // Notify the rep of the outcome
      if (status === 'approved') {
        await dispatchToUser({
          userId,
          type: 'onboarding_approved',
          title: `${item.label} Approved`,
          message: `Your ${item.label} has been approved.`,
          link: '/portal/onboarding',
          metadata: { itemId },
        });
        after(() =>
          maybeFlagActivationReady(userId).catch((error) => {
            console.error('Failed to flag activation readiness after item approval:', error);
          })
        );
      } else {
        const userSnap = await adminDb.collection('users').doc(userId).get();
        const name = (userSnap.get('displayName') as string | undefined) ?? 'Rep';
        const reason = rejectionReason.trim();
        await dispatchToUser({
          userId,
          type: 'onboarding_rejected',
          title: `${item.label} Needs Attention`,
          message: reason,
          link: '/portal/onboarding',
          email: itemRejectedEmail({
            name,
            itemLabel: item.label,
            reason,
            portalUrl: `${appBaseUrl()}/portal/onboarding`,
          }),
          emailFrom: onboardingFrom(),
          metadata: { itemId, rejectionReason: reason },
        });
      }
    } catch (error) {
      console.error('Error creating notification:', error);
    }

    return NextResponse.json({
      success: true,
      message: `${item.label} ${status}`,
    });
  } catch (error) {
    console.error('Error reviewing onboarding item:', error);
    return NextResponse.json(
      { error: 'Failed to review onboarding item' },
      { status: 500 }
    );
  }
}
