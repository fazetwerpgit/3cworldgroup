'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

const INITIAL_WINDOW = 75;
// Exported so consumers can compute "has my loadOlder growth actually landed
// yet" (see the anchor-race guard in page.tsx / MobileThread.tsx) without
// duplicating the step size.
export const GROW_STEP = 75;
const EVICTION_GROW_STEP = 25;
// Exported alongside GROW_STEP: anchor targets must clamp to the cap, or a
// window already within GROW_STEP of the cap (reachable via +25 eviction
// growths) would wait forever for a size the query can never reach.
export const MAX_WINDOW = 600;

export function useMessages(channelId: string | null) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [windowSize, setWindowSize] = useState(INITIAL_WINDOW);
  const [hasMore, setHasMore] = useState(false);
  // Bumped once per COMMITTED snapshot (never on the eviction-guard skip path).
  // Consumers key their scroll-anchor effects on this instead of message count,
  // since a growth that doesn't change the visible count (e.g. the eviction
  // guard silently widening the window) would otherwise leave a captured anchor
  // uncleared, which then misfires on the next unrelated message.
  const [snapshotVersion, setSnapshotVersion] = useState(0);
  // The windowSize a committed snapshot was actually produced under. A UI
  // consumer that captured a scroll anchor before calling loadOlder() can
  // compare this against the window it expects (current + GROW_STEP) to tell
  // a real growth apart from an unrelated snapshot from the OLD listener that
  // fires (and bumps snapshotVersion) before the resubscribe lands — see the
  // anchor-race guard in page.tsx / MobileThread.tsx.
  const [lastSnapshotWindow, setLastSnapshotWindow] = useState(0);

  // Oldest createdAt (ms) of the RAW window (before the deletedAt filter) as of
  // the last committed snapshot. Used to detect the sliding window evicting
  // history out from under someone scrolled up (see the eviction guard below).
  // Deliberately tracks the raw floor, not the filtered one, so a soft-deleted
  // message at the old edge (which stays in the raw window) doesn't register as
  // an eviction. Reset on channel switch.
  const oldestDeliveredRef = useRef<number | null>(null);

  // Channel-switch state reset, done during render (React's "info from
  // previous renders" pattern) rather than in an effect, so it never causes a
  // second cascading render. The ref reset (a side effect, not render output)
  // stays in its own effect below.
  const [prevChannelId, setPrevChannelId] = useState(channelId);
  if (channelId !== prevChannelId) {
    setPrevChannelId(channelId);
    setWindowSize(INITIAL_WINDOW);
    setHasMore(false);
    setLastSnapshotWindow(0);
  }

  useEffect(() => {
    oldestDeliveredRef.current = null;
  }, [channelId]);

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
      limit(windowSize)
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const uid = auth?.currentUser?.uid;
        const rawDocs = snapshot.docs;
        const docs = rawDocs.filter((doc) => !doc.data().deletedAt);
        const next = docs
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

        // Raw (unfiltered) oldest doc — desc order, so the last raw doc is the
        // oldest in the window regardless of soft-deletes. Comparing THIS
        // (rather than the filtered list's oldest) means a deletion of the
        // oldest-visible message can't be mistaken for the window sliding.
        const rawOldest = rawDocs.length > 0 ? toDate(rawDocs[rawDocs.length - 1].data().createdAt)?.getTime() ?? null : null;
        const prevOldest = oldestDeliveredRef.current;
        const evicted = prevOldest !== null && rawOldest !== null && rawOldest > prevOldest;

        // The window slid and dropped messages the reader already saw. Grow the
        // window and skip committing this snapshot — the resubscribe fires a
        // fresh snapshot covering the wider range, so the reader's view never
        // visibly loses history. Repeats (growing by another step each time)
        // until the previously-delivered floor is covered, capped at MAX_WINDOW.
        if (evicted && windowSize < MAX_WINDOW) {
          setWindowSize((size) => Math.min(MAX_WINDOW, size + EVICTION_GROW_STEP));
          setLoading(false);
          return;
        }

        oldestDeliveredRef.current = rawOldest ?? prevOldest;
        setMessages(next);
        setHasMore(rawDocs.length >= windowSize && windowSize < MAX_WINDOW);
        setLastSnapshotWindow(windowSize);
        setSnapshotVersion((version) => version + 1);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to chat messages:', err);
        setError('Failed to load live messages');
        setLoading(false);
      }
    );
  }, [channelId, windowSize]);

  // Grows the window by GROW_STEP (capped at MAX_WINDOW) so the next snapshot
  // pulls in older history. A no-op once the cap is hit or nothing more exists.
  const loadOlder = useCallback(() => {
    setWindowSize((size) => (size >= MAX_WINDOW ? size : Math.min(MAX_WINDOW, size + GROW_STEP)));
  }, []);

  return { messages, loading, error, hasMore, loadOlder, windowSize, snapshotVersion, lastSnapshotWindow };
}
