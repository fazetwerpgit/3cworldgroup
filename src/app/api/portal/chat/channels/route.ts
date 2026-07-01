import { NextRequest, NextResponse } from 'next/server';
import { getChatChannelsForUser } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { ensureChatChannelMember } from '@/lib/chat/channels';

// GET /api/portal/chat/channels — channels the VERIFIED caller can access.
// Identity comes from the Firebase ID token, never a client-supplied userId.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const channels = getChatChannelsForUser(result.user.role, result.user.fieldRole);
    await Promise.all(channels.map((channel) => ensureChatChannelMember(channel.id, result.user.uid)));

    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Error loading chat channels:', error);
    return NextResponse.json({ error: 'Failed to load chat channels' }, { status: 500 });
  }
}
