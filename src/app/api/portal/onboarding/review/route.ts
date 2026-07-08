import { NextRequest, NextResponse } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types';
import { isStorageItem } from '@/lib/onboarding/uploads';
import { requireManagement } from '@/lib/auth/requireManagement';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { appBaseUrl, itemRejectedEmail } from '@/lib/email/templates';
import { maybeFlagActivationReady } from '@/lib/onboarding/activation';

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

// GET /api/portal/onboarding/review - List submitted items awaiting review.
// Used by the ops review queue. Joins item metadata + user display info.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // The review queue exposes other users' submissions; management only.
    const gate = await requireManagement(
      request.nextUrl.searchParams.get('requestedBy')
    );
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const snapshot = await adminDb
      .collection('userOnboarding')
      .where('status', '==', 'submitted')
      .get();

    // Collect unique user ids to join display names in one batch
    const userIds = [...new Set(snapshot.docs.map((d) => d.data().userId as string))];
    const userMap = new Map<string, { displayName?: string; email?: string; atRisk: boolean }>();
    if (userIds.length > 0) {
      const userDocs = await adminDb.getAll(
        ...userIds.map((id) => adminDb!.collection('users').doc(id))
      );
      for (const doc of userDocs) {
        if (doc.exists) {
          const d = doc.data();
          userMap.set(doc.id, {
            displayName: d?.displayName,
            email: d?.email,
            atRisk: !!doc.get('atRisk'),
          });
        }
      }
    }

    const submissions = await Promise.all(
      snapshot.docs.map(async (doc) => {
        const data = doc.data();
        const item = ONBOARDING_ITEMS.find((i) => i.id === data.itemId);
        const user = userMap.get(data.userId);
        const storage = isStorageItem(data.itemId);
        return {
          id: doc.id,
          userId: data.userId,
          itemId: data.itemId,
          itemLabel: item?.label ?? data.itemId,
          category: item?.category ?? 'paperwork',
          sensitive: item?.sensitive ?? false,
          referenceKind: item?.referenceKind ?? 'manual',
          reference: data.reference ?? null,
          files: storage ? await signFolderFiles(data.reference ?? null) : [],
          userName: user?.displayName ?? user?.email ?? data.userId,
          userEmail: user?.email ?? '',
          atRisk: !!user?.atRisk,
          submittedAt: data.submittedAt?.toDate() ?? null,
        };
      })
    );

    submissions.sort((a, b) => {
      const ta = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
      const tb = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
      return ta - tb; // oldest first - FIFO review queue
    });

    return NextResponse.json({ submissions });
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

    const body = await request.json();
    const { userId, itemId, status, reviewerId, reviewerName, rejectionReason } = body;

    if (!userId || !itemId || !status || !reviewerId) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, itemId, status, reviewerId' },
        { status: 400 }
      );
    }

    // Only admin/operations may approve/reject onboarding submissions.
    const gate = await requireManagement(reviewerId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
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
    await docRef.update({
      status,
      reviewedBy: reviewerId,
      reviewerName: reviewerName || '',
      reviewedAt: now,
      rejectionReason: status === 'rejected' ? rejectionReason.trim() : null,
      updatedAt: now,
    });

    try {
      // Notify the rep of the outcome
      if (status === 'approved') {
        await dispatchToUser({
          userId,
          type: 'onboarding_approved',
          title: `${item.label} Approved`,
          message: `Your ${item.label} submission has been approved.`,
          link: '/portal/onboarding',
          metadata: { itemId },
        });
        void maybeFlagActivationReady(userId).catch((error) => {
          console.error('Failed to flag activation readiness after item approval:', error);
        });
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
