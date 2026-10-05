import { adminDb } from '@/lib/firebase/admin';
import { isEligibleChatMember, userCanAccessChannelDoc } from '@/lib/chat/channels';
import { sendPushToTokens, type PushPayload } from '@/lib/push/sendPush';
import { ChatAttachment, resolveRoles } from '@/types';

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
// current role or a manual addition.
export function shouldPushChatRecipient(
  channelData: FirebaseFirestore.DocumentData,
  uid: string,
  userData: FirebaseFirestore.DocumentData
): boolean {
  if (!isEligibleChatMember(userData)) return false;
  const { role, fieldRole } = resolveRoles(userData.role, userData.fieldRole);
  return userCanAccessChannelDoc(channelData, { uid, role, fieldRole });
}

// Pushes a chat message to every qualifying member except the author, batch by
// batch. Best-effort: a failed batch is logged and the rest still go out.
export async function sendChatPush(
  channelData: FirebaseFirestore.DocumentData,
  authorId: string,
  payload: PushPayload
): Promise<void> {
  if (!adminDb) return;
  const db = adminDb;
  const recipients = resolveChatPushRecipients(channelData, authorId);

  for (let i = 0; i < recipients.length; i += CHAT_PUSH_BATCH_SIZE) {
    const batch = recipients.slice(i, i + CHAT_PUSH_BATCH_SIZE);
    try {
      const snaps = await db.getAll(...batch.map((uid) => db.collection('users').doc(uid)));
      await Promise.all(
        snaps.map(async (snap) => {
          const userData = snap.exists ? snap.data() : undefined;
          if (!userData || !shouldPushChatRecipient(channelData, snap.id, userData)) return;
          const tokens = Array.isArray(userData.pushTokens)
            ? userData.pushTokens.filter((t: unknown): t is string => typeof t === 'string' && !!t)
            : [];
          await sendPushToTokens(snap.id, tokens, payload);
        })
      );
    } catch (err) {
      console.error('[chat] push batch failed', err);
    }
  }
}

// Notification body: who said what, or what they posted when the message carries only
// an attachment (same Photo/GIF vocabulary buildReplySnippet uses for reply quotes).
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
    return attachment.type === 'gif' ? `${senderName} sent a GIF` : `${senderName} sent a photo`;
  }
  return `${senderName} sent a message`;
}
