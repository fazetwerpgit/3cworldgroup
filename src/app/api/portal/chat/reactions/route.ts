import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { canAccessChatChannel } from '@/types';
import { isAllowedChatReactionEmoji, toggleReaction } from '@/lib/chat/reactions';
import { ensureChatChannelMember, toChatChannel } from '@/lib/chat/channels';

export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const user = result.user;
    const body = await request.json();
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    const emoji = typeof body.emoji === 'string' ? body.emoji : '';

    if (!channelId || !messageId || !emoji) {
      return NextResponse.json({ error: 'channelId, messageId, and emoji are required' }, { status: 400 });
    }
    if (!isAllowedChatReactionEmoji(emoji)) {
      return NextResponse.json({ error: 'Unsupported reaction emoji' }, { status: 400 });
    }

    // Look up the channel from Firestore so admin-created channels work (not just
    // the static defaults), matching the messages route.
    const channelSnap = await adminDb.collection('chatChannels').doc(channelId).get();
    const channel = channelSnap.exists ? toChatChannel(channelSnap.id, channelSnap.data() ?? {}) : null;
    if (!channel || !canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await ensureChatChannelMember(channelId, user.uid);

    const messageRef = adminDb.collection('chatChannels').doc(channelId).collection('messages').doc(messageId);

    await adminDb.runTransaction(async (transaction) => {
      const messageDoc = await transaction.get(messageRef);
      if (!messageDoc.exists) throw new Error('MESSAGE_NOT_FOUND');
      const data = messageDoc.data() ?? {};
      if (data.deletedAt) throw new Error('MESSAGE_NOT_FOUND');

      const next = toggleReaction(
        {
          reactionCounts: data.reactionCounts,
          reactions: data.reactions,
        },
        emoji,
        user.uid
      );

      transaction.set(messageRef, next, { merge: true });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'MESSAGE_NOT_FOUND') {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    console.error('Error toggling chat reaction:', error);
    return NextResponse.json({ error: 'Failed to update reaction' }, { status: 500 });
  }
}
