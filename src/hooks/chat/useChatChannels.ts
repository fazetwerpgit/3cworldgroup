'use client';

import { useCallback, useEffect, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { ChatChannel } from '@/types';

// lastMessageAt is server-stamped on the channel doc when a message is sent (via
// the messages POST route). Unread badges compare it against the caller's own
// read receipt. Absent on channels that have never received a message.
export type ChatChannelDoc = ChatChannel & {
  memberIds?: string[];
  lastMessageAt?: Date | null;
};

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

const NO_CHANNELS: ChatChannelDoc[] = [];

// Channels, loading and error are derived from the latest snapshot / failure
// for the signed-in uid, so a first visit shows the skeleton (not "No channels
// yet") until the first snapshot lands, and a listener failure after channels
// loaded keeps the stale list alongside the error. retry() resubscribes.
export function useChatChannels() {
  const { user, loading: authLoading } = useAuth();
  const [snap, setSnap] = useState<{ key: string; channels: ChatChannelDoc[] } | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Pending reps lack rules access to chat, so only active users subscribe.
  const uid = user?.status === 'active' ? user.uid : undefined;
  const key = uid ? `${uid}:${attempt}` : '';

  useEffect(() => {
    if (!db || !uid) return;

    const q = query(
      collection(db, 'chatChannels'),
      where('memberIds', 'array-contains', uid),
      where('active', '==', true)
    );
    const listenKey = `${uid}:${attempt}`;

    return onSnapshot(
      q,
      (snapshot) => {
        const next = snapshot.docs
          .map((doc) => {
            const data = doc.data();
            return {
              id: data.id ?? doc.id,
              name: data.name ?? doc.id,
              description: data.description ?? '',
              audience: data.audience ?? 'all',
              order: typeof data.order === 'number' ? data.order : 999,
              active: data.active !== false,
              memberIds: Array.isArray(data.memberIds) ? data.memberIds : [],
              lastMessageAt: toDate(data.lastMessageAt),
            } as ChatChannelDoc;
          })
          .sort((a, b) => a.order - b.order);

        setSnap({ key: listenKey, channels: next });
      },
      (err) => {
        console.error('Error listening to chat channels:', err);
        setFailure({ key: listenKey, message: 'Failed to load live channels' });
      }
    );
  }, [uid, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // A retry keeps showing the last list it had for this user while it resubscribes.
  const channels = uid && snap?.key.startsWith(`${uid}:`) ? snap.channels : NO_CHANNELS;
  const error = !db ? 'Firebase is not configured' : failure && failure.key === key ? failure.message : '';
  const loading = Boolean(db) && !error && (uid ? snap?.key !== key && channels.length === 0 : authLoading);

  return { channels, loading, error, retry };
}
