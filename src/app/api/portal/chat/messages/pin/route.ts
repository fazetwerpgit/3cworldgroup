import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { PlatformRole, FieldRole, MANAGEMENT_FIELD_ROLES, isManagementRole } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import { readStoredAttachment } from '@/lib/chat/media';

// Who may pin/unpin: back-office management OR field managers. This is
// BROADER than canModerate (which is management only) — pinning is a
// lightweight curation act managers are trusted with, deleting others' messages is
// not. Reps are excluded. Derived from the same role facts the client mirrors.
function canPinMessages(user: { role?: PlatformRole; fieldRole?: FieldRole }): boolean {
  return (
    isManagementRole(user.role) ||
    (user.fieldRole ? MANAGEMENT_FIELD_ROLES.includes(user.fieldRole) : false)
  );
}

// Most pins we surface. Channels aren't expected to hold anywhere near this many;
// the cap just bounds the response.
const MAX_PINS = 20;

// Load the channel's raw doc + parsed view, or null when it doesn't exist / can't
// parse. The raw data carries extraMemberIds, which the access gate needs.
async function loadChannel(channelId: string) {
  if (!adminDb) throw new Error('Database not configured');
  const snap = await adminDb.collection('chatChannels').doc(channelId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const channel = toChatChannel(snap.id, data);
  if (!channel) return null;
  return { channel, data };
}

// Pinned messages straight from the isPinned+pinnedAt composite index
// (firestore.indexes.json), so a pin survives however far the channel moves on.
// Deleting a message unpins it; the slack only covers deleted pins from before that.
const PIN_QUERY_LIMIT = MAX_PINS + 10;

// POST /api/portal/chat/messages/pin — pin or unpin a message. Body:
// { channelId, messageId, pinned: boolean }. Allowed for admin/operations or
// field managers; reps 403. The message must exist and not be deleted.
export async function POST(request: NextRequest) {
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
    if (typeof body.pinned !== 'boolean') {
      return NextResponse.json({ error: 'pinned must be a boolean' }, { status: 400 });
    }
    const pinned = body.pinned;

    const found = await loadChannel(channelId);
    if (!found) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!userCanAccessChannelDoc(found.data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Access alone is not enough to pin — reps can read the channel but not curate it.
    if (!canPinMessages(user)) {
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
    const message = messageDoc.data() ?? {};
    // A deleted message can't be pinned back into visibility.
    if (message.deletedAt) {
      return NextResponse.json({ error: 'Message has been deleted' }, { status: 400 });
    }

    // Pin stamps who/when (re-pinning refreshes pinnedAt — idempotent). Unpin clears
    // all three via a merge (null wipes the fields without touching the rest of the doc).
    await messageRef.set(
      pinned
        ? { isPinned: true, pinnedAt: FieldValue.serverTimestamp(), pinnedBy: user.uid }
        : { isPinned: false, pinnedAt: null, pinnedBy: null },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error pinning chat message:', error);
    return NextResponse.json({ error: 'Failed to pin chat message' }, { status: 500 });
  }
}

// GET /api/portal/chat/messages/pin?channelId=... — the channel's pinned messages
// (newest pin first), for the channel-info Pinned section. Verified caller who can
// access the channel; no pin permission required to VIEW pins.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const channelId = request.nextUrl.searchParams.get('channelId');
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }

    const found = await loadChannel(channelId);
    if (!found) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!userCanAccessChannelDoc(found.data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messagesSnap = await adminDb!
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .where('isPinned', '==', true)
      .orderBy('pinnedAt', 'desc')
      .limit(PIN_QUERY_LIMIT)
      .get();

    const pins = messagesSnap.docs
      .filter((doc) => !doc.data().deletedAt)
      .slice(0, MAX_PINS)
      .map((doc) => {
        const data = doc.data();
        return {
          messageId: doc.id,
          text: typeof data.text === 'string' ? data.text : '',
          attachment: readStoredAttachment(data.attachment),
          authorName: data.authorName ?? '3C User',
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
          pinnedAt: data.pinnedAt?.toDate?.()?.toISOString?.() ?? null,
        };
      });

    return NextResponse.json({ pins });
  } catch (error) {
    console.error('Error loading pinned chat messages:', error);
    return NextResponse.json({ error: 'Failed to load pinned chat messages' }, { status: 500 });
  }
}
