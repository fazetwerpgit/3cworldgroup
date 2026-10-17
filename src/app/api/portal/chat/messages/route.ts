import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb, getOnboardingBucket } from '@/lib/firebase/admin';
import { ChatAttachment, ChatChannel } from '@/types';
import { getVerifiedChatUser } from '@/lib/chat/access';
import { buildChatPushBody, pushChatMessageOnce } from '@/lib/push/chatPush';
import { chatMessageDocId, isValidClientMessageId } from '@/lib/chat/outbox';
import { buildLastMessage } from '@/lib/chat/lastMessage';
import { checkChatText } from '@/lib/chat/contentFilter';
import { ensureChatChannelMember, toChatChannel, userCanAccessChannelDoc } from '@/lib/chat/channels';
import {
  attachmentSnippet,
  chatObjectPathFromUrl,
  chatObjectUrlBase,
  getChatStorageBucketName,
  readStoredAttachment,
  validateMessageAttachment,
} from '@/lib/chat/media';

// What a reply quote shows once its source message is deleted.
const DELETED_REPLY_TEXT = 'Message deleted';

// Build the server-stamped reply snippet from the SOURCE message's stored doc.
// Client-supplied snippet fields are never used: text is the source's own text
// sliced to 140 chars, or 'Photo' / 'GIF' / 'PDF: <name>' when the source was
// attachment-only.
function buildReplySnippet(
  messageId: string,
  data: FirebaseFirestore.DocumentData
): { messageId: string; authorId?: string; authorName: string; text: string } {
  const authorName =
    typeof data.authorName === 'string' && data.authorName ? data.authorName : '3C User';
  const rawText = typeof data.text === 'string' ? data.text.trim() : '';
  let text = '';
  if (rawText) {
    text = rawText.slice(0, 140);
  } else if (data.attachment && typeof data.attachment === 'object') {
    text = attachmentSnippet(data.attachment as { type?: unknown; name?: unknown }).slice(0, 140);
  }
  // authorId lets readers who blocked the quoted person collapse the quote.
  return typeof data.authorId === 'string' && data.authorId
    ? { messageId, authorId: data.authorId, authorName, text }
    : { messageId, authorName, text };
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

// The sender's own read receipt, moved to now with their send so their own
// message never lights their unread dot (a server timestamp only moves it forward).
function senderReceiptRef(uid: string, channelId: string) {
  return adminDb!.collection('users').doc(uid).collection('chatReads').doc(channelId);
}

// Raises the channel's lastMessageAt to `createdAt` unless it is already at or
// past it (and with it the sender's receipt). Never lowers it: a newer message
// may have bumped it since.
async function bumpLastMessageAt(
  channelRef: FirebaseFirestore.DocumentReference,
  createdAt: unknown,
  senderId: string,
  messageId: string,
  stored: FirebaseFirestore.DocumentData
): Promise<void> {
  if (!(createdAt instanceof Timestamp)) return;
  await adminDb!.runTransaction(async (tx) => {
    const current = (await tx.get(channelRef)).data()?.lastMessageAt;
    if (current instanceof Timestamp && current.toMillis() >= createdAt.toMillis()) return;
    tx.set(channelRef, { lastMessageAt: createdAt, lastMessage: buildLastMessage(messageId, stored) }, { merge: true });
    tx.set(senderReceiptRef(senderId, channelRef.id), { lastReadAt: FieldValue.serverTimestamp() }, { merge: true });
  });
}

// A repeat send only pushes a message stored this recently: older ones predate
// the push log (and were pushed when they were stored).
const DUPLICATE_PUSH_MAX_AGE_MS = 5 * 60 * 1000;

// After the channel's newest message is deleted, lastMessageAt falls back to the
// newest message still standing (or is cleared when the channel has none left),
// so a dot raised only by the deleted message goes away. Left alone when a newer
// message exists, or when the window holds no standing message but older ones may.
// The list preview (lastMessage) follows the same message, and is cleared
// whenever it would otherwise keep showing the deleted text.
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
    const channel = (await tx.get(channelRef)).data();
    const current = channel?.lastMessageAt;
    // The delete scrub already cleared a preview showing this message; a missing
    // preview (that, or a channel from before previews) is filled from the newest
    // standing message too.
    const previewShowsDeleted = !channel?.lastMessage || channel.lastMessage.messageId === deletedId;
    // Bumped by a later send (pre-atomic bumps trail their message by a moment).
    if (current instanceof Timestamp && current.toMillis() > deletedMs + 5000) {
      if (channel?.lastMessage?.messageId === deletedId) tx.set(channelRef, { lastMessage: FieldValue.delete() }, { merge: true });
      return;
    }
    const recent = await tx.get(
      channelRef.collection('messages').orderBy('createdAt', 'desc').limit(RECOMPUTE_WINDOW)
    );
    const newest = recent.docs.find((doc) => doc.id !== deletedId && !doc.data().deletedAt);
    const newestAt = newest?.data().createdAt;
    const preview = previewShowsDeleted
      ? { lastMessage: newest ? buildLastMessage(newest.id, newest.data()) : FieldValue.delete() }
      : {};
    if (
      (newestAt instanceof Timestamp && newestAt.toMillis() > deletedMs) ||
      (!newest && recent.docs.length >= RECOMPUTE_WINDOW)
    ) {
      if (previewShowsDeleted) tx.set(channelRef, preview, { merge: true });
      return;
    }
    tx.set(
      channelRef,
      { lastMessageAt: newestAt instanceof Timestamp ? newestAt : FieldValue.delete(), ...preview },
      { merge: true }
    );
  });
}

