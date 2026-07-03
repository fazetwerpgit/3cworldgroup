import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { canAccessChatChannel, ChatChannel } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { ensureChatChannelMember, toChatChannel } from '@/lib/chat/channels';
import {
  getChatStorageBucketName,
  readStoredAttachment,
  validateMessageAttachment,
} from '@/lib/chat/media';

async function getFirestoreChatChannel(channelId: string): Promise<ChatChannel | null> {
  if (!adminDb) throw new Error('Database not configured');
  const snap = await adminDb.collection('chatChannels').doc(channelId).get();
  if (!snap.exists) return null;
  return toChatChannel(snap.id, snap.data() ?? {});
}

// GET /api/portal/chat/messages?channelId=...&limit=50 — verified caller only.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const channelId = request.nextUrl.searchParams.get('channelId');
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(50, Math.floor(limitParam)))
      : 50;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    const channel = await getFirestoreChatChannel(channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await ensureChatChannelMember(channelId, user.uid);

    const snapshot = await adminDb!
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
        const attachment = readStoredAttachment(data.attachment);
        return {
          id: doc.id,
          channelId,
          text: data.text ?? '',
          authorId: data.authorId,
          authorName: data.authorName ?? '3C User',
          authorRole: data.authorRole,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
          // Only present on media messages; omitted otherwise so legacy docs are byte-identical.
          ...(attachment ? { attachment, hasAttachment: true } : {}),
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

// POST — send a message as the VERIFIED caller. Author identity is stamped server-side.
export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const body = await request.json();
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const hasAttachmentInput = body.attachment !== undefined && body.attachment !== null;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    // Text is optional ONLY when a (later-validated) attachment is present.
    if (!text && !hasAttachmentInput) {
      return NextResponse.json({ error: 'channelId and text are required' }, { status: 400 });
    }
    if (text.length > 1000) {
      return NextResponse.json({ error: 'Message is limited to 1000 characters' }, { status: 400 });
    }

    const channel = await getFirestoreChatChannel(channelId);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate the attachment shape/origin server-side (post-access, pre-write). A
    // present-but-invalid attachment is rejected, never silently dropped.
    let attachment;
    if (hasAttachmentInput) {
      const bucketName = getChatStorageBucketName();
      if (!bucketName) {
        return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
      }
      const validated = validateMessageAttachment(body.attachment, channelId, bucketName);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      attachment = validated.attachment;
    }

    await ensureChatChannelMember(channelId, user.uid);

    const messageRef = await adminDb!
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
        // hasAttachment lets Firestore query media messages; both set iff valid attachment.
        ...(attachment ? { attachment, hasAttachment: true } : {}),
      });

    return NextResponse.json({ success: true, messageId: messageRef.id });
  } catch (error) {
    console.error('Error sending chat message:', error);
    return NextResponse.json({ error: 'Failed to send chat message' }, { status: 500 });
  }
}

// DELETE — author (self) or a moderator (admin/operations) can soft-delete.
export async function DELETE(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const body = await request.json();
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';

    if (!channelId || !messageId) {
      return NextResponse.json({ error: 'channelId and messageId are required' }, { status: 400 });
    }

    const channel = await getFirestoreChatChannel(channelId);
    if (!channel || !canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messageRef = adminDb!
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .doc(messageId);
    const messageDoc = await messageRef.get();
    if (!messageDoc.exists) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    const message = messageDoc.data();
    // Only the original author or a moderator may delete.
    if (message?.authorId !== user.uid && !user.canModerate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await messageRef.set(
      { deletedAt: FieldValue.serverTimestamp(), deletedBy: user.uid },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    return NextResponse.json({ error: 'Failed to delete chat message' }, { status: 500 });
  }
}
