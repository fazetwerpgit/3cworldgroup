// The channel list's preview line: chatChannels/{id}.lastMessage, stamped by the
// messages route on send and kept honest on edit and delete (a deleted message's
// text must never linger in the list). Server-written only; channel members can
// read it through the existing channel rule.

/** Longest preview stored on the channel doc. */
export const LAST_MESSAGE_SNIPPET_MAX = 120;

export interface ChatLastMessage {
  messageId: string;
  authorId: string;
  authorName: string;
  /** One-line snippet: the text, or Photo / GIF / File for an attachment-only message. */
  text: string;
}

/**
 * One line of preview: whitespace collapsed, capped at 120 characters (with an
 * ellipsis), or the attachment's kind when the message has no text.
 */
export function lastMessageSnippet(text: unknown, attachment?: unknown): string {
  const line = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  if (line) {
    return line.length > LAST_MESSAGE_SNIPPET_MAX ? `${line.slice(0, LAST_MESSAGE_SNIPPET_MAX - 1).trimEnd()}…` : line;
  }
  if (attachment && typeof attachment === 'object') {
    const type = (attachment as { type?: unknown }).type;
    if (type === 'gif') return 'GIF';
    if (type === 'file') return 'File';
    return 'Photo';
  }
  return '';
}

/** The preview for one stored (or about-to-be-stored) message. */
export function buildLastMessage(
  messageId: string,
  data: { authorId?: unknown; authorName?: unknown; text?: unknown; attachment?: unknown }
): ChatLastMessage {
  return {
    messageId,
    authorId: typeof data.authorId === 'string' ? data.authorId : '',
    authorName: typeof data.authorName === 'string' && data.authorName ? data.authorName : '3C User',
    text: lastMessageSnippet(data.text, data.attachment),
  };
}

/** Reads a channel doc's lastMessage back; null when absent or malformed. */
export function readLastMessage(value: unknown): ChatLastMessage | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.messageId !== 'string' || !v.messageId || typeof v.text !== 'string') return null;
  return {
    messageId: v.messageId,
    authorId: typeof v.authorId === 'string' ? v.authorId : '',
    authorName: typeof v.authorName === 'string' && v.authorName ? v.authorName : '3C User',
    text: v.text,
  };
}
