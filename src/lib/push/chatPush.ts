import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { isEligibleChatMember, userCanAccessChannelDoc } from '@/lib/chat/channels';
import { isDemoAccount } from '@/lib/users/demoAccount';
import { sendPushToTokens, type PushPayload } from '@/lib/push/sendPush';
import { pushTargetsOf } from '@/lib/push/pushTargets';
import { ChatAttachment, resolveRoles } from '@/types';
import { attachmentSnippet } from '@/lib/chat/media';

// Recipients are handled in batches of this size (one getAll plus one round of FCM
// sends each) so a company-wide channel never fans out hundreds of sends at once,
// while every member still gets notified.
export const CHAT_PUSH_BATCH_SIZE = 50;

// Candidate recipients for a message posted in this channel. `data` is the RAW
// channel doc: its memberIds roster minus the author. memberIds can lag a role or
// status change, so each candidate is re-checked by shouldPushChatRecipient.
export function resolveChatPushRecipients(
  data: FirebaseFirestore.DocumentData,
  authorId: string
): string[] {
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
  const recipients = new Set<string>();
  for (const id of memberIds) {
    if (typeof id === 'string' && id && id !== authorId) recipients.add(id);
  }
  return Array.from(recipients);
}

// A push carries a message preview, so it goes only to an account that may chat
// today (active, or a hire mid-onboarding) and still reaches this channel by its
// current role or a manual addition. A demo sandbox channel pushes only to its
// own members (demo accounts and Jacob): isEligibleChatMember with the
// channel doc applies the sandbox rule, and userCanAccessChannelDoc re-checks it.
export function shouldPushChatRecipient(
  channelData: FirebaseFirestore.DocumentData,
  uid: string,
  userData: FirebaseFirestore.DocumentData
): boolean {
  if (!isEligibleChatMember(userData, channelData, uid)) return false;
  const { role, fieldRole } = resolveRoles(userData.role, userData.fieldRole);
  return userCanAccessChannelDoc(channelData, {
    uid,
    role,
    fieldRole,
    demoAccount: isDemoAccount(userData),
    email: typeof userData.email === 'string' ? userData.email : typeof userData.Email === 'string' ? userData.Email : null,
  });
}

// Of these recipients, the ones who blocked the author (users/{uid}/chatBlocks/
// {authorId} exists). One getAll per batch. A failed lookup is logged and
// treated as no blocks, so a Firestore hiccup never silences a whole channel.
export async function recipientsWhoBlocked(
  db: FirebaseFirestore.Firestore,
  uids: string[],
  authorId: string
): Promise<Set<string>> {
  const blocked = new Set<string>();
  if (uids.length === 0) return blocked;
  try {
    const snaps = await db.getAll(
      ...uids.map((uid) => db.collection('users').doc(uid).collection('chatBlocks').doc(authorId))
    );
    snaps.forEach((snap, index) => {
      if (snap.exists) blocked.add(uids[index]);
    });
  } catch (err) {
    console.error('[chat] block lookup failed', err);
  }
  return blocked;
}

export interface ChatPushTotals {
  recipients: number;
  sent: number;
  failed: number;
  pruned: number;
}

// Pushes a chat message to every qualifying member except the author (and
// anyone who blocked them), batch by batch. Best-effort: a failed batch is
// logged and the rest still go out. Sent with high urgency so iOS delivers it
// now rather than deferring it.
export async function sendChatPush(
  channelData: FirebaseFirestore.DocumentData,
  authorId: string,
  payload: PushPayload
): Promise<ChatPushTotals> {
  const totals: ChatPushTotals = { recipients: 0, sent: 0, failed: 0, pruned: 0 };
  if (!adminDb) return totals;
  const db = adminDb;
  const recipients = resolveChatPushRecipients(channelData, authorId);

  for (let i = 0; i < recipients.length; i += CHAT_PUSH_BATCH_SIZE) {
    const batch = recipients.slice(i, i + CHAT_PUSH_BATCH_SIZE);
    try {
      const snaps = await db.getAll(...batch.map((uid) => db.collection('users').doc(uid)));
      const eligible = snaps.filter((snap) => {
        const userData = snap.exists ? snap.data() : undefined;
        return !!userData && shouldPushChatRecipient(channelData, snap.id, userData);
      });
      // Someone who blocked the author gets no push for their messages.
      const blocked = await recipientsWhoBlocked(db, eligible.map((snap) => snap.id), authorId);
      await Promise.all(
        eligible.map(async (snap) => {
          if (blocked.has(snap.id)) return;
          const userData = snap.data() ?? {};
          const targets = pushTargetsOf(userData);
          totals.recipients += 1;
          // Web-only users get the plain token array, exactly as before the app.
          const tokens = targets.native.length ? targets : targets.web;
          const result = await sendPushToTokens(snap.id, tokens, payload, { urgency: 'high' });
          totals.sent += result.delivered;
          totals.failed += result.failed;
          totals.pruned += result.pruned;
        })
      );
    } catch (err) {
      console.error('[chat] push batch failed', err);
    }
  }
  return totals;
}

// The push for one stored message, at most once. Bookkeeping lives beside the
// message, in chatChannels/{c}/pushLog/{messageId} (server-only; writing it on the
// message would re-fire every thread listener): create() claims it before anything
// is sent, so a retried send never notifies twice, and the counts
// { recipients, sent, failed, pruned, at } land on the same doc. Logged without
// text or tokens. Returns false when the push was already claimed.
export async function pushChatMessageOnce(
  channelRef: FirebaseFirestore.DocumentReference,
  messageId: string,
  channelData: FirebaseFirestore.DocumentData,
  authorId: string,
  payload: PushPayload
): Promise<boolean> {
  const logRef = channelRef.collection('pushLog').doc(messageId);
  try {
    try {
      await logRef.create({ claimedAt: FieldValue.serverTimestamp() });
    } catch (claimError) {
      const code = (claimError as { code?: unknown } | null)?.code;
      if (code === 6 || code === 'already-exists' || code === 'ALREADY_EXISTS') return false;
      throw claimError;
    }

    const totals = await sendChatPush(channelData, authorId, payload);
    console.info('[chat] push', JSON.stringify({ channelId: channelRef.id, messageId, ...totals }));
    await logRef.set({ ...totals, at: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  } catch (err) {
    console.error('[chat] push failed', messageId, err);
    return false;
  }
}

// Notification body: who said what, or what they posted when the message carries only
// an attachment (same Photo/GIF/PDF vocabulary buildReplySnippet uses for reply quotes).
export function buildChatPushBody(
  senderName: string,
  text: string,
  attachment?: ChatAttachment
): string {
  const trimmed = text.trim();
  if (trimmed) {
    const body = trimmed.length > 120 ? `${trimmed.slice(0, 119)}…` : trimmed;
    return `${senderName}: ${body}`;
  }
  if (attachment) {
    if (attachment.type === 'gif') return `${senderName} sent a GIF`;
    if (attachment.type === 'file') return `${senderName} sent a ${attachmentSnippet(attachment)}`;
    return `${senderName} sent a photo`;
  }
  return `${senderName} sent a message`;
}
