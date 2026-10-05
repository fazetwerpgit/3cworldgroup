'use client';

import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase/config';
import { toChatMessageView, type ChatMessageView } from '@/hooks/chat/useMessages';

// Deleting a message unpins it; the slack only skips deleted pins from before that.
const PIN_SCAN = 5;

// The channel's most recently pinned live message, read through the
// isPinned+pinnedAt index rather than the thread's loaded window, so the banner
// keeps showing a pin however far the conversation has moved on.
export function usePinnedMessage(channelId: string | null): ChatMessageView | null {
  const [pinned, setPinned] = useState<{ channelId: string; message: ChatMessageView | null } | null>(null);

  useEffect(() => {
    if (!db || !channelId) return;
    const q = query(
      collection(db, 'chatChannels', channelId, 'messages'),
      where('isPinned', '==', true),
      orderBy('pinnedAt', 'desc'),
      limit(PIN_SCAN)
    );
    return onSnapshot(
      q,
      (snapshot) => {
        const doc = snapshot.docs.find((d) => !d.data().deletedAt);
        setPinned({
          channelId,
          message: doc ? toChatMessageView(doc.id, doc.data(), channelId, auth?.currentUser?.uid) : null,
        });
      },
      (err) => console.error('Error listening to the pinned chat message:', err)
    );
  }, [channelId]);

  return pinned && pinned.channelId === channelId ? pinned.message : null;
}
