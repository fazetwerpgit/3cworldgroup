import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireManagement, requireSelfOrManagement } from '@/lib/auth/requireManagement';

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
    const limit = parseInt(searchParams.get('limit') || '20');
    const unreadOnly = searchParams.get('unreadOnly') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    // A user may read their own notifications; management may read anyone's.
    const gate = await requireSelfOrManagement(
      searchParams.get('requestedBy'),
      userId
    );
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Simple query without ordering to avoid index requirements
    // We'll sort in memory instead
    const query = adminDb
      .collection('notifications')
      .where('userId', '==', userId);

    const snapshot = await query.limit(limit * 2).get();

    // Sort and filter in memory to avoid compound index requirements
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

    const body = await request.json();
    const { userId, type, title, message, link, metadata } = body;

    if (!userId || !type || !title || !message) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Routes create notifications internally via their own helpers; this public
    // endpoint is an admin/announcement tool. Gate it so a caller can't spoof
    // notifications (e.g. fake "Sale Approved") to arbitrary users.
    const gate = await requireManagement(body.requestedBy);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
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
    const { notificationIds, userId, markAllRead, requestedBy } = body;

    // Resolve the caller once; both branches scope writes to the caller's own
    // notifications (management may act on anyone's).
    const caller = requestedBy ?? userId;

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
      const gate = await requireSelfOrManagement(caller, userId);
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
      const requester = await requireSelfOrManagement(caller, caller);
      if (!requester.ok) {
        return NextResponse.json({ error: requester.error }, { status: requester.status });
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
            (requester.requester.isManagement ||
              doc.data()?.userId === requester.requester.uid)
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