// An edit of the message the channel list previews rewrites the preview too.
async function refreshLastMessagePreview(
  channelRef: FirebaseFirestore.DocumentReference,
  messageId: string,
  message: FirebaseFirestore.DocumentData,
  text: string
): Promise<void> {
  await adminDb!.runTransaction(async (tx) => {
    const preview = (await tx.get(channelRef)).data()?.lastMessage;
    if (preview?.messageId !== messageId) return;
    tx.set(channelRef, { lastMessage: buildLastMessage(messageId, { ...message, text }) }, { merge: true });
  });
}

/** The 3C iOS app's WebView (user agent marker, docs/ios-app/BRIDGE.md). */
function isAppRequest(request: NextRequest): boolean {
  return /\b3CPortalApp\//.test(request.headers.get('user-agent') ?? '');
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

    // The app shows the one-time chat agreement before chat opens; a send from
    // the app without it on file is refused (the user doc is already read).
    if (user.chatTermsAccepted === false && isAppRequest(request)) {
      return NextResponse.json({ error: 'Agree to the team chat rules first.', code: 'chat_terms' }, { status: 403 });
    }

    const body = await request.json();
    const channelId = typeof body.channelId === 'string' ? body.channelId : '';
    const rawText = typeof body.text === 'string' ? body.text.trim() : '';
    const hasAttachmentInput = body.attachment !== undefined && body.attachment !== null;

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 });
    }
    // Text is optional ONLY when a (later-validated) attachment is present.
    if (!rawText && !hasAttachmentInput) {
      return NextResponse.json({ error: 'channelId and text are required' }, { status: 400 });
    }
    if (rawText.length > 1000) {
      return NextResponse.json({ error: 'Message is limited to 1000 characters' }, { status: 400 });
    }
    // Slurs are refused; severe profanity is masked (see contentFilter.ts).
    const filtered = checkChatText(rawText);
    if (!filtered.ok) return NextResponse.json({ error: filtered.error, code: 'content_filter' }, { status: 400 });
    const text = filtered.text;

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

    // The message, the channel's lastMessageAt bump (what unread badges compare
    // users/{uid}/chatReads receipts against) with its list preview, and the
    // sender's own receipt commit together, so all carry the same commit
    // timestamp and none lands alone.
    const write = adminDb!.batch();
    write.create(messageRef, messageDoc);
    write.set(
      channelRef,
      { lastMessageAt: FieldValue.serverTimestamp(), lastMessage: buildLastMessage(messageRef.id, messageDoc) },
      { merge: true }
    );
    write.set(senderReceiptRef(user.uid, channelId), { lastReadAt: FieldValue.serverTimestamp() }, { merge: true });
    try {
      await write.commit();
    } catch (createError) {
      if (!clientMessageId || !isAlreadyExists(createError)) throw createError;
      // A repeat of a stored send finishes whatever the first attempt did not:
      // the bump of a message stored before bumps were atomic, and the push of a
      // recent one (claimed in the push log, so it never goes out twice).
      const stored = await messageRef.get();
      const storedData = stored.data();
      if (storedData && !storedData.deletedAt) {
        try {
          await bumpLastMessageAt(channelRef, storedData.createdAt, user.uid, messageRef.id, storedData);
        } catch (bumpError) {
          console.error('Error bumping channel lastMessageAt:', bumpError);
        }
        const createdAt = storedData.createdAt;
        if (createdAt instanceof Timestamp && Date.now() - createdAt.toMillis() <= DUPLICATE_PUSH_MAX_AGE_MS) {
          const storedText = typeof storedData.text === 'string' ? storedData.text : '';
          const storedAttachment = readStoredAttachment(storedData.attachment) ?? undefined;
          after(() =>
            pushChatMessageOnce(channelRef, messageRef.id, found.data, user.uid, {
              ...pushPayload,
              body: buildChatPushBody(user.displayName, storedText, storedAttachment),
            })
          );
        }
      }
      return NextResponse.json({ success: true, messageId: messageRef.id, duplicate: true });
    }

    // Notify the rest of the channel: memberIds minus the author, re-checked against
    // each recipient's current role/status (sendChatPush). after() runs the sends once
    // the response is on the wire while keeping the function alive — a detached
    // promise would be killed by the serverless freeze.
    after(() =>
      pushChatMessageOnce(channelRef, messageRef.id, found.data, user.uid, {
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
    const rawText = typeof body.text === 'string' ? body.text.trim() : '';

    if (!channelId || !messageId) {
      return NextResponse.json({ error: 'channelId and messageId are required' }, { status: 400 });
    }
    // Edited text must be non-empty and within the same 1..1000 bound as new sends.
    if (!rawText || rawText.length > 1000) {
      return NextResponse.json({ error: 'Message must be 1 to 1000 characters' }, { status: 400 });
    }
    const filtered = checkChatText(rawText);
    if (!filtered.ok) return NextResponse.json({ error: filtered.error, code: 'content_filter' }, { status: 400 });
    const text = filtered.text;

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
    // Read and write in one transaction, so a delete that lands between the
    // checks and the write can't be undone by the edit.
    const outcome = await adminDb!.runTransaction(async (tx) => {
      const messageDoc = await tx.get(messageRef);
      if (!messageDoc.exists) return { status: 404 as const, error: 'Message not found' };
      const current = messageDoc.data() ?? {};
      // A deleted message can't be edited back into existence.
      if (current.deletedAt) return { status: 400 as const, error: 'Message has been deleted' };
      // Author ONLY — moderators can delete others' messages but never rewrite them.
      if (current.authorId !== user.uid) return { status: 403 as const, error: 'Forbidden' };
      tx.set(messageRef, { text: text.slice(0, 1000), editedAt: FieldValue.serverTimestamp() }, { merge: true });
      return { status: 200 as const, message: current };
    });
    if (outcome.status !== 200) {
      return NextResponse.json({ error: outcome.error }, { status: outcome.status });
    }
    const message = outcome.message;

    try {
      await refreshLastMessagePreview(
        adminDb!.collection('chatChannels').doc(channelId),
        messageId,
        message,
        text.slice(0, 1000)
      );
    } catch (previewError) {
      console.error('Error refreshing channel lastMessage:', previewError);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error editing chat message:', error);
    return NextResponse.json({ error: 'Failed to edit chat message' }, { status: 500 });
  }
}

// The Storage objects behind a deleted message's photo, or its PDF and the
// PDF's first-page preview: chat/{channelId}/{name} parsed from each download
// URL. None for a GIF or a missing attachment, and never any URL outside this
// bucket + channel folder (those are never deleted).
function deletableChatObjectPaths(attachment: unknown, channelId: string): string[] {
  if (!attachment || typeof attachment !== 'object') return [];
  const { type, url, previewUrl } = attachment as { type?: unknown; url?: unknown; previewUrl?: unknown };
  if (type !== 'image' && type !== 'file') return [];
  const bucketName = getChatStorageBucketName();
  if (!bucketName) return [];
  const urls = type === 'file' ? [url, previewUrl] : [url];
  const paths = urls
    .map((candidate) => chatObjectPathFromUrl(candidate, bucketName, channelId))
    .filter((path): path is string => !!path);
  return [...new Set(paths)];
}

// Where another message can point at a chat object: its attachment url, or a
// PDF's preview url.
const CHAT_OBJECT_URL_FIELDS = ['attachment.url', 'attachment.previewUrl'] as const;

// The error code of a failed Storage/Firestore call, for logs that must never
// carry the object's download URL or token.
function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return code === undefined ? 'unknown' : String(code);
}

// Deletes the photo of a just-deleted message from Storage, unless another
// standing message in the channel still points at the same object (the send
// path accepts any URL in the channel's folder, so one could). A missing object
// counts as deleted. Never throws: the message is already scrubbed, so a Storage
// failure is logged (ids and error code only) and the delete still succeeds.
async function deleteChatPhotoObject(
  channelId: string,
  messageId: string,
  objectPath: string
): Promise<void> {
  try {
    const bucketName = getChatStorageBucketName();
    if (!bucketName) return;
    const urlBase = chatObjectUrlBase(bucketName, objectPath);
    const messages = adminDb!.collection('chatChannels').doc(channelId).collection('messages');
    const sharing = await Promise.all(
      CHAT_OBJECT_URL_FIELDS.map((field) =>
        messages.where(field, '>=', urlBase).where(field, '<', `${urlBase}\uf8ff`).get()
      )
    );
    const stillUsed = sharing.some((snapshot) =>
      snapshot.docs.some((doc) => {
        if (doc.id === messageId) return false;
        const data = doc.data();
        if (data.deletedAt) return false;
        return deletableChatObjectPaths(data.attachment, channelId).includes(objectPath);
      })
    );
    if (stillUsed) {
      console.warn(`Chat photo kept: another message still shows it (channel ${channelId}, message ${messageId})`);
      return;
    }
    await getOnboardingBucket().file(objectPath).delete({ ignoreNotFound: true });
  } catch (error) {
    if (errorCode(error) === '404') return;
    console.error(`Error deleting chat photo (channel ${channelId}, message ${messageId}): code ${errorCode(error)}`);
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
    // The channel preview (lastMessage) is cleared in the same transaction when
    // it shows this message, so the deleted text never outlives the scrub;
    // recomputeLastMessageAt below then points it at the newest standing message.
    const channelRef = adminDb!.collection('chatChannels').doc(channelId);
    await adminDb!.runTransaction(async (tx) => {
      const channelSnap = await tx.get(channelRef);
      tx.set(
        messageRef,
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
      if (channelSnap.data()?.lastMessage?.messageId === messageId) {
        tx.set(channelRef, { lastMessage: FieldValue.delete() }, { merge: true });
      }
    });

    // The photo (or PDF and its preview) goes with the message: a tokened URL would otherwise keep it
    // reachable. Path resolved from the pre-scrub read, deleted only now that the
    // doc no longer points at it.
    for (const objectPath of deletableChatObjectPaths(message?.attachment, channelId)) {
      await deleteChatPhotoObject(channelId, messageId, objectPath);
    }

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
