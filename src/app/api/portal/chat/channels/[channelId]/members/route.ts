import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { canAccessChatChannel, getEffectiveRole, resolveRoles, RoleDisplayNames } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { toChatChannel } from '@/lib/chat/channels';

// Never resolve an unbounded member list — cap the fan-out of user reads.
const MAX_MEMBERS = 200;

interface ChannelMember {
  uid: string;
  name: string;
  role: string;
}

/** displayName, else the local-part of the email, else a neutral fallback. */
function memberName(data: FirebaseFirestore.DocumentData): string {
  const displayName = typeof data.displayName === 'string' ? data.displayName.trim() : '';
  if (displayName) return displayName;
  const email = typeof data.email === 'string' ? data.email : '';
  const localPart = email.split('@')[0]?.trim();
  return localPart || '3C User';
}

/** The display-relevant role label (e.g. "L1 Manager"), or empty when unknown. */
function memberRole(data: FirebaseFirestore.DocumentData): string {
  const { role, fieldRole } = resolveRoles(data.role, data.fieldRole);
  const effectiveRole = getEffectiveRole({ role, fieldRole });
  return effectiveRole ? RoleDisplayNames[effectiveRole] : '';
}

// GET /api/portal/chat/channels/[channelId]/members — verified caller who can
// access the channel. Returns display-only member rows (no emails/PII).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const { channelId } = await params;
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const snap = await adminDb.collection('chatChannels').doc(channelId).get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    const data = snap.data() ?? {};
    const channel = toChatChannel(snap.id, data);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const memberIds: string[] = Array.isArray(data.memberIds)
      ? data.memberIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
      : [];
    const boundedIds = memberIds.slice(0, MAX_MEMBERS);

    let members: ChannelMember[] = [];
    if (boundedIds.length > 0) {
      const refs = boundedIds.map((id) => adminDb!.collection('users').doc(id));
      const docs = await adminDb.getAll(...refs);
      members = docs
        .filter((doc) => doc.exists)
        .map((doc) => {
          const userData = doc.data() ?? {};
          return { uid: doc.id, name: memberName(userData), role: memberRole(userData) };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
    }

    return NextResponse.json({ members, memberCount: members.length });
  } catch (error) {
    console.error('Error loading chat channel members:', error);
    return NextResponse.json({ error: 'Failed to load channel members' }, { status: 500 });
  }
}
