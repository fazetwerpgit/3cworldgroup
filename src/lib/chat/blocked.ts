import type { ChatReplySnippet } from '@/types';

/**
 * Whether a reply quote shows a blocked person's words. New quotes carry the
 * quoted author's uid; older ones are matched through the quoted message when
 * it is loaded (authorByMessageId), else shown as before.
 */
export function isBlockedQuote(
  replyTo: ChatReplySnippet | undefined,
  blockedUids: ReadonlySet<string> | undefined,
  authorByMessageId?: ReadonlyMap<string, string>
): boolean {
  if (!replyTo || !blockedUids || blockedUids.size === 0) return false;
  const authorId = replyTo.authorId ?? authorByMessageId?.get(replyTo.messageId);
  return !!authorId && blockedUids.has(authorId);
}

/** messageId -> authorId over a rendered list, for isBlockedQuote. */
export function authorIndex(messages: ReadonlyArray<{ id: string; authorId: string }>): Map<string, string> {
  return new Map(messages.map((message) => [message.id, message.authorId]));
}

export const BLOCKED_QUOTE_LABEL = 'Quoted message from a blocked user';
export const BLOCKED_MESSAGE_LABEL = 'Message from a blocked user';
export const BLOCKED_PINNED_LABEL = 'Pinned message from a blocked user';

/** Whether the pinned banner hides its message: written by someone the reader blocked (never your own). */
export function isBlockedPin(
  pinned: { authorId: string } | null | undefined,
  currentUserId: string | null | undefined,
  blockedUids: ReadonlySet<string> | undefined
): boolean {
  return !!pinned && pinned.authorId !== currentUserId && !!blockedUids?.has(pinned.authorId);
}

/** Whether a message renders as the collapsed "blocked user" row (never your own, not once shown). */
export function shouldCollapseBlocked(
  message: { id: string; authorId: string },
  currentUserId: string | null | undefined,
  blockedUids: ReadonlySet<string> | undefined,
  revealed: ReadonlySet<string>
): boolean {
  return message.authorId !== currentUserId && !!blockedUids?.has(message.authorId) && !revealed.has(message.id);
}
