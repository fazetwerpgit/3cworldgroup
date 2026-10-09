import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { ChatAttachment, ChatChannel } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { buildChatPushBody, pushChatMessageOnce } from '@/lib/push/chatPush';
import { chatMessageDocId, isValidClientMessageId } from '@/lib/chat/outbox';
import { ensureChatChannelMember, toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import {
  getChatStorageBucketName,
  readStoredAttachment,
  validateMessageAttachment,
} from '@/lib/chat/media';

// What a reply quote shows once its source message is deleted.
const DELETED_REPLY_TEXT = 'Message deleted';

// Build the server-stamped reply snippet from the SOURCE message's stored doc.
// Client-supplied snippet fields are never used: text is the source's own text
// sliced to 140 chars, or 'Photo' / 'GIF' when the source was attachment-only.
function buildReplySnippet(
  messageId: string,
  data: FirebaseFirestore.DocumentData
): { messageId: string; authorName: string; text: string } {
  const authorName =
    typeof data.authorName === 'string' && data.authorName ? data.authorName : '3C User';
  const rawText = typeof data.text === 'string' ? data.text.trim() : '';
  let text = '';
  if (rawText) {
    text = rawText.slice(0, 140);
  } else if (data.attachment && typeof data.attachment === 'object') {
    text = (data.attachment as { type?: unknown }).type === 'gif' ? 'GIF' : 'Photo';
  }
  return { messageId, authorName, text };
}

// Returns the channel view AND its raw doc data — the raw data carries extraMemberIds,
// which userCanAccessChannelDoc needs to honor manually-added members.
async function getFirestoreChatChannel(
  channelId: string
): Promise<{ channel: ChatChannel; data: FirebaseFirestore.DocumentData } | null> {
  if (!adminDb) throw new Error('Database not configured');
  const snap = await adminDb.collection('chatChannels').doc(channelId).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const channel = toChatChannel(snap.id, data);
  if (!channel) return null;
  return { channel, data };
}

// GET /api/portal/chat/messages?channelId=...&limit=50 — verified caller only.
export async function GET(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const channelId = request.nextUrl.searchParams.get('channelId');
    const limitParam = Number(request.nextUrl.searchParams.get('limit') ?? 50);
    const limit = Number.isFinite(limitParam)
      ? Math.max(1, Math.min(50, Math.floor(limitParam)))
      : 50;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    const found = await getFirestoreChatChannel(channelId);
    if (!found) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!userCanAccessChannelDoc(found.data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await ensureChatChannelMember(channelId, user.uid);

    const snapshot = await adminDb!
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .orderBy('createdAt', 'desc')
      .limit(limit + 25)
      .get();

    const messages = snapshot.docs
      .filter((doc) => !doc.data().deletedAt)
      .map((doc) => {
        const data = doc.data();
        const attachment = readStoredAttachment(data.attachment);
        const replyTo =
          data.replyTo && typeof data.replyTo === 'object'
            ? {
                messageId: String((data.replyTo as { messageId?: unknown }).messageId ?? ''),
                authorName: String((data.replyTo as { authorName?: unknown }).authorName ?? '3C User'),
                text: String((data.replyTo as { text?: unknown }).text ?? ''),
              }
            : null;
        return {
          id: doc.id,
          channelId,
          text: data.text ?? '',
          authorId: data.authorId,
          authorName: data.authorName ?? '3C User',
          authorRole: data.authorRole,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
          // Only present on media messages; omitted otherwise so legacy docs are byte-identical.
          ...(attachment ? { attachment, hasAttachment: true } : {}),
          // Reply quote + edit marker only when set; legacy docs stay byte-identical.
          ...(replyTo && replyTo.messageId ? { replyTo } : {}),
          ...(data.editedAt ? { editedAt: data.editedAt?.toDate?.()?.toISOString?.() ?? null } : {}),
        };
      })
      .slice(0, limit)
      .reverse();

    return NextResponse.json({ messages });
  } catch (error) {
    console.error('Error loading chat messages:', error);
    return NextResponse.json({ error: 'Failed to load chat messages' }, { status: 500 });
  }
}

// Raises the channel's lastMessageAt to `createdAt` unless it is already at or
// past it. Never lowers it: a newer message may have bumped it since.
async function bumpLastMessageAt(
  channelRef: FirebaseFirestore.DocumentReference,
  createdAt: unknown
): Promise<void> {
  if (!(createdAt instanceof Timestamp)) return;
  await adminDb!.runTransaction(async (tx) => {
    const current = (await tx.get(channelRef)).data()?.lastMessageAt;
    if (current instanceof Timestamp && current.toMillis() >= createdAt.toMillis()) return;
    tx.set(channelRef, { lastMessageAt: createdAt }, { merge: true });
  });
}

// After the channel's newest message is deleted, lastMessageAt falls back to the
// newest message still standing (or is cleared when none is), so a dot raised only
// by the deleted message goes away. Left alone when a newer message exists.
// Runs in a transaction so a send landing meanwhile is never undercut.
const RECOMPUTE_WINDOW = 25;
async function recomputeLastMessageAt(
  channelRef: FirebaseFirestore.DocumentReference,
  deletedId: string,
  deletedCreatedAt: unknown
): Promise<void> {
  if (!(deletedCreatedAt instanceof Timestamp)) return;
  const deletedMs = deletedCreatedAt.toMillis();
  await adminDb!.runTransaction(async (tx) => {
    const current = (await tx.get(channelRef)).data()?.lastMessageAt;
    // Bumped by a later send (pre-atomic bumps trail their message by a moment).
    if (current instanceof Timestamp && current.toMillis() > deletedMs + 5000) return;
    const recent = await tx.get(
      channelRef.collection('messages').orderBy('createdAt', 'desc').limit(RECOMPUTE_WINDOW)
    );
    const newest = recent.docs.find((doc) => doc.id !== deletedId && !doc.data().deletedAt);
    const newestAt = newest?.data().createdAt;
    if (newestAt instanceof Timestamp && newestAt.toMillis() > deletedMs) return;
    tx.set(
      channelRef,
      { lastMessageAt: newestAt instanceof Timestamp ? newestAt : FieldValue.delete() },
      { merge: true }
    );
  });
}

// POST — send a message as the VERIFIED caller. Author identity is stamped server-side.
// Admin SDK create() on an existing doc rejects with gRPC ALREADY_EXISTS (6).
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS';
}

