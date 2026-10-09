import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { belongsInChannelDoc, toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import { memberAvatarUrl, memberName } from '@/lib/chat/memberDisplay';

// Same bound as the members route: never fan out over an unbounded member list.
const MAX_MEMBERS = 200;

interface ChannelReader {
  uid: string;
  name: string;
  avatarUrl?: string;
  readAt: string;
}

function toMillis(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    const ms = date instanceof Date ? date.getTime() : NaN;
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

// Firestore doc ids can't contain "/" and stay well under this length.
function isValidMessageId(value: string | null): value is string {
  return !!value && value.length <= 200 && !value.includes('/');
}

// GET /api/portal/chat/channels/[channelId]/reads?messageId=... — verified caller
// who can access the channel. Read receipts (users/{uid}/chatReads/{channelId})
// stay private to their owner in the rules; this route reads them with the Admin
// SDK and returns only display fields for the members whose receipt is at or
// after the message's createdAt. The message's author is never listed.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ channelId: string }> }
) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const { channelId } = await params;
    const messageId = request.nextUrl.searchParams.get('messageId');
    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    if (!isValidMessageId(messageId)) {
      return NextResponse.json({ error: 'messageId is required' }, { status: 400 });
    }
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const channelRef = adminDb.collection('chatChannels').doc(channelId);
    const snap = await channelRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    const data = snap.data() ?? {};
    const channel = toChatChannel(snap.id, data);
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!userCanAccessChannelDoc(data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messageSnap = await channelRef.collection('messages').doc(messageId).get();
    const messageData = messageSnap.exists ? messageSnap.data() ?? {} : null;
    if (!messageData || messageData.deletedAt) {
      return NextResponse.json({ error: 'Unknown message' }, { status: 404 });
    }
    const createdAtMs = toMillis(messageData.createdAt);
    const authorId = typeof messageData.authorId === 'string' ? messageData.authorId : '';
    // A message still waiting on its server timestamp can't have been read yet.
    if (createdAtMs === null) {
      return NextResponse.json({ readers: [], count: 0 });
    }

    const memberIds: string[] = Array.isArray(data.memberIds)
      ? data.memberIds.filter((id: unknown): id is string => typeof id === 'string' && !!id)
      : [];
    const candidateIds = [...new Set(memberIds)].filter((id) => id !== authorId).slice(0, MAX_MEMBERS);
    if (candidateIds.length === 0) {
      return NextResponse.json({ readers: [], count: 0 });
    }

    // Receipts first, so profile docs are fetched only for people who read it.
    const receiptRefs = candidateIds.map((id) =>
      adminDb!.collection('users').doc(id).collection('chatReads').doc(channelId)
    );
    const receipts = await adminDb.getAll(...receiptRefs);
    const readAtByUid = new Map<string, number>();
    receipts.forEach((receipt, index) => {
      if (!receipt.exists) return;
      const readAt = toMillis(receipt.data()?.lastReadAt);
      if (readAt !== null && readAt >= createdAtMs) readAtByUid.set(candidateIds[index], readAt);
    });
    if (readAtByUid.size === 0) {
      return NextResponse.json({ readers: [], count: 0 });
    }

    const readerIds = [...readAtByUid.keys()];
    const userDocs = await adminDb.getAll(...readerIds.map((id) => adminDb!.collection('users').doc(id)));
    // memberIds can lag a role/status change; list only who belongs right now.
    const channelData = { ...data, id: channel.id };
    const readers: ChannelReader[] = userDocs
      .filter((doc) => doc.exists && belongsInChannelDoc(channelData, doc.id, doc.data() ?? {}))
      .map((doc) => {
        const userData = doc.data() ?? {};
        return {
          uid: doc.id,
          name: memberName(userData),
          avatarUrl: memberAvatarUrl(userData),
          readAt: new Date(readAtByUid.get(doc.id) ?? createdAtMs).toISOString(),
        };
      })
      .sort((a, b) => a.readAt.localeCompare(b.readAt) || a.name.localeCompare(b.name));

    return NextResponse.json({ readers, count: readers.length });
  } catch (error) {
    console.error('Error loading chat read receipts:', error);
    return NextResponse.json({ error: 'Failed to load read receipts' }, { status: 500 });
  }
}
