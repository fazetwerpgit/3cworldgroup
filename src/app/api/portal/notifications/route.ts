import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  requireVerifiedManagement,
  requireVerifiedRequester,
  requireVerifiedSelfOrManagement,
} from '@/lib/auth/requireVerifiedAdmin';

// GET /api/portal/notifications - Get user notifications
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');
    const limitParam = searchParams.get('limit');
    const limit = limitParam === null ? 20 : Number(limitParam);
    if (!Number.isInteger(limit) || limit < 1) {
      return NextResponse.json({ error: 'limit must be a positive integer' }, { status: 400 });
    }
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // A user may read their own notifications; management may read anyone's.
    // The shared API allowlist keeps the onboarding bell available to a hired
    // rep while the self/management check preserves record ownership.
    const gate = await requireVerifiedSelfOrManagement(request, userId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Newest first AT THE QUERY, so the window we read is the newest 2x the limit.
    // (Unordered, a user with more than that many notifications could get an
    // arbitrary slice and the bell would miss the newest ones.) Needs the
    // notifications userId + createdAt composite in firestore.indexes.json; until
    // that index is built the query fails with FAILED_PRECONDITION, so fall back
    // to the old unordered read rather than break the bell during the deploy.
    const byUser = adminDb.collection('notifications').where('userId', '==', userId);
    let snapshot;
    try {
      snapshot = await byUser.orderBy('createdAt', 'desc').limit(limit * 2).get();
    } catch (error) {
      // FAILED_PRECONDITION (gRPC 9): the composite index is not built yet.
      const indexNotBuilt = typeof error === 'object' && error !== null && 'code' in error && error.code === 9;
      if (!indexNotBuilt) throw error;
      console.warn('notifications: userId+createdAt index not built yet, reading unordered');
      snapshot = await byUser.limit(limit * 2).get();
    }

    // Unread filtering and the final newest-first trim still happen in memory.
    interface NotificationData {
      id: string;
      userId: string;
      type: string;
      title: string;
      message: string;
      read: boolean;
      createdAt: Date | null;
      link?: string;
      metadata?: Record<string, unknown>;
    }

    let notifications: NotificationData[] = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        read: data.read ?? false,
        createdAt: data.createdAt?.toDate() || null,
        link: data.link,
        metadata: data.metadata,
      };
    });

    // Filter unread if needed
    if (unreadOnly) {
      notifications = notifications.filter((n) => !n.read);
    }

    // Sort by createdAt descending
    notifications.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    // Apply limit
    notifications = notifications.slice(0, limit);

    // Get unread count
    const unreadSnapshot = await adminDb
      .collection('notifications')
      .where('userId', '==', userId)
      .where('read', '==', false)
      .count()
      .get();

    return NextResponse.json({
      notifications,
      unreadCount: unreadSnapshot.data().count,
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    );
  }
}

// POST /api/portal/notifications - Create a notification
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Routes create notifications internally via their own helpers; this public
    // endpoint is an admin/announcement tool. Gate it so a caller can't spoof
    // notifications (e.g. fake "Sale Approved") to arbitrary users.
    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const body = await request.json();
    const { userId, type, title, message, link, metadata } = body;

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const notification = {
      userId,
      type,
      title,
      message,
      link: link || null,
      metadata: metadata || {},
      read: false,
      createdAt: new Date(),
    };

    const docRef = await adminDb.collection('notifications').add(notification);

    return NextResponse.json({
      success: true,
      notification: {
        id: docRef.id,
        ...notification,
      },
    });
  } catch (error) {
    console.error('Error creating notification:', error);
    return NextResponse.json(
      { error: 'Failed to create notification' },
      { status: 500 }
    );
  }
}

// PUT /api/portal/notifications - Mark notifications as read
export async function PUT(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { notificationIds, userId, markAllRead } = body;

    // Commit doc refs in chunks to respect Firestore's 500-op batch limit.
    const commitInChunks = async (refs: FirebaseFirestore.DocumentReference[]) => {
      for (let i = 0; i < refs.length; i += 450) {
        const batch = adminDb!.batch();
        for (const ref of refs.slice(i, i + 450)) {
          batch.update(ref, { read: true });
        }
        await batch.commit();
      }
    };

    if (markAllRead && userId) {
      // Same bell and ownership boundary as GET above.
      const gate = await requireVerifiedSelfOrManagement(request, userId);
      if (!gate.ok) {
        return NextResponse.json({ error: gate.error }, { status: gate.status });
      }

      const snapshot = await adminDb
        .collection('notifications')
        .where('userId', '==', userId)
        .where('read', '==', false)
        .get();

      await commitInChunks(snapshot.docs.map((doc) => doc.ref));

      return NextResponse.json({
        success: true,
        message: `Marked ${snapshot.size} notifications as read`,
      });
    }

    if (notificationIds && Array.isArray(notificationIds)) {
      // The shared API allowlist admits the onboarding bell; ownedRefs below
      // still restricts this operation to the caller's own docs.
      const requester = await requireVerifiedRequester(request);
      if (!requester.ok) {
        return NextResponse.json({ error: requester.error }, { status: requester.status });
      }

      if (!notificationIds.every((id: unknown) => typeof id === 'string' && id.length > 0)) {
        return NextResponse.json({ error: 'notificationIds must be non-empty strings' }, { status: 400 });
      }
      if (notificationIds.length === 0) {
        return NextResponse.json({ success: true, message: 'Marked 0 notifications as read' });
      }

      // Only mark notifications the caller actually owns (management may mark
      // any). A spoofed id for someone else's notification is silently skipped.
      const docs = await adminDb.getAll(
        ...notificationIds.map((id: string) =>
          adminDb!.collection('notifications').doc(id)
        )
      );
      const ownedRefs = docs
        .filter(
          (doc) =>
            doc.exists &&
            (requester.isManagement || doc.data()?.userId === requester.uid)
        )
        .map((doc) => doc.ref);

      await commitInChunks(ownedRefs);

      return NextResponse.json({
        success: true,
        message: `Marked ${ownedRefs.length} notifications as read`,
      });
    }

    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating notifications:', error);
    return NextResponse.json(
      { error: 'Failed to update notifications' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/notifications - Clear all of a user's notifications
export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    // Same gate as mark-all-read: a user may clear their own bell; management
    // may clear anyone's. The shared API allowlist admits hired reps here.
    const gate = await requireVerifiedSelfOrManagement(request, userId);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const snapshot = await adminDb
      .collection('notifications')
      .where('userId', '==', userId)
      .get();

    // Chunked to respect Firestore's 500-op batch limit.
    for (let i = 0; i < snapshot.docs.length; i += 450) {
      const batch = adminDb.batch();
      for (const doc of snapshot.docs.slice(i, i + 450)) {
        batch.delete(doc.ref);
      }
      await batch.commit();
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${snapshot.size} notifications`,
    });
  } catch (error) {
    console.error('Error clearing notifications:', error);
    return NextResponse.json(
      { error: 'Failed to clear notifications' },
      { status: 500 }
    );
  }
}
