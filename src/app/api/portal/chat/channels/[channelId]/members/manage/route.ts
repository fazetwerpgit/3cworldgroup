import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { canAccessChatChannel, resolveRoles } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { readExtraMemberIds, toChatChannel } from '@/lib/chat/channels';

// Manage a channel's manually-added members. PLATFORM ADMINS ONLY (client decision:
// "add people = admins only" — moderator/operations is intentionally not enough).
// POST { uid } adds, DELETE { uid } removes. Identity is always the verified token.

/** Verified caller who is a platform admin, or an error response to return. */
async function requireAdmin(request: NextRequest) {
  const result = await getVerifiedChatUser(request);
  if (!result.ok) {
    return { ok: false as const, res: NextResponse.json({ error: result.error }, { status: result.status }) };
  }
  if (result.user.role !== 'admin') {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, user: result.user };
}

function readUid(body: unknown): string {
  if (body && typeof body === 'object' && 'uid' in body) {
    const uid = (body as { uid?: unknown }).uid;
    if (typeof uid === 'string') return uid.trim();
  }
  return '';
}

// A uid is used directly as a Firestore doc id, so reject shapes that would throw inside
// the collection().doc() path (empty, contains '/', over the 128-char id limit) with a
// clean 400 instead of letting it surface as a 500.
function uidError(uid: string): string | null {
  if (!uid) return 'uid is required';
  if (uid.length > 128 || uid.includes('/')) return 'Invalid uid';
  return null;
}

// POST — add a uid to the channel's extra members. arrayUnion on BOTH extraMemberIds
// (so the addition survives sync) and memberIds (so Firestore realtime rules let them in).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.res;

    const { channelId } = await params;
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const uid = readUid(body);
    const badUid = uidError(uid);
    if (badUid) return NextResponse.json({ error: badUid }, { status: 400 });

    const ref = adminDb.collection('chatChannels').doc(channelId);
    const snap = await ref.get();
    const channel = snap.exists ? toChatChannel(snap.id, snap.data() ?? {}) : null;
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    // Adding to an archived channel is a no-op for access (the doc gate blocks inactive
    // channels for everyone) — reject explicitly rather than silently storing a dead entry.
    if (!channel.active) {
      return NextResponse.json({ error: 'Channel is archived' }, { status: 400 });
    }

    // The target must be a real, active user (matches getVerifiedChatUser's own active gate).
    const userSnap = await adminDb.collection('users').doc(uid).get();
    if (!userSnap.exists) {
      return NextResponse.json({ error: 'Unknown user' }, { status: 400 });
    }
    if ((userSnap.data() ?? {}).status !== 'active') {
      return NextResponse.json({ error: 'User is not active' }, { status: 400 });
    }

    await ref.set(
      {
        extraMemberIds: FieldValue.arrayUnion(uid),
        memberIds: FieldValue.arrayUnion(uid),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding channel member:', error);
    return NextResponse.json({ error: 'Failed to add channel member' }, { status: 500 });
  }
}

// DELETE — remove a manually-added member. Only extra members can be removed (400 for a
// non-extra/audience-derived member). Removed from extraMemberIds always; removed from
// memberIds ONLY when the user isn't independently audience-derived, so an added person
// who ALSO qualifies by role keeps their realtime access.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const admin = await requireAdmin(request);
    if (!admin.ok) return admin.res;

    const { channelId } = await params;
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const uid = readUid(body);
    const badUid = uidError(uid);
    if (badUid) return NextResponse.json({ error: badUid }, { status: 400 });

    const ref = adminDb.collection('chatChannels').doc(channelId);
    const snap = await ref.get();
    const data = snap.data() ?? {};
    const channel = snap.exists ? toChatChannel(snap.id, data) : null;
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }

    // Only manually-added members are removable. A purely audience-derived member has no
    // extras entry, so this rejects "removing a non-extra member".
    if (!readExtraMemberIds(data).includes(uid)) {
      return NextResponse.json({ error: 'Only manually added members can be removed' }, { status: 400 });
    }

    // Keep them in memberIds if they still qualify by role/audience on their own.
    let audienceDerived = false;
    const userSnap = await adminDb.collection('users').doc(uid).get();
    if (userSnap.exists) {
      const userData = userSnap.data() ?? {};
      const { role, fieldRole } = resolveRoles(userData.role, userData.fieldRole);
      audienceDerived = canAccessChatChannel(channel, role, fieldRole);
    }

    const updates: Record<string, unknown> = {
      extraMemberIds: FieldValue.arrayRemove(uid),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (!audienceDerived) {
      updates.memberIds = FieldValue.arrayRemove(uid);
    }

    await ref.set(updates, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing channel member:', error);
    return NextResponse.json({ error: 'Failed to remove channel member' }, { status: 500 });
  }
}
