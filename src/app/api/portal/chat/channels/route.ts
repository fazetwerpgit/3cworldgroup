import { NextRequest, NextResponse } from 'next/server';
import { ChatChannel, getChatChannelsForUser } from '@/types';
import { adminDb } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { ensureChatChannelMember, toChatChannel } from '@/lib/chat/channels';

// GET /api/portal/chat/channels — channels the VERIFIED caller can access.
// Identity comes from the Firebase ID token, never a client-supplied userId.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const { uid, role, fieldRole } = result.user;

    // Role/audience-derived channels...
    const byId = new Map<string, ChatChannel>();
    for (const channel of getChatChannelsForUser(role, fieldRole)) {
      byId.set(channel.id, channel);
    }

    // ...plus any channel this user was manually added to (extraMemberIds), even ones
    // their role wouldn't otherwise grant. This is what makes added people SEE the channel.
    if (adminDb) {
      const extraSnap = await adminDb
        .collection('chatChannels')
        .where('extraMemberIds', 'array-contains', uid)
        .get();
      for (const doc of extraSnap.docs) {
        const channel = toChatChannel(doc.id, doc.data());
        if (channel && channel.active) byId.set(channel.id, channel);
      }
    }

    const channels = Array.from(byId.values()).sort((a, b) => a.order - b.order);
    await Promise.all(channels.map((channel) => ensureChatChannelMember(channel.id, uid)));

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Error loading chat channels:', error);
    return NextResponse.json({ error: 'Failed to load chat channels' }, { status: 500 });
  }
}
