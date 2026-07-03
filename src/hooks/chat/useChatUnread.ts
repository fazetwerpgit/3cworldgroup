'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, doc, onSnapshot, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

// The minimal shape useChatUnread needs from a channel: its id and the last time
// a message landed on it. useChatChannels' ChatChannelDoc already satisfies this.
export interface ChatUnreadChannel {
  id: string;
  lastMessageAt?: Date | null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

// PURE unread decision for one channel. A channel is unread when it has a
// last-message time AND either the reader has no read receipt or that receipt is
// older than the last message. A null/missing lastMessageAt is never unread — it
// also guards the own-send window where a freshly-stamped serverTimestamp can
// surface as null during latency compensation (don't flash your own message).
export function computeUnread(
  lastMessageAt: Date | null | undefined,
  lastReadAt: Date | null | undefined
): boolean {
  if (!lastMessageAt) return false;
  if (!lastReadAt) return true;
  return lastMessageAt.getTime() > lastReadAt.getTime();
}

// Write (or refresh) the caller's read receipt for a channel. The doc holds a
// single lastReadAt field — the firestore.rules validate exactly that shape.
// serverTimestamp keeps the clock authoritative; the reads listener below reads
// pending writes with an estimate so a just-sent receipt doesn't flash unread.
export async function markChannelRead(uid: string, channelId: string): Promise<void> {
  if (!db || !uid || !channelId) return;
  await setDoc(doc(db, 'users', uid, 'chatReads', channelId), {
    lastReadAt: serverTimestamp(),
  });
}

export interface ChatUnreadResult {
  unreadByChannel: Record<string, boolean>;
  anyUnread: boolean;
}

/**
 * Subscribes to the caller's chatReads collection and compares each channel's
 * streamed lastMessageAt against the matching read receipt. Resilient to being
 * mounted more than once (each mount is an independent subscription) and to
 * unauthenticated/loading states: it reports all-read until both a uid and a
 * settled reads snapshot exist, so channels never flash unread before their
 * receipts have loaded (or if the subscription errors).
 */
export function useChatUnread(
  channels: ChatUnreadChannel[],
  uid: string | null | undefined
): ChatUnreadResult {
  // reads is tagged with the uid it belongs to so a uid change can't briefly
  // badge with the previous user's receipts: the memo ignores reads until the
  // tag matches the current uid AND a snapshot has settled. State is written only
  // inside the snapshot callback (never synchronously in the effect body).
  const [reads, setReads] = useState<{ uid: string | null; byChannel: Record<string, Date | null> }>({
    uid: null,
    byChannel: {},
  });

  useEffect(() => {
    if (!db || !uid) return;

    const readsCol = collection(db, 'users', uid, 'chatReads');
    return onSnapshot(
      readsCol,
      (snapshot) => {
        const byChannel: Record<string, Date | null> = {};
        snapshot.docs.forEach((docSnap) => {
          // 'estimate' fills a still-pending serverTimestamp with a local guess
          // (~now) instead of null, so marking a channel read never momentarily
          // reads back as unread on the writer's own screen.
          const data = docSnap.data({ serverTimestamps: 'estimate' });
          byChannel[docSnap.id] = toDate(data.lastReadAt);
        });
        setReads({ uid, byChannel });
      },
      (err) => {
        // Fail closed: leave reads unsettled so nothing badges if receipts can't
        // load (e.g. rules not yet deployed) rather than badging everything.
        console.error('Error listening to chat read receipts:', err);
      }
    );
  }, [uid]);

  const unreadByChannel = useMemo(() => {
    const map: Record<string, boolean> = {};
    // Compute only once a settled snapshot for the CURRENT uid exists — never
    // during the load window (a missing receipt would otherwise read as unread).
    if (!uid || reads.uid !== uid) return map;
    for (const channel of channels) {
      map[channel.id] = computeUnread(channel.lastMessageAt, reads.byChannel[channel.id]);
    }
    return map;
  }, [channels, reads, uid]);

  const anyUnread = useMemo(
    () => Object.values(unreadByChannel).some(Boolean),
    [unreadByChannel]
  );

  return { unreadByChannel, anyUnread };
}
