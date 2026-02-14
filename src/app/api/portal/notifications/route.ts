import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

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

    // Simple query without ordering to avoid index requirements
    // We'll sort in memory instead
    let query = adminDb
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

    if (markAllRead && userId) {
      // Mark all notifications as read for user
      const snapshot = await adminDb
        .collection('notifications')
        .where('userId', '==', userId)
        .where('read', '==', false)
        .get();

      const batch = adminDb.batch();
      snapshot.docs.forEach((doc) => {
        batch.update(doc.ref, { read: true });
      });
      await batch.commit();

      return NextResponse.json({
        success: true,
        message: `Marked ${snapshot.size} notifications as read`,
      });
    }

    if (notificationIds && Array.isArray(notificationIds)) {
      const batch = adminDb.batch();
      for (const id of notificationIds) {
        const ref = adminDb.collection('notifications').doc(id);
        batch.update(ref, { read: true });
      }
      await batch.commit();

      return NextResponse.json({
        success: true,
        message: `Marked ${notificationIds.length} notifications as read`,
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
