'use client';

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import type { ChatAttachment, ChatReplySnippet } from '@/types';

export interface ChatMessageView {
  id: string;
  channelId: string;
  text: string;
  authorId: string;
  authorName: string;
  authorRole?: string;
  createdAt: Date | null;
  reactionCounts: Record<string, number>;
  myReactions: string[];
  // Optional media (image upload or Tenor GIF). Absent on text-only messages.
  attachment?: ChatAttachment;
  // Server-set flag mirroring attachment presence (used by media queries). Kept
  // as a defensive boolean so a malformed doc can't leak a truthy non-bool.
  hasAttachment?: boolean;
  // Server-stamped reply quote + edit marker. Absent on untouched/legacy docs.
  replyTo?: ChatReplySnippet;
  editedAt?: Date | null;
  // Pin marker (defensive boolean + when it was pinned). Absent on unpinned/legacy docs.
  isPinned?: boolean;
  pinnedAt?: Date | null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return value.toDate();
  }
  return null;
}

function toStringMap(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, uids]) => Array.isArray(uids))
      .map(([emoji, uids]) => [emoji, (uids as unknown[]).filter((uid): uid is string => typeof uid === 'string')])
  );
}

function toCountMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, count]) => typeof count === 'number' && Number.isFinite(count) && count > 0)
      .map(([emoji, count]) => [emoji, count as number])
  );
}

// Defensive parse of a stored attachment: only a well-formed image/gif with a
// string url survives; anything malformed is dropped so a bad doc can't crash
// the thread (or render a broken tile). Dimensions are kept only when finite.
function toAttachment(value: unknown): ChatAttachment | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  if ((raw.type !== 'image' && raw.type !== 'gif') || typeof raw.url !== 'string' || !raw.url) {
    return undefined;
  }
  const attachment: ChatAttachment = { type: raw.type, url: raw.url };
  if (typeof raw.width === 'number' && Number.isFinite(raw.width) && raw.width > 0) {
    attachment.width = raw.width;
  }
  if (typeof raw.height === 'number' && Number.isFinite(raw.height) && raw.height > 0) {
    attachment.height = raw.height;
  }
  if (typeof raw.contentType === 'string') attachment.contentType = raw.contentType;
  return attachment;
}

// Defensive parse of a stored reply quote: a well-formed object with a non-empty
// messageId survives; anything malformed is dropped so a bad doc can't crash the
// thread. authorName/text fall back to safe defaults.
function toReplyTo(value: unknown): ChatReplySnippet | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const messageId = typeof raw.messageId === 'string' ? raw.messageId : '';
  if (!messageId) return undefined;
  return {
    messageId,
    authorName: typeof raw.authorName === 'string' && raw.authorName ? raw.authorName : '3C User',
    text: typeof raw.text === 'string' ? raw.text : '',
  };
}

export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!db || !channelId) {
      setMessages([]);
      setLoading(false);
      setError(db ? '' : 'Firebase is not configured');
      return;
    }

    setLoading(true);
    setError('');

    const q = query(
      collection(db, 'chatChannels', channelId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(75)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const uid = auth?.currentUser?.uid;
        const next = snapshot.docs
          .filter((doc) => !doc.data().deletedAt)
          .map((doc) => {
            const data = doc.data();
            const reactions = toStringMap(data.reactions);
            return {
              id: doc.id,
              channelId: data.channelId ?? channelId,
              text: data.text ?? '',
              authorId: data.authorId ?? '',
              authorName: data.authorName ?? '3C User',
              authorRole: data.authorRole ?? undefined,
              createdAt: toDate(data.createdAt),
              reactionCounts: toCountMap(data.reactionCounts),
              myReactions: uid
                ? Object.entries(reactions)
                    .filter(([, uids]) => uids.includes(uid))
                    .map(([emoji]) => emoji)
                : [],
              attachment: toAttachment(data.attachment),
              hasAttachment: data.hasAttachment === true,
              replyTo: toReplyTo(data.replyTo),
              editedAt: toDate(data.editedAt),
              isPinned: data.isPinned === true,
              pinnedAt: toDate(data.pinnedAt),
            } satisfies ChatMessageView;
          })
          .reverse();

        setMessages(next);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to chat messages:', err);
        setError('Failed to load live messages');
        setLoading(false);
      }
    );
  }, [channelId]);

  return { messages, loading, error };
}
