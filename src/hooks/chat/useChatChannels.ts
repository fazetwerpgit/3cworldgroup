'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { ChatChannel } from '@/types';

export type ChatChannelDoc = ChatChannel & { memberIds?: string[] };

export function useChatChannels() {
  const [channels, setChannels] = useState<ChatChannelDoc[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const uid = auth?.currentUser?.uid;
    if (!db || !uid) {
      setChannels([]);
      setLoading(false);
      setError(db ? '' : 'Firebase is not configured');
      return;
    }

    setLoading(true);
    setError('');

    const q = query(
      collection(db, 'chatChannels'),
      where('memberIds', 'array-contains', uid),
      where('active', '==', true)
    );

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
            } as ChatChannelDoc;
          })
          .sort((a, b) => a.order - b.order);

        setChannels(next);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to chat channels:', err);
        setError('Failed to load live channels');
        setLoading(false);
      }
    );
  }, [auth?.currentUser?.uid]);

  return { channels, loading, error };
}
