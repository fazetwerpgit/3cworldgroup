'use client';

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, Timestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';

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
