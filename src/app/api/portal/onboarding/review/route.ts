import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { ONBOARDING_ITEMS } from '@/types';
import { requireManagement } from '@/lib/auth/requireManagement';

// Helper function to create a notification (mirrors sales/approve)
async function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string,
  link?: string,
  metadata?: Record<string, unknown>
) {
  if (!adminDb) return;

  try {
    await adminDb.collection('notifications').add({
      userId,
      type,
      title,
      message,
      link,
      metadata: metadata || {},
      read: false,
      createdAt: new Date(),
    });
  } catch (error) {
    console.error('Error creating notification:', error);
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
    const userMap = new Map<string, { displayName?: string; email?: string }>();
    if (userIds.length > 0) {
      const userDocs = await adminDb.getAll(
        ...userIds.map((id) => adminDb!.collection('users').doc(id))
      );
      for (const doc of userDocs) {
        if (doc.exists) {
          const d = doc.data();
          userMap.set(doc.id, { displayName: d?.displayName, email: d?.email });
        }
      }
    }

    const submissions = snapshot.docs
      .map((doc) => {
        const data = doc.data();
        const item = ONBOARDING_ITEMS.find((i) => i.id === data.itemId);
        const user = userMap.get(data.userId);
        return {
          id: doc.id,
          userId: data.userId,
          itemId: data.itemId,
          itemLabel: item?.label ?? data.itemId,
          category: item?.category ?? 'paperwork',
          sensitive: item?.sensitive ?? false,
          reference: data.reference ?? null,
          userName: user?.displayName ?? user?.email ?? data.userId,
          userEmail: user?.email ?? '',
          submittedAt: data.submittedAt?.toDate() ?? null,
        };
      })
      .sort((a, b) => {
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

    // Notify the rep of the outcome
    if (status === 'approved') {
      await createNotification(
        userId,
        'onboarding_approved',
        `${item.label} Approved`,
        `Your ${item.label} submission has been approved.`,
        '/portal/onboarding',
        { itemId }
      );
    } else {
      await createNotification(
        userId,
        'onboarding_rejected',
        `${item.label} Needs Attention`,
        rejectionReason.trim(),
        '/portal/onboarding',
        { itemId, rejectionReason: rejectionReason.trim() }
      );
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
