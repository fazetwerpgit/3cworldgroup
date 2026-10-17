import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import { readStoredAttachment } from '@/lib/chat/media';
import {
  CHAT_REPORTS_PATH,
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  chatReportId,
  isReportReason,
  isSafeDocId,
  notifyChatModerators,
} from '@/lib/chat/moderation';

function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

// POST /api/portal/chat/messages/report — a channel member flags someone else's
// message for the back office. The report snapshots the message as it stands
// (text, attachment URL, author) so it survives an edit or a removal, and is
// stored once per reporter per message: a second tap answers success without a
// second alert. Owners, admins and operations hear about it by push and email.
export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const { channelId, messageId, reason } = body as Record<string, unknown>;
    if (!isSafeDocId(channelId) || !isSafeDocId(messageId)) {
      return NextResponse.json({ error: 'channelId and messageId are required' }, { status: 400 });
    }
    if (!isReportReason(reason)) {
      return NextResponse.json({ error: 'Choose a reason' }, { status: 400 });
    }
    const rawDetails = (body as Record<string, unknown>).details;
    if (rawDetails !== undefined && rawDetails !== null && typeof rawDetails !== 'string') {
      return NextResponse.json({ error: 'details must be text' }, { status: 400 });
    }
    const details = typeof rawDetails === 'string' ? rawDetails.trim() : '';
    if (details.length > REPORT_DETAILS_MAX) {
      return NextResponse.json({ error: `Keep the note under ${REPORT_DETAILS_MAX} characters` }, { status: 400 });
    }
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const channelRef = adminDb.collection('chatChannels').doc(channelId);
    const channelSnap = await channelRef.get();
    const channelData = channelSnap.exists ? channelSnap.data() ?? {} : null;
    const channel = channelData ? toChatChannel(channelSnap.id, channelData) : null;
    if (!channelData || !channel) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!userCanAccessChannelDoc(channelData, { uid: user.uid, role: user.role, fieldRole: user.fieldRole, demoAccount: user.demoAccount })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const messageSnap = await channelRef.collection('messages').doc(messageId).get();
    const message = messageSnap.exists ? messageSnap.data() ?? {} : null;
    if (!message || message.deletedAt) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    if (message.authorId === user.uid) {
      return NextResponse.json({ error: 'You can’t report your own message' }, { status: 400 });
    }

    const attachment = readStoredAttachment(message.attachment);
    const authorName = typeof message.authorName === 'string' && message.authorName ? message.authorName : '3C User';
    const reportRef = adminDb.collection('chatReports').doc(chatReportId(messageId, user.uid));
    try {
      await reportRef.create({
        messageId,
        channelId,
        channelName: channel.name,
        reporterUid: user.uid,
        reporterName: user.displayName,
        reason,
        details: details || null,
        messageText: typeof message.text === 'string' ? message.text : '',
        attachmentUrl: attachment?.url ?? null,
        attachmentType: attachment?.type ?? null,
        authorId: typeof message.authorId === 'string' ? message.authorId : '',
        authorName,
        messageCreatedAt: message.createdAt ?? null,
        createdAt: FieldValue.serverTimestamp(),
        status: 'open',
      });
    } catch (createError) {
      if (!isAlreadyExists(createError)) throw createError;
      return NextResponse.json({ success: true, duplicate: true });
    }

    // after(): the alert goes out once the reporter has their answer, and the
    // function stays alive until every send has been awaited.
    after(() =>
      notifyChatModerators({
        title: 'Chat message reported',
        message: `${user.displayName} reported a message from ${authorName} in ${channel.name}: ${REPORT_REASON_LABELS[reason]}.`,
        link: CHAT_REPORTS_PATH,
        actorId: user.uid,
        // The reported person never hears about it, even if they're back office.
        excludeUids: typeof message.authorId === 'string' && message.authorId ? [message.authorId] : [],
      })
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reporting chat message:', error);
    return NextResponse.json({ error: 'Failed to report message' }, { status: 500 });
  }
}