export async function POST(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const body = await request.json();
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';
    const hasAttachmentInput = body.attachment !== undefined && body.attachment !== null;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    // Text is optional ONLY when a (later-validated) attachment is present.
    if (!text && !hasAttachmentInput) {
      return NextResponse.json({ error: 'channelId and text are required' }, { status: 400 });
    }
    if (text.length > 1000) {
      return NextResponse.json({ error: 'Message is limited to 1000 characters' }, { status: 400 });
    }

    const found = await getFirestoreChatChannel(channelId);
    if (!found) {
      return NextResponse.json({ error: 'Unknown chat channel' }, { status: 404 });
    }
    if (!userCanAccessChannelDoc(found.data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Validate the attachment shape/origin server-side (post-access, pre-write). A
    // present-but-invalid attachment is rejected, never silently dropped.
    let attachment: ChatAttachment | undefined;
    if (hasAttachmentInput) {
      const bucketName = getChatStorageBucketName();
      if (!bucketName) {
        return NextResponse.json({ error: 'Storage is not configured' }, { status: 500 });
      }
      const validated = validateMessageAttachment(body.attachment, channelId, bucketName);
      if (!validated.ok) {
        return NextResponse.json({ error: validated.error }, { status: 400 });
      }
      attachment = validated.attachment;
    }

    // Optional reply target — must be a live (non-deleted) message in THIS channel.
    // The snippet is resolved server-side from the source doc; any client-supplied
    // reply snippet is ignored entirely.
    let replyTo: { messageId: string; authorName: string; text: string } | undefined;
    const replyToMessageId =
      typeof body.replyToMessageId === 'string' ? body.replyToMessageId : '';
    if (replyToMessageId) {
      const sourceSnap = await adminDb!
        .collection('chatChannels')
        .doc(channelId)
        .collection('messages')
        .doc(replyToMessageId)
        .get();
      if (!sourceSnap.exists) {
        return NextResponse.json({ error: 'Reply target not found' }, { status: 400 });
      }
      const sourceData = sourceSnap.data() ?? {};
      if (sourceData.deletedAt) {
        return NextResponse.json({ error: 'Reply target not found' }, { status: 400 });
      }
      replyTo = buildReplySnippet(replyToMessageId, sourceData);
    }

    await ensureChatChannelMember(channelId, user.uid);

    const channelRef = adminDb!.collection('chatChannels').doc(channelId);
    const messageDoc = {
      channelId,
      text: text.slice(0, 1000),
      authorId: user.uid,
      authorName: user.displayName,
      authorRole: user.effectiveRole ?? null,
      createdAt: FieldValue.serverTimestamp(),
      deletedAt: null,
      // hasAttachment lets Firestore query media messages; both set iff valid attachment.
      ...(attachment ? { attachment, hasAttachment: true } : {}),
      // Reply quote only when a valid source resolved.
      ...(replyTo ? { replyTo } : {}),
    };

    // Idempotent send: a client key becomes the doc id (scoped to the author), and
    // create() refuses to overwrite. A retry after a lost response, or a queued
    // message re-sent after the app was killed, lands on the same doc and is
    // answered as a success without a second message.
    const clientMessageId = isValidClientMessageId(body.clientMessageId) ? body.clientMessageId : '';
    const messages = channelRef.collection('messages');
    const messageRef = clientMessageId ? messages.doc(chatMessageDocId(user.uid, clientMessageId)) : messages.doc();
    const pushPayload = {
      title: found.channel.name,
      // Tapping the notification opens this channel, not just the chat tab.
      url: `/portal/chat?channel=${encodeURIComponent(channelId)}`,
    };

    // The message and the channel's lastMessageAt bump (what unread badges compare
    // users/{uid}/chatReads receipts against) commit together, so both carry the
    // same commit timestamp and neither lands without the other.
    const write = adminDb!.batch();
    write.create(messageRef, messageDoc);
    write.set(channelRef, { lastMessageAt: FieldValue.serverTimestamp() }, { merge: true });
    try {
      await write.commit();
    } catch (createError) {
      if (!clientMessageId || !isAlreadyExists(createError)) throw createError;
      // A repeat of a stored send finishes whatever the first attempt did not:
      // the bump of a message stored before bumps were atomic, and the push
      // (claimed on the message, so it never goes out twice).
      const stored = await messageRef.get();
      const storedData = stored.data();
      if (storedData && !storedData.deletedAt) {
        try {
          await bumpLastMessageAt(channelRef, storedData.createdAt);
        } catch (bumpError) {
          console.error('Error bumping channel lastMessageAt:', bumpError);
        }
        const storedText = typeof storedData.text === 'string' ? storedData.text : '';
        const storedAttachment = readStoredAttachment(storedData.attachment) ?? undefined;
        after(() =>
          pushChatMessageOnce(messageRef, found.data, user.uid, {
            ...pushPayload,
            body: buildChatPushBody(user.displayName, storedText, storedAttachment),
          })
        );
      }
      return NextResponse.json({ success: true, messageId: messageRef.id, duplicate: true });
    }

    // Notify the rest of the channel: memberIds minus the author, re-checked against
    // each recipient's current role/status (sendChatPush). after() runs the sends once
    // the response is on the wire while keeping the function alive — a detached
    // promise would be killed by the serverless freeze.
    after(() =>
      pushChatMessageOnce(messageRef, found.data, user.uid, {
        ...pushPayload,
        body: buildChatPushBody(user.displayName, text, attachment),
      })
    );

    return NextResponse.json({ success: true, messageId: messageRef.id });
  } catch (error) {
    console.error('Error sending chat message:', error);
    return NextResponse.json({ error: 'Failed to send chat message' }, { status: 500 });
  }
}

// PATCH — edit the text of your OWN message. Author only: even moderators cannot
// edit someone else's message (they can delete via DELETE, but not rewrite). Only
// text + editedAt change; attachment / replyTo / reactions are left untouched.
export async function PATCH(request: NextRequest) {
  try {
    const result = await getVerifiedChatUser(request);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    const user = result.user;

    const body = await request.json();
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    const text = typeof body.text === 'string' ? body.text.trim() : '';

    if (!channelId || !messageId) {
      return NextResponse.json({ error: 'channelId and messageId are required' }, { status: 400 });
    }
    // Edited text must be non-empty and within the same 1..1000 bound as new sends.
    if (!text || text.length > 1000) {
      return NextResponse.json({ error: 'Message must be 1 to 1000 characters' }, { status: 400 });
    }

    const found = await getFirestoreChatChannel(channelId);
    if (
      !found ||
      !userCanAccessChannelDoc(found.data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })
    ) {
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
    // A deleted message can't be edited back into existence.
    if (message.deletedAt) {
      return NextResponse.json({ error: 'Message has been deleted' }, { status: 400 });
    }
    // Author ONLY — moderators can delete others' messages but never rewrite them.
    if (message.authorId !== user.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await messageRef.set(
      { text: text.slice(0, 1000), editedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error editing chat message:', error);
    return NextResponse.json({ error: 'Failed to edit chat message' }, { status: 500 });
  }
}

// DELETE — author (self) or a moderator (admin/operations) can soft-delete.
export async function DELETE(request: NextRequest) {
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

    const found = await getFirestoreChatChannel(channelId);
    if (!found || !userCanAccessChannelDoc(found.data, { uid: user.uid, role: user.role, fieldRole: user.fieldRole })) {
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
    const message = messageDoc.data();
    // Only the original author or a moderator may delete.
    if (message?.authorId !== user.uid && !user.canModerate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Soft-delete scrubs the content too: channel members can still read the doc
    // through the Firestore rules, and a pin would keep surfacing it.
    await messageRef.set(
      {
        deletedAt: FieldValue.serverTimestamp(),
        deletedBy: user.uid,
        text: '',
        attachment: FieldValue.delete(),
        hasAttachment: FieldValue.delete(),
        isPinned: false,
        pinnedAt: null,
        pinnedBy: null,
      },
      { merge: true }
    );

    try {
      await recomputeLastMessageAt(adminDb!.collection('chatChannels').doc(channelId), messageId, message?.createdAt);
    } catch (recomputeError) {
      console.error('Error recomputing channel lastMessageAt:', recomputeError);
    }

    // Replies copied the deleted text into their quote at send time; replace it.
    const quoting = await adminDb!
      .collection('chatChannels')
      .doc(channelId)
      .collection('messages')
      .where('replyTo.messageId', '==', messageId)
      .get();
    for (let i = 0; i < quoting.docs.length; i += 400) {
      const batch = adminDb!.batch();
      for (const doc of quoting.docs.slice(i, i + 400)) {
        batch.update(doc.ref, { 'replyTo.text': DELETED_REPLY_TEXT });
      }
      await batch.commit();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting chat message:', error);
    return NextResponse.json({ error: 'Failed to delete chat message' }, { status: 500 });
  }
}
