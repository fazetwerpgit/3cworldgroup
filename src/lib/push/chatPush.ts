import { ChatAttachment } from '@/types';

// Hard bound on how many people one message may notify. Chat channels are
// company-wide, so an uncapped fan-out would turn a single send into hundreds of
// Firestore reads plus FCM round-trips hanging off one request.
export const CHAT_PUSH_MAX_RECIPIENTS = 50;

// Who gets pushed for a message posted in this channel. `data` is the RAW channel doc:
// its memberIds is already the audience roster (role-derived members plus manual
// extras, kept current by syncChatChannels), so the only filtering left is dropping
// the author and capping the fan-out.
export function resolveChatPushRecipients(
  data: FirebaseFirestore.DocumentData,
  authorId: string
): string[] {
  const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];
  const recipients = new Set<string>();
  for (const id of memberIds) {
    if (typeof id === 'string' && id && id !== authorId) recipients.add(id);
  }
  return Array.from(recipients).slice(0, CHAT_PUSH_MAX_RECIPIENTS);
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
