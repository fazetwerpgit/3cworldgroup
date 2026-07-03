import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { canAccessChatChannel } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { toChatChannel } from '@/lib/chat/channels';
import { readStoredAttachment } from '@/lib/chat/media';

// Cap the recent-media fan-out. Deleted messages are filtered in code (matching the
// messages GET), so the final list may be shorter than this.
const MAX_MEDIA = 60;

// Index-free strategy: a where(hasAttachment)+orderBy(createdAt) query needs a
// composite index; instead scan the newest messages (single-field orderBy is
// automatic) and filter for attachments in code. Gallery semantics are "recent
// photos", so media older than the scan window ages out of the gallery (it
// stays in the thread). firestore.indexes.json stages the composite index; if
// it gets deployed later this can become a direct query.
const SCAN_WINDOW = 300;

// GET /api/portal/chat/channels/[channelId]/media — verified caller who can access
// the channel. Returns the most recent media messages (newest first) for the
// channel-info Media gallery.
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
    const channel = toChatChannel(snap.id, snap.data() ?? {});
    if (!channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!canAccessChatChannel(channel, user.role, user.fieldRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messagesSnap = await adminDb
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(SCAN_WINDOW)
      .get();

    const media = messagesSnap.docs
      .filter((doc) => doc.data().hasAttachment === true && !doc.data().deletedAt)
      .map((doc) => {
        const data = doc.data();
        const attachment = readStoredAttachment(data.attachment);
        if (!attachment) return null;
        return {
          messageId: doc.id,
          attachment,
          authorName: data.authorName ?? '3C User',
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .slice(0, MAX_MEDIA);

    return NextResponse.json({ media });
  } catch (error) {
    console.error('Error loading channel media:', error);
    return NextResponse.json({ error: 'Failed to load channel media' }, { status: 500 });
  }
}
