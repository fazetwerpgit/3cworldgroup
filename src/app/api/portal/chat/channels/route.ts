import { NextRequest, NextResponse } from 'next/server';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { reconcileChatMembershipForUser } from '@/lib/chat/channels';

// GET /api/portal/chat/channels — channels the VERIFIED caller can access.
// Identity comes from the Firebase ID token, never a client-supplied userId.
// Reconciles the caller's memberIds on every channel doc first (role/audience plus
// manual extraMemberIds), so a new hire picks up custom channels created before they
// joined and a role change drops channels they no longer qualify for.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

    const channels = await reconcileChatMembershipForUser(result.user.uid);
    return NextResponse.json({ channels });
  } catch (error) {
    console.error('Error loading chat channels:', error);
    return NextResponse.json({ error: 'Failed to load chat channels' }, { status: 500 });
  }
}
