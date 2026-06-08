import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  canAccessChatChannel,
  getChatChannel,
  getEffectiveRole,
  resolveRoles,
} from '@/types';

async function getUserContext(userId: string) {
  if (!adminDb) return null;
  const userDoc = await adminDb.collection('users').doc(userId).get();
  if (!userDoc.exists) return null;
  const data = userDoc.data();
  const { role, fieldRole } = resolveRoles(data?.role, data?.fieldRole);
  return {
    uid: userId,
    role,
    fieldRole,
    effectiveRole: getEffectiveRole({ role, fieldRole }),
    displayName: data?.displayName || data?.email || '3C User',
    canModerate: role === 'admin' || role === 'operations',
  };
}

export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const userId = request.nextUrl.searchParams.get('userId');
    const channelId = request.nextUrl.searchParams.get('channelId');
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(50, Math.floor(limitParam)))
      : 50;

    if (!userId || !channelId) {
      return NextResponse.json(
        { error: 'userId and channelId are required' },
        { status: 400 }
      );
    }

    const channel = getChatChannel(channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }

    const user = await getUserContext(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const snapshot = await adminDb
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(limit + 25)
      .get();

    const messages = snapshot.docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          channelId,
          text: data.text ?? '',
          authorId: data.authorId,
          authorName: data.authorName ?? '3C User',
          authorRole: data.authorRole,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        };
      })
      .slice(0, limit)
      .reverse();

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error loading chat messages:', error);
    return NextResponse.json({ error: 'Failed to load chat messages' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!userId || !channelId || !text) {
      return NextResponse.json(
        { error: 'userId, channelId, and text are required' },
        { status: 400 }
      );
    }
    if (text.length > 1000) {
      return NextResponse.json({ error: 'Message is limited to 1000 characters' }, { status: 400 });
    }

    const channel = getChatChannel(channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }

    const user = await getUserContext(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (!canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messageRef = await adminDb
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .add({
        channelId,
        text: text.slice(0, 1000),
        authorId: user.uid,
        authorName: user.displayName,
        authorRole: user.effectiveRole ?? null,
        createdAt: FieldValue.serverTimestamp(),
        deletedAt: null,
      });

    return NextResponse.json({ success: true, messageId: messageRef.id });
  } catch (error) {
    console.error('Error sending chat message:', error);
    return NextResponse.json({ error: 'Failed to send chat message' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json();
    const userId = typeof body.userId === 'string' ? body.userId : '';
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';

    if (!userId || !channelId || !messageId) {
      return NextResponse.json(
        { error: 'userId, channelId, and messageId are required' },
        { status: 400 }
      );
    }

    const channel = getChatChannel(channelId);
    const user = await getUserContext(userId);
    if (!channel || !user || !canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messageRef = adminDb
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .doc(messageId);
    const messageDoc = await messageRef.get();
    if (!messageDoc.exists) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    const message = messageDoc.data();
    if (message?.authorId !== userId && !user.canModerate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await messageRef.set(
      {
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: userId,
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    return NextResponse.json({ error: 'Failed to delete chat message' }, { status: 500 });
  }
}
