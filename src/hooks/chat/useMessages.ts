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

// One stored message doc as the thread renders it. `uid` decides myReactions.
export function toChatMessageView(
  id: string,
  data: Record<string, unknown>,
  channelId: string,
  uid: string | undefined
): ChatMessageView {
  const reactions = toStringMap(data.reactions);
  return {
    id,
    channelId: typeof data.channelId === 'string' ? data.channelId : channelId,
    text: typeof data.text === 'string' ? data.text : '',
    authorId: typeof data.authorId === 'string' ? data.authorId : '',
    authorName: typeof data.authorName === 'string' ? data.authorName : '3C User',
    authorRole: typeof data.authorRole === 'string' ? data.authorRole : undefined,
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

// A failed listener is resubscribed after RETRY_BASE_MS, doubling per failure up to
// RETRY_MAX_MS. permission-denied starts slower: it rarely clears by itself.
export const RETRY_BASE_MS = 1000;
const RETRY_DENIED_BASE_MS = 5000;
export const RETRY_MAX_MS = 30000;

export function messagesRetryDelay(attempt: number, permissionDenied: boolean): number {
  const base = permissionDenied ? RETRY_DENIED_BASE_MS : RETRY_BASE_MS;
  return Math.min(RETRY_MAX_MS, base * 2 ** attempt);
}

export interface UseMessagesOptions {
  // Whether the reader is following the latest messages (at the bottom of the
  // thread). While they are, a new arrival sliding the oldest message out of
  // the live window is normal and commits as-is; the eviction guard widens the
  // window only for a reader scrolled up into history. Defaults to true.
  followingLatest?: boolean;
}

export function useMessages(channelId: string | null, { followingLatest = true }: UseMessagesOptions = {}) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  // A channel starts loading the moment it is selected; channel switches set it
  // again during render (below), never synchronously inside the effect.
  const [loading, setLoading] = useState(() => !!db && !!channelId);
  const [error, setError] = useState('');
  const [windowSize, setWindowSize] = useState(INITIAL_WINDOW);
  const [hasMore, setHasMore] = useState(false);
  // True once the window sits at MAX_WINDOW and the channel still has older
  // messages: the thread says history stops here instead of going quiet.
  const [historyCapped, setHistoryCapped] = useState(false);
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
  // Which channel the messages in state actually belong to (null until the
  // first commit). Consumers gate channel-open scrolling on this instead of
  // inspecting messages[0] — an EMPTY committed channel has no messages to
  // inspect but must still count as rendered. Deliberately NOT reset on a
  // channel switch: until the new channel's first commit, state still holds
  // the OLD channel's messages, and consumers detect that stale render by
  // renderedChannel !== channelId.
  const [renderedChannel, setRenderedChannel] = useState<string | null>(null);
  // Snapshot metadata: true while Firestore is serving this window from its
  // local view without server confirmation (offline, or reconnecting after the
  // app resumed). Drives the thread's calm "Reconnecting…" notice.
  const [fromCache, setFromCache] = useState(false);
  // Bumped to resubscribe after the listener failed (backoff timer, or the app
  // coming back online / to the foreground).
  const [retryNonce, setRetryNonce] = useState(0);
  const retryAttemptRef = useRef(0);
  // Set while the current listener has failed: whether a foreground/online
  // event may resubscribe early (not for permission-denied; see RETRY_*).
  const failedRef = useRef<{ permissionDenied: boolean } | null>(null);

  // Oldest createdAt (ms) of the RAW window (before the deletedAt filter) as of
  // the last committed snapshot. Used to detect the sliding window evicting
  // history out from under someone scrolled up (see the eviction guard below).
  // Deliberately tracks the raw floor, not the filtered one, so a soft-deleted
  // message at the old edge (which stays in the raw window) doesn't register as
  // an eviction. Reset on channel switch.
  const oldestDeliveredRef = useRef<number | null>(null);

  // Read by the snapshot callback (a ref, so a scroll in or out of history
  // never resubscribes the listener).
  const followingLatestRef = useRef(followingLatest);
  useEffect(() => {
    followingLatestRef.current = followingLatest;
  }, [followingLatest]);

  // Channel-switch state reset, done during render (React's "info from
  // previous renders" pattern) rather than in an effect, so it never causes a
  // second cascading render. The ref reset (a side effect, not render output)
  // stays in its own effect below.
  const [prevChannelId, setPrevChannelId] = useState(channelId);
  if (channelId !== prevChannelId) {
    setPrevChannelId(channelId);
    // Deselecting (null) is the one switch where "state still holds the old
    // channel" must NOT survive: the thread empties.
    if (!channelId) {
      setRenderedChannel(null);
      setMessages([]);
      setLoading(false);
    } else if (db && channelId !== renderedChannel) {
      // Only a channel switch may show the loading state. A resubscribe for
      // the SAME channel (window growth — loadOlder or the eviction guard) must
      // not: both thread UIs unmount the entire message list while loading,
      // which collapses the scroller and clamps scrollTop to 0 (the "chat jumps
      // to the top mid-typing" bug). Switching back to the channel still in
      // state (before the other one committed) doesn't blank either.
      setLoading(true);
    }
    setError('');
    setWindowSize(INITIAL_WINDOW);
    setHasMore(false);
    setHistoryCapped(false);
    setLastSnapshotWindow(0);
  }

  useEffect(() => {
    oldestDeliveredRef.current = null;
    retryAttemptRef.current = 0;
  }, [channelId]);

  useEffect(() => {
    const retryNow = () => {
      if (!failedRef.current || failedRef.current.permissionDenied) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      setRetryNonce((n) => n + 1);
    };
    window.addEventListener('online', retryNow);
    document.addEventListener('visibilitychange', retryNow);
    return () => {
      window.removeEventListener('online', retryNow);
      document.removeEventListener('visibilitychange', retryNow);
    };
  }, []);

  useEffect(() => {
    if (!db || !channelId) return;

    const q = query(
      collection(db, 'chatChannels', channelId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(windowSize)
    );

    // Metadata changes are included so the listener reports when it loses and
    // regains the server; those snapshots only move fromCache (see below).
    let committedHere = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    failedRef.current = null;
    const unsubscribe = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        setFromCache(snapshot.metadata.fromCache);
        // Metadata-only snapshot (connection dropped or came back, nothing in
        // the window changed): committing it would bump snapshotVersion and
        // churn the scroll-anchor effects for no visible change.
        if (committedHere && snapshot.docChanges().length === 0) return;
        const uid = auth?.currentUser?.uid;
        const rawDocs = snapshot.docs;
        const docs = rawDocs.filter((doc) => !doc.data().deletedAt);
        const next = docs.map((doc) => toChatMessageView(doc.id, doc.data(), channelId, uid)).reverse();

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
        // A reader following the latest messages never sees the top of the
        // window, so the slide is invisible there: commit it as-is rather than
        // resubscribing (and re-reading) a wider window on every new message.
        if (evicted && windowSize < MAX_WINDOW && !followingLatestRef.current) {
          setWindowSize((size) => Math.min(MAX_WINDOW, size + EVICTION_GROW_STEP));
          setLoading(false);
          return;
        }

        committedHere = true;
        retryAttemptRef.current = 0;
        oldestDeliveredRef.current = rawOldest ?? prevOldest;
        setRenderedChannel(channelId);
        setMessages(next);
        setHasMore(rawDocs.length >= windowSize && windowSize < MAX_WINDOW);
        setHistoryCapped(rawDocs.length >= windowSize && windowSize >= MAX_WINDOW);
        setLastSnapshotWindow(windowSize);
        setSnapshotVersion((version) => version + 1);
        setLoading(false);
        setError('');
      },
      (err) => {
        console.error('Error listening to chat messages:', err);
        setError('Failed to load live messages');
        setLoading(false);
        // A failed listener is dead; subscribe again after a backoff.
        const permissionDenied = (err as { code?: unknown }).code === 'permission-denied';
        failedRef.current = { permissionDenied };
        const delay = messagesRetryDelay(retryAttemptRef.current, permissionDenied);
        retryAttemptRef.current += 1;
        retryTimer = setTimeout(() => setRetryNonce((n) => n + 1), delay);
      }
    );
    return () => {
      clearTimeout(retryTimer);
      unsubscribe();
    };
  }, [channelId, windowSize, retryNonce]);

  // Grows the window by GROW_STEP (capped at MAX_WINDOW) so the next snapshot
  // pulls in older history. A no-op once the cap is hit or nothing more exists.
  const loadOlder = useCallback(() => {
    setWindowSize((size) => (size >= MAX_WINDOW ? size : Math.min(MAX_WINDOW, size + GROW_STEP)));
  }, []);

  return {
    messages,
    loading,
    error: db ? error : 'Firebase is not configured',
    hasMore,
    historyCapped,
    loadOlder,
    windowSize,
    snapshotVersion,
    lastSnapshotWindow,
    renderedChannel,
    fromCache,
  };
}
