'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, getCountFromServer, limit, query, Timestamp, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import type { ChatChannelDoc } from '@/hooks/chat/useChatChannels';

/** Counting stops here: the badge reads "99+" past it, so nothing past it is worth billing. */
export const UNREAD_COUNT_CAP = 100;

/** "3", "42", "99+": the channel row's unread pill. */
export function formatUnreadCount(count: number): string {
  return count >= UNREAD_COUNT_CAP ? '99+' : String(count);
}

const NO_COUNTS: Record<string, number> = {};

/**
 * Unread message counts for the channels the reader has unread, by one capped
 * count aggregation per channel (createdAt after the reader's lastReadAt, at
 * most UNREAD_COUNT_CAP). A channel is only counted while it is unread, and
 * only re-counted when its lastMessageAt or the read receipt moves, so a quiet
 * list costs nothing. The count includes deleted messages and messages from
 * people the reader blocked (the aggregation can't filter on fields the
 * message docs don't index); the row falls back to the plain dot whenever a
 * count isn't known, never a wrong zero.
 */
export function useChatUnreadCounts(
  channels: ChatChannelDoc[],
  unreadByChannel: Record<string, boolean>,
  lastReadByChannel: Record<string, Date | null>
): Record<string, number> {
  const [counts, setCounts] = useState<Record<string, { key: string; count: number }>>({});

  // One key per unread channel: it changes exactly when the count could.
  const wanted = useMemo(() => {
    const out: Array<{ id: string; key: string; after: Date | null }> = [];
    for (const channel of channels) {
      if (!unreadByChannel[channel.id]) continue;
      const after = lastReadByChannel[channel.id] ?? null;
      out.push({
        id: channel.id,
        key: `${channel.lastMessageAt?.getTime() ?? 0}:${after?.getTime() ?? 0}`,
        after,
      });
    }
    return out;
  }, [channels, unreadByChannel, lastReadByChannel]);

  useEffect(() => {
    const firestore = db;
    if (!firestore) return;
    let cancelled = false;
    for (const entry of wanted) {
      if (counts[entry.id]?.key === entry.key) continue;
      const messages = collection(firestore, 'chatChannels', entry.id, 'messages');
      const q = entry.after
        ? query(messages, where('createdAt', '>', Timestamp.fromDate(entry.after)), limit(UNREAD_COUNT_CAP))
        : query(messages, limit(UNREAD_COUNT_CAP));
      getCountFromServer(q)
        .then((snap) => {
          if (cancelled) return;
          const count = snap.data().count;
          setCounts((prev) => ({ ...prev, [entry.id]: { key: entry.key, count } }));
        })
        .catch(() => {
          // Leave it uncounted: the row keeps the dot.
        });
    }
    return () => {
      cancelled = true;
    };
    // counts is read only to skip work already done; re-running on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted]);

  return useMemo(() => {
    if (wanted.length === 0) return NO_COUNTS;
    const out: Record<string, number> = {};
    for (const entry of wanted) {
      const known = counts[entry.id];
      if (known && known.key === entry.key && known.count > 0) out[entry.id] = known.count;
    }
    return out;
  }, [wanted, counts]);
}
