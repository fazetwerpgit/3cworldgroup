'use client';

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { AlertCircle, ArrowDown, Check, Clock, Hash, ImagePlus, Lock, Pin, RotateCw, Send, ShieldAlert, Users, X } from 'lucide-react';
import { ChannelInfoSheet } from '@/components/chat/ChannelInfoSheet';
import { ChatLightbox } from '@/components/chat/ChatLightbox';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { GifPicker } from '@/components/chat/GifPicker';
import type { GifResult } from '@/components/chat/GifPicker';
import { prepareImageForUpload, uploadChatImageWithProgress, validateSelectedImage } from '@/components/chat/attachmentUpload';
import { ChatAvatar } from '@/components/chat/ChatAvatar';
import { CompanyTape } from '@/components/chat/CompanyTape';
import { ConnectionNotice } from '@/components/chat/ConnectionNotice';
import { MessageActions } from '@/components/chat/MessageActions';
import { ChannelRows, MobileChannelList } from '@/components/chat/MobileChannelList';
import { clockTime, pendingStatusLabel, type CompanyStats } from '@/components/chat/chatFormat';
import c from '@/components/chat/chat.module.css';
import s from '@/components/portal/rep/rep.module.css';
import { MobileThread } from '@/components/chat/MobileThread';
import { isAbortError } from '@/lib/fetch/isAbortError';
import type { ThreadMessage } from '@/components/chat/MobileThread';
import { ReactionBar } from '@/components/chat/ReactionBar';
import { useAuth } from '@/contexts/AuthContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread, markChannelRead } from '@/hooks/chat/useChatUnread';
import { useConnectionNotice } from '@/hooks/chat/useConnectionNotice';
import { GROW_STEP, MAX_WINDOW, useMessages } from '@/hooks/chat/useMessages';
import { getAuthorColor, isDeveloperAuthor } from '@/lib/chat/authorColor';
import {
  SendRequestError,
  chatMessageDocId,
  autoRetryExpired,
  classifySendError,
  decideAfterFailure,
  newClientMessageId,
  outboxKey,
  parseOutbox,
  reconcileEchoes,
  toOutboxEntries,
} from '@/lib/chat/outbox';
import { countNewArrivals, newestDeliveredId } from '@/lib/chat/unseen';
import { auth } from '@/lib/firebase/config';
import { isOnboardingUser } from '@/lib/auth/onboardingAccess';
import { ChatAttachment, ChatReplySnippet, getEffectiveRole } from '@/types';

function getLocalDayKey(createdAt: Date | null) {
  const date = createdAt ?? new Date();
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function isSameLocalDay(first: Date, second: Date) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function formatChatLineDayDivider(createdAt: Date | null) {
  const date = createdAt ?? new Date();
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  if (isSameLocalDay(date, today)) return 'Today';
  if (isSameLocalDay(date, yesterday)) return `Yesterday · ${dateLabel}`;
  return dateLabel;
}

// A message POST on bad signal can hang for a minute before the browser gives
// up; abort sooner and let the retry policy take over (the send is idempotent,
// so an abort after the server stored it can't duplicate it).
const SEND_TIMEOUT_MS = 20_000;
const COMPANY_STATS_STALE_MS = 5 * 60_000;

// Runs one network step of a send; its rejection (fetch failing, a timeout
// abort, the ID-token refresh failing offline) becomes a retryable network
// failure. Everything else thrown on the send path stays permanent.
async function networkStep<T>(step: () => Promise<T>): Promise<T> {
  try {
    return await step();
  } catch (error) {
    if (error instanceof SendRequestError) throw error;
    throw new SendRequestError('Message not sent. Check your connection.', { kind: 'network' });
  }
}

// Probe the GIF feature at most once per browser session (shared across mounts):
// the proxy answers { enabled } based on whether a Tenor key is configured. The
// GIF button never renders until this resolves true.
let gifEnabledProbe: Promise<boolean> | null = null;

/**
 * A message's image/GIF rendered inside a desktop card. Shows the local preview
 * with an upload shimmer while a pending image echo is still uploading (not
 * clickable then); a delivered image/GIF opens the lightbox on click. Renders
 * nothing for text-only messages.
 */
function DesktopAttachment({
  message,
  eager,
  onOpen,
}: {
  message: ThreadMessage;
  eager: boolean;
  onOpen: () => void;
}) {
  const previewUrl = message.localPreviewUrl;
  const src = previewUrl ?? message.attachment?.url;
  if (!src) return null;
  // A local preview means the echo hasn't reconciled yet: not clickable, and
  // shimmering only while the upload is in flight (not once it has failed).
  const isPendingLocal = !!previewUrl && !!message.pendingState;
  const isUploading = !!previewUrl && message.pendingState === 'sending';
  const isFailed = message.pendingState === 'failed';
  // Reserve the tile's box from known dimensions (upload/Tenor dims on delivered
  // messages, prepared dims on pending image echoes) so the navy skeleton is
  // visible while loading and the image decode causes no layout shift — which
  // would otherwise nudge the scroll anchor past the pin margin.
  const width = message.attachment?.width ?? message.localPreviewWidth;
  const height = message.attachment?.height ?? message.localPreviewHeight;
  const aspectStyle = width && height ? { aspectRatio: `${width} / ${height}` } : undefined;
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={isPendingLocal}
      aria-label="Open image"
      data-attachment-type={message.attachment?.type ?? 'image'}
      className={`${c.attachment} ${isFailed ? c.attachmentFailed : ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={message.text || 'Shared image'}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        style={aspectStyle}
      />
      {isUploading && <span className={c.uploading} />}
      {isUploading && typeof message.uploadProgress === 'number' && (
        <span className={c.progress} aria-hidden="true">
          <span style={{ transform: `scaleX(${message.uploadProgress})` }} />
        </span>
      )}
    </button>
  );
}

export default function TeamChatPage() {
  const { user, hasPermission, isRole } = useAuth();
  const onboardingUser = isOnboardingUser(user);
  const [activeChannelId, setActiveChannelId] = useState('');
  // Channel-info Sheet (shared by desktop header title + mobile thread top bar).
  const [infoOpen, setInfoOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  // Reply/edit composer modes (shared by both layouts — the composer state lives
  // here so mobile and desktop stay in lockstep). replyTarget quotes a message on
  // the next send; editTarget rewrites an existing own message. Mutually exclusive.
  const [replyTarget, setReplyTarget] = useState<ThreadMessage | null>(null);
  const [editTarget, setEditTarget] = useState<ThreadMessage | null>(null);
  // Optimistic edits: messageId → the new text + local editedAt, applied over the
  // realtime feed until the snapshot confirms the change (see displayMessages).
  const [pendingEdits, setPendingEdits] = useState<Record<string, { text: string; editedAt: Date }>>({});
  // Mirror of editTarget for the channel-switch reset effect (which must not re-run
  // every time an edit is staged, so it can't depend on editTarget directly).
  const editTargetRef = useRef<ThreadMessage | null>(null);
  useEffect(() => {
    editTargetRef.current = editTarget;
  }, [editTarget]);
  // Media UI: GIF feature availability (probed), full-screen image viewer, and
  // the desktop composer's staged image + GIF-picker visibility. (Mobile owns
  // its own copies of these inside MobileThread.)
  const [gifEnabled, setGifEnabled] = useState(false);
  const [lightbox, setLightbox] = useState<LightboxImage | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState('');
  const [gifOpen, setGifOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Optimistic local echoes: shown instantly on send, dropped once the matching
  // real message arrives over the realtime listener (see reconciliation below).
  const [pendingMessages, setPendingMessages] = useState<ThreadMessage[]>([]);
  // Bumped on every own action (send/retry) so both scrollers force to bottom.
  const [scrollToBottomSignal, setScrollToBottomSignal] = useState(0);
  // Phone-only two-screen state: channel list vs. full-screen conversation.
  // Desktop (lg+) ignores this entirely and always shows the side-by-side panel.
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const mobileMessagesEndRef = useRef<HTMLDivElement | null>(null);
  // Desktop scroller + jump-to-latest state (mobile owns its own inside MobileThread).
  const desktopScrollRef = useRef<HTMLDivElement | null>(null);
  const [desktopPinned, setDesktopPinned] = useState(true);
  const desktopPinnedRef = useRef(true);
  const [desktopNewCount, setDesktopNewCount] = useState(0);
  const [desktopPrevLen, setDesktopPrevLen] = useState(0);
  // The previous render's newest delivered message id (see countNewArrivals).
  const [desktopPrevNewestId, setDesktopPrevNewestId] = useState<string | undefined>(undefined);
  const [desktopPrevChannel, setDesktopPrevChannel] = useState('');
  const desktopSignalRef = useRef(0);

  const { channels, loading: loadingChannels, error: channelsError, retry: retryChannels } = useChatChannels();
  const {
    messages,
    loading: loadingMessages,
    error: messagesError,
    hasMore: hasMoreMessages,
    loadOlder: loadOlderMessages,
    windowSize: messagesWindowSize,
    snapshotVersion,
    lastSnapshotWindow,
    renderedChannel,
    fromCache: messagesFromCache,
  } = useMessages(activeChannelId || null);

  // Desktop "load older" trigger: scrolling near the top of the scroller grows
  // the window (see useMessages). desktopOlderPendingRef guards against
  // spamming loadOlder while a growth is already in flight; desktopAnchorRef
  // captures the pre-growth scroll geometry so the prepend can be anchored
  // (Safari doesn't do this natively via overflow-anchor). minWindow records
  // the windowSize this growth needs to have landed under — see the layout
  // effect below, which won't consume the anchor until a snapshot actually
  // came from a query with at least that limit (guards against the OLD
  // listener firing one more unrelated snapshot between loadOlder() and the
  // resubscribe, which would otherwise consume+clear the anchor early and
  // leave the real prepend unanchored).
  const desktopOlderPendingRef = useRef(false);
  const desktopAnchorRef = useRef<{ scrollHeight: number; scrollTop: number; minWindow: number } | null>(null);

  // Tracks the topmost rendered message so a snapshot that PREPENDS history
  // (the eviction guard grows the window on every new incoming message once
  // it's full) can hold the reader's view steady. Safari has no native scroll
  // anchoring (overflow-anchor), so without this the view visibly shifts up by
  // the height of the prepended block. viewportOffset is refreshed from
  // handleDesktopScroll so the correction lands where the reader actually is.
  const desktopFirstMsgRef = useRef<{ id: string; node: HTMLElement; viewportOffset: number } | null>(null);

  // Channel switch abandons any in-flight growth: the new channel restarts at
  // the initial window, so a leftover anchor's minWindow could never be met
  // and the stuck pending flag would silently disable load-older everywhere
  // (the desktop pane persists across rail switches, unlike MobileThread).
  useEffect(() => {
    desktopOlderPendingRef.current = false;
    desktopAnchorRef.current = null;
    desktopFirstMsgRef.current = null;
  }, [activeChannelId]);

  const handleDesktopScroll = useCallback(() => {
    const el = desktopScrollRef.current;
    // Scroll events during a channel-switch loading phase are clamp noise from
    // the skeleton content (scrollTop 0) — acting on them arms a phantom
    // load-older against the incoming channel.
    if (!el || loadingMessages) return;
    const first = desktopFirstMsgRef.current;
    if (first?.node.isConnected) first.viewportOffset = first.node.offsetTop - el.scrollTop;
    if (!hasMoreMessages || desktopOlderPendingRef.current) return;
    if (el.scrollTop > 200) return;
    desktopAnchorRef.current = {
      scrollHeight: el.scrollHeight,
      scrollTop: el.scrollTop,
      minWindow: Math.min(messagesWindowSize + GROW_STEP, MAX_WINDOW),
    };
    desktopOlderPendingRef.current = true;
    loadOlderMessages();
  }, [hasMoreMessages, loadingMessages, loadOlderMessages, messagesWindowSize]);

  // Runs before paint after every COMMITTED snapshot (keyed on snapshotVersion,
  // not message count — a growth that leaves the count unchanged still bumps
  // this, so a pending anchor/pending-flag never leaks past one render and
  // misfires on a later, unrelated message). If a load-older growth is
  // pending, restore the reader's visual anchor (never when pinned to bottom —
  // that path belongs to the auto-scroll effect below, not this one).
  useLayoutEffect(() => {
    const el = desktopScrollRef.current;
    if (!el) return;
    // `.chat-line-messages` has scroll-behavior: smooth (globals.css), which
    // would animate a plain scrollTop assignment — visibly glide instead of
    // snapping, and while animating scrollTop briefly reads <200 and re-fires
    // handleDesktopScroll. Toggle to 'auto' for the instant jump, then restore.
    const setScrollTopInstant = (value: number) => {
      const previousBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollTop = value;
      el.style.scrollBehavior = previousBehavior;
    };
    const remeasureFirst = () => {
      const node = el.querySelector('[data-mid]');
      desktopFirstMsgRef.current =
        node instanceof HTMLElement
          ? { id: node.getAttribute('data-mid') ?? '', node, viewportOffset: node.offsetTop - el.scrollTop }
          : null;
    };
    const anchor = desktopAnchorRef.current;
    if (anchor) {
      // The snapshot that just committed may still be from the OLD (pre-growth)
      // listener — don't consume the anchor until one lands from a query whose
      // limit actually covers the requested growth.
      if (lastSnapshotWindow < anchor.minWindow) {
        remeasureFirst();
        return;
      }
      desktopAnchorRef.current = null;
      desktopOlderPendingRef.current = false;
      if (!desktopPinnedRef.current) {
        setScrollTopInstant(anchor.scrollTop + (el.scrollHeight - anchor.scrollHeight));
      }
      remeasureFirst();
      return;
    }
    // No load-older in flight: this snapshot came from the live listener or an
    // eviction growth. If history got spliced in ABOVE the previous topmost
    // message (the tracked node is no longer topmost), put that message back
    // at the exact viewport position the reader last saw it at, before paint.
    // The assignment is absolute, so it's also a no-op on browsers whose
    // native scroll anchoring already corrected. Guards: never while pinned
    // (the bottom belongs to the auto-scroll effect, and viewportOffset can be
    // one queued scroll event stale right after a programmatic jump), and
    // never on pure appends (they don't move existing content).
    const first = desktopFirstMsgRef.current;
    if (!desktopPinnedRef.current && first?.node.isConnected && el.querySelector('[data-mid]') !== first.node) {
      const target = first.node.offsetTop - first.viewportOffset;
      if (Math.abs(target - el.scrollTop) > 1) setScrollTopInstant(target);
    }
    remeasureFirst();
  }, [snapshotVersion, lastSnapshotWindow]);

  const activeChannel = useMemo(
    () => channels.find((channel) => channel.id === activeChannelId),
    [activeChannelId, channels]
  );
  const canModerate = hasPermission('chat:moderate');
  // Pinning is broader than moderation: admin/operations OR field managers,
  // mirroring the pin route's server check. Reps can't pin. isRole matches either
  // the platform role or the field role (see AuthContext.isRole).
  const canPin = isRole(
    'admin',
    'operations',
    'l1_manager',
    'l2_manager',
    'ibo_level_1',
    'ibo_level_2',
    'ibo_level_3',
    'ibo_level_4',
    'regional_manager',
    'director'
  );
  // Channel-listener failures show in the channel list itself (rail / phone
  // list: "Chat's offline · Retry"), so they aren't repeated here.
  const shownError = error || messagesError;

  // Unread badges: compare each channel's streamed lastMessageAt against this
  // user's own read receipts. All-read until reads settle (see the hook).
  const { unreadByChannel } = useChatUnread(channels, user?.uid);

  // Whether the desktop (>=1024px, the D shell's breakpoint) layout is the one on screen. Both layouts render in
  // the DOM (CSS toggles them), so mark-read needs the breakpoint to know which
  // channel is actually being viewed: desktop always shows its active channel,
  // while mobile only "opens" a channel in the thread view.
  const [isLgUp, setIsLgUp] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsLgUp(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // The channel currently visible to this reader (empty when none is open): the
  // active channel on desktop, or the active channel only while the mobile thread
  // is open. Mark-read keys off this so the auto-selected channel on the mobile
  // list screen isn't silently marked read.
  const viewingChannelId =
    activeChannelId && (isLgUp || mobileView === 'thread') ? activeChannelId : '';

  // Newest delivered message time in the open channel — re-runs the mark-read
  // effect when a message arrives while viewing (own sends included, which is how
  // your own send never badges your channel).
  const latestMessageAt =
    messages.length > 0 ? messages[messages.length - 1].createdAt?.getTime() ?? 0 : 0;

  // Mark the open channel read on open, and again as new messages arrive while
  // viewing — throttled to ~2s so a burst doesn't hammer writes (a trailing write
  // captures the final state). Switching channels marks immediately.
  const markReadRef = useRef<{ channelId: string; at: number }>({ channelId: '', at: 0 });
  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !viewingChannelId) return;
    const now = Date.now();
    const last = markReadRef.current;
    const isNewChannel = last.channelId !== viewingChannelId;
    if (isNewChannel || now - last.at >= 2000) {
      markReadRef.current = { channelId: viewingChannelId, at: now };
      void markChannelRead(uid, viewingChannelId);
      return;
    }
    // Within the throttle window: schedule one trailing write so the last message
    // in a burst is still acknowledged.
    const timer = setTimeout(() => {
      markReadRef.current = { channelId: viewingChannelId, at: Date.now() };
      void markChannelRead(uid, viewingChannelId);
    }, 2000 - (now - last.at));
    return () => clearTimeout(timer);
  }, [viewingChannelId, latestMessageAt, user?.uid]);

  // Merged render list: real messages first, then this channel's un-reconciled
  // echoes (in send order). Reconciliation happens HERE, synchronously, so the
  // rendered list can never contain both an echo and its delivered real message
  // in the same frame (an effect would reconcile only after paint → one-frame
  // duplicate). Matching is by doc id: an echo's id is the id the server derives
  // from its clientMessageId, so the delivered message takes over the same React
  // key, identical texts never cross-match, and a "failed" echo whose POST did
  // land (response lost) still resolves when its message shows up.
  const deliveredIds = useMemo(() => new Set(messages.map((message) => message.id)), [messages]);
  const windowFloorMs = hasMoreMessages ? messages[0]?.createdAt?.getTime() ?? null : null;
  const threadMessages = useMemo<ThreadMessage[]>(() => {
    const { unreconciled } = reconcileEchoes(deliveredIds, pendingMessages, activeChannelId, windowFloorMs);
    return [...messages, ...unreconciled];
  }, [messages, deliveredIds, pendingMessages, activeChannelId, windowFloorMs]);

  // State hygiene only: drop reconciled echoes from state so pendingMessages
  // doesn't grow without bound (and the outbox forgets them). Render
  // correctness is already guaranteed by the synchronous filter above.
  useEffect(() => {
    setPendingMessages((prev) => {
      if (prev.length === 0) return prev;
      const { reconciledIds } = reconcileEchoes(deliveredIds, prev, activeChannelId, windowFloorMs);
      if (reconciledIds.length === 0) return prev;
      const done = new Set(reconciledIds);
      return prev.filter((echo) => !done.has(echo.id));
    });
  }, [deliveredIds, activeChannelId, windowFloorMs]);

  // Render list with optimistic edits layered on top of the reconciled thread. The
  // reconcile memo above is left untouched (edits never change the message count, so
  // all scroll/pill machinery keeps reading threadMessages.length); only the
  // rendered text/editedAt are overridden here until the realtime snapshot confirms.
  const displayMessages = useMemo<ThreadMessage[]>(() => {
    if (Object.keys(pendingEdits).length === 0) return threadMessages;
    return threadMessages.map((message) => {
      const edit = pendingEdits[message.id];
      return edit ? { ...message, text: edit.text, editedAt: edit.editedAt } : message;
    });
  }, [threadMessages, pendingEdits]);

  // Drop an optimistic edit once the realtime message confirms it (editedAt present
  // and the stored text matches what we saved) so the override can't get stuck.
  useEffect(() => {
    setPendingEdits((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      let changed = false;
      const next = { ...prev };
      for (const id of ids) {
        const real = messages.find((message) => message.id === id);
        if (real && real.editedAt && real.text === prev[id].text) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [messages]);

  // Switching channels abandons any staged reply/edit: a staged reply carries the
  // previous channel's replyToMessageId (server 400s, and Retry would re-post the
  // same stale id forever), and a staged edit would PATCH the wrong channel. Clear
  // both; only the edit case (draft = another message's text) clears the composer —
  // a plain in-progress draft is preserved. pendingEdits stays (keyed by doc id).
  useEffect(() => {
    setReplyTarget(null);
    if (editTargetRef.current) setDraft('');
    setEditTarget(null);
  }, [activeChannelId]);

  // All chat calls carry a verified Firebase ID token; the server derives identity
  // from it (never a client-supplied userId).
  const authedFetch = useCallback(async (url: string, init?: RequestInit) => {
    const token = await auth?.currentUser?.getIdToken();
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}` },
    });
  }, []);

  // Company sales tape (All Company channel only): fetched on mount, not per
  // channel switch — the numbers don't depend on which channel is active, only
  // whether the tape renders does — and again when the app resumes after a few
  // minutes away. Stays null (tape hidden) on any fetch/parse error so it never
  // shows fabricated numbers.
  const [companyStats, setCompanyStats] = useState<CompanyStats | null>(null);

  useEffect(() => {
    // Wait for the signed-in user: on first mount auth?.currentUser is still
    // null, so an immediate fetch would carry an empty Bearer token and 401,
    // and (fetching only once) the tape would never appear.
    if (!user || onboardingUser) return;
    let cancelled = false;
    let fetchedAt = 0;
    const load = () => {
      fetchedAt = Date.now();
      authedFetch('/api/portal/sales/company-stats')
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('company-stats fetch failed'))))
        .then((json) => {
          if (!cancelled) setCompanyStats(json);
        })
        .catch(() => {
          if (!cancelled) setCompanyStats(null);
        });
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - fetchedAt > COMPANY_STATS_STALE_MS) load();
    };
    load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [authedFetch, onboardingUser, user]);

  // Cheap bootstrap call: keeps server-side membership current for this caller, then
  // Firestore rules allow the realtime channel/message listeners to read member docs.
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    let mounted = true;
    authedFetch('/api/portal/chat/channels', { signal: controller.signal }).catch((err) => {
      if (!mounted || isAbortError(err, controller.signal)) return;
      console.error('Error bootstrapping chat channels:', err);
    });
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authedFetch, user]);

  // Author photo lookup for the message list: messages themselves carry no
  // avatarUrl (Firestore doc is unchanged), so we resolve photos from each
  // channel's member list (already-visible data — same population whose
  // names are shown on every message). Merged across channels rather than reset,
  // so switching channels never flashes photos back to initials for a uid we've
  // already resolved.
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string>>({});
  // Resolved head-count per channel (active accounts only). The channel doc's
  // raw memberIds array can hold deleted/deactivated uids, so it over-counts;
  // whenever the members endpoint has answered for a channel, its count wins.
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  // Keyed by the id set (not the channels array identity) so channel-doc updates
  // from message traffic don't refetch member lists on every new message.
  const channelIdsKey = channels.map((channel) => channel.id).join(',');
  useEffect(() => {
    if (!user || !channelIdsKey) return;
    const controller = new AbortController();
    let mounted = true;
    for (const channelId of channelIdsKey.split(',')) {
      authedFetch(`/api/portal/chat/channels/${channelId}/members`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((json) => {
          if (!mounted || !Array.isArray(json.members)) return;
          setMemberCounts((prev) => ({ ...prev, [channelId]: json.members.length }));
          const found: Record<string, string> = {};
          for (const member of json.members) {
            if (member && typeof member.uid === 'string' && typeof member.avatarUrl === 'string' && member.avatarUrl) {
              found[member.uid] = member.avatarUrl;
            }
          }
          if (Object.keys(found).length > 0) {
            setAuthorAvatars((prev) => ({ ...prev, ...found }));
          }
        })
        .catch((err) => {
          if (!mounted || isAbortError(err, controller.signal)) return;
          console.error('Error loading channel member photos:', err);
        });
    }
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authedFetch, user, channelIdsKey]);

  // Probe the GIF feature once per session so we only render the GIF button when
  // a Tenor key is configured server-side (proxy returns { enabled: false }
  // otherwise). The module-level promise dedupes across mounts.
  useEffect(() => {
    if (!user) return;
    let active = true;
    if (!gifEnabledProbe) {
      gifEnabledProbe = authedFetch('/api/portal/chat/gifs?q=')
        .then((res) => res.json())
        .then((json) => !!json.enabled)
        .catch(() => false);
    }
    gifEnabledProbe.then((enabled) => {
      if (active) setGifEnabled(enabled);
    });
    return () => {
      active = false;
    };
  }, [authedFetch, user]);

  // Revoke object URLs for image echoes once they're gone from pendingMessages
  // (reconciled or discarded) so uploading previews don't leak. A ref tracks the
  // URLs we've handed out; anything no longer live gets released.
  const trackedPreviewUrls = useRef<Set<string>>(new Set());
  useEffect(() => {
    const live = new Set(
      pendingMessages.map((echo) => echo.localPreviewUrl).filter((url): url is string => !!url)
    );
    for (const url of trackedPreviewUrls.current) {
      if (!live.has(url)) {
        URL.revokeObjectURL(url);
        trackedPreviewUrls.current.delete(url);
      }
    }
    for (const url of live) trackedPreviewUrls.current.add(url);
  }, [pendingMessages]);
  useEffect(() => {
    const tracked = trackedPreviewUrls.current;
    return () => {
      for (const url of tracked) URL.revokeObjectURL(url);
    };
  }, []);

  // Release a staged (not-yet-sent) desktop image preview when it's cleared or
  // swapped so the file picker never leaks its object URL either.
  useEffect(() => {
    if (!attachPreview) return;
    return () => URL.revokeObjectURL(attachPreview);
  }, [attachPreview]);

  // A chat push opens /portal/chat?channel=<id>: land in that channel (the
  // thread screen on phones). An id the user can't see falls back to the first
  // channel via the effect below.
  useEffect(() => {
    const linkedChannel = new URLSearchParams(window.location.search).get('channel');
    if (!linkedChannel) return;
    setActiveChannelId(linkedChannel);
    setMobileView('thread');
  }, []);

  // Keep ?channel= naming the thread actually on screen (none while the phone
  // channel list shows). The service worker reads it to silence a push only
  // for the channel being read, not for every chat page.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get('channel') ?? '') === viewingChannelId) return;
    if (viewingChannelId) params.set('channel', viewingChannelId);
    else params.delete('channel');
    const rest = params.toString();
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${rest ? `?${rest}` : ''}${window.location.hash}`
    );
  }, [viewingChannelId]);

  useEffect(() => {
    if (!activeChannelId && channels.length > 0) {
      setActiveChannelId(channels[0].id);
      return;
    }
    if (activeChannelId && channels.length > 0 && !channels.some((channel) => channel.id === activeChannelId)) {
      setActiveChannelId(channels[0].id);
    }
  }, [activeChannelId, channels]);

  // Adjust the unseen counter during render (React's "info from previous
  // renders" pattern) so we never setState synchronously inside an effect.
  const desktopNewestId = newestDeliveredId(threadMessages);
  if (activeChannelId !== desktopPrevChannel) {
    setDesktopPrevChannel(activeChannelId);
    setDesktopPrevLen(threadMessages.length);
    setDesktopPrevNewestId(desktopNewestId);
    setDesktopNewCount(0);
  } else if (threadMessages.length !== desktopPrevLen || desktopNewestId !== desktopPrevNewestId) {
    setDesktopPrevLen(threadMessages.length);
    setDesktopPrevNewestId(desktopNewestId);
    // Delivered messages from others after the previous newest delivered one
    // (see countNewArrivals): history prepends and own sends never count.
    const grew = countNewArrivals(threadMessages, desktopPrevNewestId, user?.uid);
    if (grew > 0 && !desktopPinned) setDesktopNewCount((count) => count + grew);
  }

  // Desktop pinned detection: the bottom anchor is "intersecting" while the
  // reader is within ~150px of the bottom (rootMargin extends the scroller).
  useEffect(() => {
    const anchor = messagesEndRef.current;
    const root = desktopScrollRef.current;
    if (!anchor || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        desktopPinnedRef.current = entry.isIntersecting;
        setDesktopPinned(entry.isIntersecting);
        if (entry.isIntersecting) setDesktopNewCount(0);
      },
      { root, rootMargin: '0px 0px 150px 0px', threshold: 0 }
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, []);

  // True only when the rendered list is THIS channel's committed content
  // (renderedChannel comes from useMessages; an empty committed channel counts
  // — messages[0] inspection would not cover it). The auto-scroll effect must
  // not consume its "opening" jump before then: it also fires on the loading
  // render and on the channel-switch render that still shows the OLD channel's
  // messages (useMessages keeps them in state; loading only flips true a
  // render later). Consuming "opening" early hands the real first paint to the
  // pinned SMOOTH path — an animated crawl from scrollTop 0 that sweeps the
  // <=200px zone and arms a bogus load-older mid-flight.
  const renderedChannelMatches = !loadingMessages && renderedChannel === activeChannelId;

  // "Reconnecting…" / offline chip for both layouts (delayed so a quick resume
  // never flashes it).
  const { notice: connectionNotice } = useConnectionNotice(messagesFromCache, renderedChannelMatches);

  // Desktop smart auto-scroll (mobile owns its own inside MobileThread). Pure
  // DOM sync (no setState): opening/switching a channel jumps instantly to the
  // bottom; an own send/retry (signal bump) always smooth-scrolls; otherwise a
  // new message only scrolls when the reader is already pinned.
  const scrollContextRef = useRef('');
  useEffect(() => {
    const anchor = messagesEndRef.current;
    if (!anchor || !renderedChannelMatches) return;
    const opening = scrollContextRef.current !== activeChannelId;
    const forced = desktopSignalRef.current !== scrollToBottomSignal;
    scrollContextRef.current = activeChannelId;
    desktopSignalRef.current = scrollToBottomSignal;
    if (opening) {
      // 'instant', not 'auto': the scroller has scroll-behavior: smooth, and
      // 'auto' defers to it — the "jump" then animates up from scrollTop 0,
      // sweeping through the <=200px zone where handleDesktopScroll arms a
      // bogus load-older that interrupts the landing mid-history.
      anchor.scrollIntoView({ behavior: 'instant', block: 'end' });
    } else if (forced || desktopPinnedRef.current) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [threadMessages.length, renderedChannelMatches, activeChannelId, scrollToBottomSignal]);

  const jumpToLatestDesktop = () => {
    setDesktopPinned(true);
    setDesktopNewCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  // Live mirror of pendingMessages for retry timers and lifecycle listeners,
  // which must act on the latest echo (cached upload, attempt count) rather than
  // the copy captured when they were scheduled.
  const pendingRef = useRef<ThreadMessage[]>([]);
  useEffect(() => {
    pendingRef.current = pendingMessages;
  }, [pendingMessages]);
  const inFlightRef = useRef<Set<string>>(new Set());
  const retryTimersRef = useRef<Map<string, number>>(new Map());
  const clearRetryTimer = useCallback((echoId: string) => {
    const timer = retryTimersRef.current.get(echoId);
    if (timer !== undefined) window.clearTimeout(timer);
    retryTimersRef.current.delete(echoId);
  }, []);
  // Unmounted (left the chat mid-send): an attempt still in flight must not
  // schedule a retry through this dead instance.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    const timers = retryTimersRef.current;
    return () => {
      mountedRef.current = false;
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
    };
  }, []);
  const updateEcho = useCallback((echoId: string, patch: Partial<ThreadMessage>) => {
    setPendingMessages((prev) => prev.map((p) => (p.id === echoId ? { ...p, ...patch } : p)));
  }, []);
  const postMessageRef = useRef<(echo: ThreadMessage) => Promise<void>>(async () => undefined);

  // POSTs an echo. The echo stays "Sending…" through transient failures: it is
  // retried with backoff while online, or as soon as the connection returns
  // (see flushOutbox), and only a permanent error or an exhausted/stale retry
  // run marks it 'failed' ("Not sent · Tap to retry"). The POST carries the
  // echo's clientMessageId, so no retry can post twice. On success the echo
  // stays put until the realtime feed delivers the real message and
  // reconciliation drops it — no flicker. Attachment echoes take the SAME path
  // as text: an image echo first prepares its photo once (cached so a retry
  // never re-reads the picked file) and uploads it with progress (the result is
  // cached so a message-POST retry won't re-upload); a GIF echo already carries
  // its Tenor attachment.
  const postMessage = useCallback(
    async (echo: ThreadMessage) => {
      if (inFlightRef.current.has(echo.id)) return;
      inFlightRef.current.add(echo.id);
      clearRetryTimer(echo.id);
      const attempts = (echo.sendAttempts ?? 0) + 1;
      setError('');
      try {
        let attachment: ChatAttachment | undefined =
          echo.uploadedAttachment ?? (echo.attachment?.type === 'gif' ? echo.attachment : undefined);
        if (echo.pendingFile && !attachment) {
          let prepared = echo.preparedUpload;
          if (!prepared) {
            prepared = await prepareImageForUpload(echo.pendingFile);
            const ready = prepared;
            // Publish prepared dimensions before the (slower) upload so the pending
            // tile reserves its box immediately and its decode causes no shift.
            updateEcho(echo.id, {
              preparedUpload: ready,
              ...(ready.width && ready.height ? { localPreviewWidth: ready.width, localPreviewHeight: ready.height } : {}),
            });
          }
          const idToken = await networkStep(async () => (await auth?.currentUser?.getIdToken()) ?? '');
          let shownStep = -1;
          attachment = await uploadChatImageWithProgress(
            idToken,
            echo.channelId,
            prepared.file,
            prepared.width,
            prepared.height,
            (fraction) => {
              // Every progress update re-renders the page: step in 5% increments.
              const step = Math.floor(fraction * 20);
              if (step === shownStep) return;
              shownStep = step;
              updateEcho(echo.id, { uploadProgress: fraction });
            }
          );
          updateEcho(echo.id, { uploadedAttachment: attachment, uploadProgress: 1 });
        }
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
        let response: Response;
        try {
          response = await networkStep(() => authedFetch('/api/portal/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              channelId: echo.channelId,
              text: echo.text,
              ...(echo.clientMessageId ? { clientMessageId: echo.clientMessageId } : {}),
              ...(attachment ? { attachment } : {}),
              // Reply rides the same send path; the server re-stamps the snippet.
              ...(echo.replyToMessageId ? { replyToMessageId: echo.replyToMessageId } : {}),
            }),
          }));
        } finally {
          window.clearTimeout(timeout);
        }
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new SendRequestError(json.error || 'Failed to send message', { kind: 'http', status: response.status });
        }
        if (json.duplicate === true) {
          // Stored by an earlier attempt whose response was lost: the message is
          // already in the feed (possibly older than the loaded window, where
          // reconciliation can't see it), so the echo is done.
          setPendingMessages((prev) => prev.filter((p) => p.id !== echo.id));
          return;
        }
        updateEcho(echo.id, {
          deliveredId: typeof json.messageId === 'string' ? json.messageId : echo.id,
          sendAttempts: 0,
        });
      } catch (err) {
        const failure = classifySendError(err);
        const windowStart = echo.retryWindowStart ?? echo.createdAt?.getTime() ?? Date.now();
        const decision = failure
          ? decideAfterFailure({
              failure,
              attempts,
              ageMs: Date.now() - windowStart,
              online: navigator.onLine !== false,
            })
          : ({ action: 'fail' } as const);
        if (decision.action === 'fail') {
          setError(err instanceof Error && err.name !== 'AbortError' ? err.message : 'Failed to send message');
          updateEcho(echo.id, { pendingState: 'failed', sendAttempts: 0, uploadProgress: undefined });
        } else {
          // Still "Sending…": retried on a timer, or by flushOutbox when the
          // connection comes back. Waiting on 'online' doesn't use up an attempt.
          updateEcho(echo.id, {
            sendAttempts: decision.action === 'retry' ? attempts : attempts - 1,
            uploadProgress: undefined,
          });
          if (decision.action === 'retry' && mountedRef.current) {
            const timer = window.setTimeout(() => {
              retryTimersRef.current.delete(echo.id);
              const latest = pendingRef.current.find((p) => p.id === echo.id);
              if (latest?.pendingState === 'sending' && !latest.deliveredId) void postMessageRef.current(latest);
            }, decision.delayMs);
            retryTimersRef.current.set(echo.id, timer);
          }
        }
      } finally {
        inFlightRef.current.delete(echo.id);
      }
    },
    [authedFetch, clearRetryTimer, updateEcho]
  );
  useEffect(() => {
    postMessageRef.current = postMessage;
  }, [postMessage]);

  // Sends every queued echo now (skipping ones in flight or already delivered)
  // instead of waiting out a backoff timer: on 'online', when the app returns
  // to the foreground, and after the outbox is restored on load.
  const flushOutbox = useCallback(() => {
    if (navigator.onLine === false) return;
    const now = Date.now();
    for (const echo of pendingRef.current) {
      if (echo.pendingState !== 'sending' || echo.deliveredId || inFlightRef.current.has(echo.id)) continue;
      // Waited for the connection past the auto-retry window: the user decides.
      const windowStart = echo.retryWindowStart ?? echo.createdAt?.getTime() ?? now;
      if (autoRetryExpired(windowStart, now)) {
        clearRetryTimer(echo.id);
        updateEcho(echo.id, { pendingState: 'failed', sendAttempts: 0, uploadProgress: undefined });
        continue;
      }
      void postMessageRef.current(echo);
    }
  }, [clearRetryTimer, updateEcho]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') flushOutbox();
    };
    window.addEventListener('online', flushOutbox);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', flushOutbox);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flushOutbox]);

  // Outbox persistence: unsent echoes survive a reload or the app being killed.
  // Restored once per signed-in user (during render, so the restored echoes are
  // in the very first thread paint); rows past the auto-retry age come back as
  // "Not sent", the rest resume sending. Photos still waiting on their upload
  // aren't persisted (the picked file can't go in localStorage).
  const [outboxUid, setOutboxUid] = useState<string | null>(null);
  if (user?.uid && outboxUid !== user.uid) {
    setOutboxUid(user.uid);
    let raw: string | null = null;
    try {
      raw = window.localStorage.getItem(outboxKey(user.uid));
    } catch {
      // Storage blocked (private mode): nothing to restore.
    }
    const restored: ThreadMessage[] = parseOutbox(raw, user.uid, Date.now()).map((entry) => ({
      id: entry.id,
      clientMessageId: entry.clientMessageId,
      channelId: entry.channelId,
      text: entry.text,
      authorId: entry.authorId,
      authorName: entry.authorName,
      authorRole: entry.authorRole,
      createdAt: new Date(entry.createdAt),
      reactionCounts: {},
      myReactions: [],
      attachment: entry.attachment,
      uploadedAttachment: entry.attachment?.type === 'image' ? entry.attachment : undefined,
      replyTo: entry.replyTo,
      replyToMessageId: entry.replyToMessageId,
      pendingState: entry.failed ? 'failed' : 'sending',
    }));
    if (restored.length > 0) {
      const restoredIds = new Set(restored.map((echo) => echo.id));
      setPendingMessages((prev) => [...prev.filter((echo) => !restoredIds.has(echo.id)), ...restored]);
    }
  }
  useEffect(() => {
    if (outboxUid) flushOutbox();
  }, [outboxUid, flushOutbox]);
  useEffect(() => {
    if (!outboxUid || outboxUid !== user?.uid) return;
    const entries = toOutboxEntries(pendingMessages);
    try {
      if (entries.length > 0) window.localStorage.setItem(outboxKey(outboxUid), JSON.stringify(entries));
      else window.localStorage.removeItem(outboxKey(outboxUid));
    } catch {
      // Storage full or blocked: the queue still works for this session.
    }
  }, [pendingMessages, outboxUid, user?.uid]);

  // A locally-built reply quote for an optimistic echo (author + snippet), mirroring
  // the server's rule: text sliced to 140, or Photo/GIF for an attachment-only source.
  // The server re-stamps authoritative values on the delivered message.
  const makeReplySnippet = (message: ThreadMessage): ChatReplySnippet => {
    const trimmed = message.text?.trim();
    if (trimmed) return { messageId: message.id, authorName: message.authorName, text: trimmed.slice(0, 140) };
    const kind = message.attachment ? (message.attachment.type === 'gif' ? 'GIF' : 'Photo') : '';
    return { messageId: message.id, authorName: message.authorName, text: kind };
  };

  // Reply fields for the next echo — empty unless a reply is staged. Cleared by the
  // caller after building the echo.
  const stagedReplyFields = () =>
    replyTarget
      ? { replyTo: makeReplySnippet(replyTarget), replyToMessageId: replyTarget.id }
      : {};

  const sendMessage = () => {
    if (!user || !activeChannelId || !draft.trim()) return;
    // Local echo appears instantly; the composer clears so typing never waits
    // on the network.
    const echo: ThreadMessage = {
      ...makeEchoBase(),
      text: draft.trim(),
      ...stagedReplyFields(),
    };
    setPendingMessages((prev) => [...prev, echo]);
    setDraft('');
    setReplyTarget(null);
    setScrollToBottomSignal((tick) => tick + 1);
    void postMessage(echo);
  };

  // Base fields shared by every optimistic echo this user creates. The echo's id
  // is the doc id the server will store it under (derived from the fresh
  // clientMessageId), which is what reconciliation matches on.
  function makeEchoBase() {
    const clientMessageId = newClientMessageId();
    return {
      id: chatMessageDocId(user!.uid, clientMessageId),
      clientMessageId,
      channelId: activeChannelId,
      authorId: user!.uid,
      authorName: user!.displayName,
      authorRole: getEffectiveRole(user!) ?? undefined,
      createdAt: new Date(),
      reactionCounts: {},
      myReactions: [],
      pendingState: 'sending' as const,
    };
  }

  // Optimistic image send: shows a local preview immediately, then uploads +
  // posts through postMessage (the same reconcile path as text). `caption` is the
  // current composer text (may be empty). Client-side type/size pre-check mirrors
  // the server; failures surface via the existing failed-send retry/discard UI.
  const sendImage = (file: File, caption: string) => {
    if (!user || !activeChannelId) return;
    const validationError = validateSelectedImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    const previewUrl = URL.createObjectURL(file);
    const echo: ThreadMessage = {
      ...makeEchoBase(),
      text: caption.trim(),
      localPreviewUrl: previewUrl,
      pendingFile: file,
      ...stagedReplyFields(),
    };
    setPendingMessages((prev) => [...prev, echo]);
    setDraft('');
    setReplyTarget(null);
    setScrollToBottomSignal((tick) => tick + 1);
    void postMessage(echo);
  };

  // Optimistic GIF send: fires immediately as an attachment-only message (empty
  // text). The Tenor URL renders straight away — no upload step.
  const sendGif = (gif: GifResult) => {
    if (!user || !activeChannelId) return;
    const attachment: ChatAttachment = { type: 'gif', url: gif.url };
    if (typeof gif.width === 'number') attachment.width = gif.width;
    if (typeof gif.height === 'number') attachment.height = gif.height;
    const echo: ThreadMessage = {
      ...makeEchoBase(),
      text: '',
      attachment,
    };
    setPendingMessages((prev) => [...prev, echo]);
    // A GIF fires immediately and never carries a quote; drop any staged reply so the
    // bar doesn't linger over an unrelated instant send.
    setReplyTarget(null);
    setScrollToBottomSignal((tick) => tick + 1);
    void postMessage(echo);
  };

  // Desktop composer: stage a picked file (with a friendly pre-check) so the
  // preview chip can show before the user hits Send.
  const onDesktopFilePicked = (file: File | undefined) => {
    if (!file) return;
    const validationError = validateSelectedImage(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setAttachFile(file);
    setAttachPreview(URL.createObjectURL(file));
  };

  const clearDesktopAttachment = () => {
    setAttachFile(null);
    setAttachPreview('');
  };

  // Desktop Send: an attached image takes priority (caption from the draft),
  // otherwise a plain text send.
  const handleDesktopSend = () => {
    if (attachFile) {
      sendImage(attachFile, draft);
      clearDesktopAttachment();
      return;
    }
    sendMessage();
  };

  const openLightbox = useCallback((image: LightboxImage) => setLightbox(image), []);
  // Stable identity so ChatLightbox's key/scroll-lock effect isn't re-run on
  // every realtime message while the viewer is open.
  const closeLightbox = useCallback(() => setLightbox(null), []);

  // A tap on "Not sent" starts a fresh auto-retry run from now.
  const retryPending = (echo: ThreadMessage) => {
    const restart = { pendingState: 'sending' as const, sendAttempts: 0, retryWindowStart: Date.now() };
    updateEcho(echo.id, restart);
    setScrollToBottomSignal((tick) => tick + 1);
    void postMessage({ ...echo, ...restart });
  };

  const discardPending = (echoId: string) => {
    clearRetryTimer(echoId);
    setPendingMessages((prev) => prev.filter((p) => p.id !== echoId));
  };

  // Reply/edit entry points (shared by both layouts). Starting one mode cancels the
  // other so the composer is never ambiguously staged.
  const startReply = (message: ThreadMessage) => {
    // Leaving edit mode: the draft holds another message's text — clear it (matches
    // cancelEdit) so a reply can't accidentally send the edited message's content. A
    // plain in-progress draft (not editing) is preserved for the reply.
    if (editTarget) setDraft('');
    setEditTarget(null);
    setReplyTarget(message);
  };
  const cancelReply = () => setReplyTarget(null);
  const startEdit = (message: ThreadMessage) => {
    setReplyTarget(null);
    setEditTarget(message);
    setDraft(message.text);
  };
  const cancelEdit = () => {
    setEditTarget(null);
    setDraft('');
  };

  const copyMessageText = (text: string) => {
    if (!text) return;
    void navigator.clipboard?.writeText(text).catch(() => {
      setError('Could not copy to clipboard');
    });
  };

  // Save an edit: optimistically rewrite the local message, then PATCH. On failure
  // the optimistic override is rolled back and the error surfaces like a failed send.
  const saveEdit = async () => {
    if (!user || !activeChannelId || !editTarget) return;
    const text = draft.trim();
    if (!text) return;
    const target = editTarget;
    setPendingEdits((prev) => ({ ...prev, [target.id]: { text, editedAt: new Date() } }));
    setEditTarget(null);
    setDraft('');
    setError('');
    try {
      const response = await authedFetch('/api/portal/chat/messages', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannelId, messageId: target.id, text }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to edit message');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to edit message');
      setPendingEdits((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });
    }
  };

  const deleteMessage = async (messageId: string) => {
    if (!user || !activeChannelId) return;
    setError('');
    try {
      const response = await authedFetch('/api/portal/chat/messages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannelId,
          messageId,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to delete message');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete message');
    }
  };

  // Pin/unpin a message. Pin state is low-urgency, so there's no optimistic
  // overlay — the realtime snapshot (useMessages maps isPinned) flips the icon a
  // beat later. Failures surface via the shared error banner, like delete.
  const togglePin = async (message: ThreadMessage) => {
    if (!user || !activeChannelId) return;
    setError('');
    try {
      const response = await authedFetch('/api/portal/chat/messages/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId: activeChannelId,
          messageId: message.id,
          pinned: !message.isPinned,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to pin message');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pin message');
    }
  };

  const formatTime = (date: Date | null) => {
    if (!date) return 'Just now';
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const pinnedMessage = useMemo(() => {
    let latest: ThreadMessage | null = null;
    for (const message of displayMessages) {
      if (!message.isPinned) continue;
      if (!latest || (message.createdAt?.getTime() ?? 0) >= (latest.createdAt?.getTime() ?? 0)) latest = message;
    }
    return latest;
  }, [displayMessages]);
  const pinnedCopy = pinnedMessage
    ? pinnedMessage.text || (pinnedMessage.attachment?.type === 'gif' ? 'GIF' : 'Photo')
    : '';
  // Role labels carry comp tiers, manager titles and IBO levels: admins only.
  const activeMemberCount = activeChannel ? memberCounts[activeChannel.id] ?? activeChannel.memberIds?.length ?? 0 : 0;
  const ActiveMark = activeChannel?.audience === 'managers' ? Lock : Hash;
  const openChannelOnPhone = (channelId: string) => {
    setActiveChannelId(channelId);
    setMobileView('thread');
  };

  return (
    <div className={c.app}>
      {shownError && (
        <p className={`${c.alert} ${s.deskOnly}`} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {shownError}
        </p>
      )}

      {/* Desktop: channel rail + conversation, sized to the viewport. */}
      <div className={c.desk}>
        <aside className={`${s.panel} ${c.rail}`} aria-label="Channels">
          <div className={c.panelHead}>
            <h1 className={s.kicker}>Team chat</h1>
          </div>
          <div className={c.railList}>
            <ChannelRows
              channels={channels}
              loading={loadingChannels}
              error={channelsError}
              onRetry={retryChannels}
              unreadByChannel={unreadByChannel}
              activeChannelId={activeChannelId}
              onSelect={setActiveChannelId}
            />
          </div>
          <div className={c.railFoot}>
            <p className={c.guide}>
              <ShieldAlert size={16} aria-hidden="true" />
              Keep customer details out of chat. Never post card numbers or SSNs.
            </p>
          </div>
        </aside>

        <section className={`${s.panel} ${c.convo}`} aria-label={activeChannel ? `${activeChannel.name} conversation` : 'Conversation'}>
          <header className={c.convoHead}>
            <button type="button" onClick={() => setInfoOpen(true)} disabled={!activeChannel} className={c.titleBtn} aria-label={activeChannel ? `#${activeChannel.name}, channel details` : 'Channel details'}>
              <span className={c.convoTitle}>
                <ActiveMark size={18} aria-hidden="true" />
                {activeChannel?.name ?? 'Select a channel'}
              </span>
              <span className={c.convoDesc}>{activeChannel?.description ?? 'Choose a channel to view messages.'}</span>
            </button>
            {activeChannel && (
              <button type="button" onClick={() => setInfoOpen(true)} className={c.membersBtn}>
                <Users size={16} aria-hidden="true" />
                {activeMemberCount} member{activeMemberCount === 1 ? '' : 's'}
              </button>
            )}
          </header>
          {activeChannelId === 'all-company' && companyStats && <CompanyTape stats={companyStats} />}
          {pinnedMessage && (
            <div className={c.pinned}>
              <Pin size={16} aria-hidden="true" />
              <span className={s.srOnly}>Pinned:</span>
              <span className={c.pinnedText}>{pinnedCopy}</span>
              <span className={c.pinnedBy}>
                {pinnedMessage.authorName} · {formatTime(pinnedMessage.createdAt)}
              </span>
            </div>
          )}
          <div className={c.stage}>
            <ConnectionNotice notice={connectionNotice} />
            <div ref={desktopScrollRef} onScroll={handleDesktopScroll} className={c.scroller}>
              {!loadingMessages && threadMessages.length > 0 && hasMoreMessages && (
                <p className={c.pager}>Earlier messages load as you scroll</p>
              )}
              {loadingMessages ? (
                <div className={c.msgSkels} aria-hidden="true">
                  {[58, 36, 72, 44, 30].map((width, row) => (
                    <div key={row} className={c.msgSkel}>
                      <span className={s.skel} style={{ width: 36, height: 36, borderRadius: '50%' }} />
                      <span>
                        <span className={s.skel} style={{ width: '18%', height: 12 }} />
                        <span className={s.skel} style={{ width: `${width}%`, height: 14 }} />
                      </span>
                    </div>
                  ))}
                </div>
              ) : threadMessages.length === 0 ? (
                <div className={c.emptyThread}>
                  <strong>No messages yet</strong>
                  <span>Start with a short update, question, or field note.</span>
                </div>
              ) : (
                displayMessages.map((message, index) => {
                  const previousMessage = displayMessages[index - 1];
                  const showDayDivider = !previousMessage || getLocalDayKey(previousMessage.createdAt) !== getLocalDayKey(message.createdAt);
                  const grouped =
                    !!previousMessage &&
                    !showDayDivider &&
                    previousMessage.authorId === message.authorId &&
                    Math.abs((message.createdAt?.getTime() ?? 0) - (previousMessage.createdAt?.getTime() ?? 0)) <= 300000;
                  const isPending = !!message.pendingState;
                  const isFailed = message.pendingState === 'failed';
                  const isOwn = message.authorId === user?.uid;
                  const canEdit = isOwn && !!message.text;
                  const canDelete = canModerate || isOwn;
                  const isDev = isDeveloperAuthor(message.authorId);
                  return (
                    <Fragment key={message.id}>
                      {showDayDivider && <div className={c.day}>{formatChatLineDayDivider(message.createdAt)}</div>}
                      <article
                        data-mid={message.id}
                        className={`${c.row} ${grouped ? c.rowGrouped : ''} ${message.pendingState === 'sending' ? c.rowSending : ''}`}
                      >
                        <div className={c.rowAvatar}>
                          {grouped ? null : (
                            <ChatAvatar authorId={message.authorId} authorName={message.authorName} avatarUrl={authorAvatars[message.authorId]} size="md" />
                          )}
                        </div>
                        <div className={c.rowBody}>
                          {!grouped && (
                            <div className={c.rowTop}>
                              {isDev ? (
                                <>
                                  <strong className="chat-dev-name">{message.authorName}</strong>
                                  <span className="chat-dev-badge">DEV</span>
                                </>
                              ) : (
                                <strong className={c.author} style={{ '--an': getAuthorColor(message.authorId).nameDark } as CSSProperties}>
                                  {message.authorName}
                                </strong>
                              )}
                              <span className={c.time}>{clockTime(message.createdAt)}</span>
                              {message.isPinned && (
                                <span className={c.pinTag}>
                                  <Pin size={12} aria-hidden="true" /> Pinned
                                </span>
                              )}
                            </div>
                          )}
                          {grouped && message.isPinned && (
                            <span className={c.pinTag}>
                              <Pin size={12} aria-hidden="true" /> Pinned
                            </span>
                          )}
                          {message.replyTo && (
                            <div className={c.quote}>
                              <strong>{message.replyTo.authorName}</strong>
                              <span>{message.replyTo.text}</span>
                            </div>
                          )}
                          <DesktopAttachment
                            message={message}
                            eager={index >= displayMessages.length - 12}
                            onOpen={() => openLightbox({ url: message.attachment?.url ?? message.localPreviewUrl ?? '', author: message.authorName, time: formatTime(message.createdAt) })}
                          />
                          {message.text && (
                            <p className={c.text}>
                              {message.text}
                              {message.editedAt && <span className={c.edited}> (edited)</span>}
                            </p>
                          )}
                          {isPending ? (
                            isFailed ? (
                              <div className={c.failed}>
                                <button type="button" onClick={() => retryPending(message)} className={c.retryBtn}>
                                  <RotateCw size={14} aria-hidden="true" /> Not sent · Retry
                                </button>
                                <button type="button" onClick={() => discardPending(message.id)} aria-label="Discard message" className={c.discardBtn}>
                                  <X size={16} aria-hidden="true" />
                                </button>
                              </div>
                            ) : (
                              <span className={c.status}>
                                <Clock size={12} aria-hidden="true" /> {pendingStatusLabel(message)}
                              </span>
                            )
                          ) : (
                            <ReactionBar
                              channelId={activeChannelId}
                              messageId={message.id}
                              reactionCounts={message.reactionCounts}
                              myReactions={message.myReactions}
                              onError={setError}
                            />
                          )}
                        </div>
                        {!isPending && (
                          <div className={c.rowActions}>
                            <MessageActions
                              config={{
                                hasText: !!message.text,
                                canEdit,
                                canDelete,
                                canPin,
                                isPinned: !!message.isPinned,
                                onReply: () => startReply(message),
                                onCopy: () => copyMessageText(message.text),
                                onEdit: () => startEdit(message),
                                onDelete: () => deleteMessage(message.id),
                                onTogglePin: () => void togglePin(message),
                              }}
                            />
                          </div>
                        )}
                      </article>
                    </Fragment>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            {desktopNewCount > 0 && (
              <button type="button" onClick={jumpToLatestDesktop} className={c.jump}>
                {desktopNewCount} new message{desktopNewCount > 1 ? 's' : ''} <ArrowDown size={16} aria-hidden="true" />
              </button>
            )}
          </div>
          <div className={c.composer}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                onDesktopFilePicked(file);
              }}
            />
            {attachFile && attachPreview && (
              <div className={c.strip}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachPreview} alt="Selected image preview" className={c.stripThumb} />
                <div className={c.stripCopy}>
                  <strong>Photo ready</strong>
                  <span>{attachFile.name}</span>
                </div>
                <button type="button" onClick={clearDesktopAttachment} aria-label="Remove image" className={c.iconBtn}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            {replyTarget && (
              <div className={c.strip}>
                <div className={c.stripCopy}>
                  <strong>Replying to {replyTarget.authorName}</strong>
                  <span>{makeReplySnippet(replyTarget).text}</span>
                </div>
                <button type="button" onClick={cancelReply} aria-label="Cancel reply" className={c.iconBtn}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            {editTarget && (
              <div className={c.strip}>
                <div className={c.stripCopy}>
                  <strong>Editing message</strong>
                  <span>{editTarget.text}</span>
                </div>
                <button type="button" onClick={cancelEdit} aria-label="Cancel edit" className={c.iconBtn}>
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            <div className={c.composeRow}>
              <button type="button" className={c.tool} onClick={() => fileInputRef.current?.click()} disabled={!activeChannelId || !!editTarget} aria-label="Attach an image">
                <ImagePlus size={22} aria-hidden="true" />
              </button>
              {gifEnabled && (
                <div className={c.gifWrap}>
                  <button type="button" className={c.tool} onClick={() => setGifOpen((open) => !open)} disabled={!activeChannelId || !!editTarget} aria-label="Add a GIF" aria-expanded={gifOpen}>
                    GIF
                  </button>
                  {gifOpen && activeChannelId && <GifPicker authedFetch={authedFetch} onSelect={sendGif} onClose={() => setGifOpen(false)} />}
                </div>
              )}
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (editTarget) void saveEdit();
                    else handleDesktopSend();
                  } else if (event.key === 'Escape' && editTarget) {
                    event.preventDefault();
                    cancelEdit();
                  }
                }}
                placeholder={editTarget ? 'Edit your message' : `Message #${activeChannel?.name ?? 'channel'}`}
                aria-label={editTarget ? 'Edit your message' : 'Message'}
                disabled={!activeChannelId}
                rows={1}
                className={c.input}
              />
              <button
                type="button"
                className={c.send}
                onClick={editTarget ? () => void saveEdit() : handleDesktopSend}
                disabled={!activeChannelId || (editTarget ? !draft.trim() : !draft.trim() && !attachFile)}
              >
                {editTarget ? <Check size={18} aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
                {editTarget ? 'Save' : 'Send'}
              </button>
            </div>
            <p className={c.composeMeta}>
              <span>Don&apos;t post customer card numbers or SSNs.</span>
              <span>Enter to send · Shift+Enter for a new line</span>
            </p>
          </div>
        </section>
      </div>

      {/* Phone: channel list screen, or the full-height conversation. */}
      <div className={c.phone}>
        {mobileView === 'thread' ? (
          <MobileThread
            pinnedMessage={pinnedMessage}
            channel={activeChannel}
            memberCount={activeChannel ? memberCounts[activeChannel.id] : undefined}
            channelId={activeChannelId}
            messages={displayMessages}
            snapshotVersion={snapshotVersion}
            windowSize={messagesWindowSize}
            lastSnapshotWindow={lastSnapshotWindow}
            hasMore={hasMoreMessages}
            onLoadOlder={loadOlderMessages}
            companyStats={activeChannelId === 'all-company' ? companyStats : null}
            authorAvatars={authorAvatars}
            loading={loadingMessages}
            renderedChannel={renderedChannel}
            error={shownError}
            currentUserId={user?.uid}
            canModerate={canModerate}
            canPin={canPin}
            draft={draft}
            gifEnabled={gifEnabled}
            authedFetch={authedFetch}
            messagesEndRef={mobileMessagesEndRef}
            scrollToBottomSignal={scrollToBottomSignal}
            formatTime={formatTime}
            replyTarget={replyTarget}
            editTarget={editTarget}
            replySnippet={makeReplySnippet}
            onBack={() => setMobileView('list')}
            onOpenInfo={() => setInfoOpen(true)}
            onDraftChange={setDraft}
            onSend={sendMessage}
            onSendImage={sendImage}
            onSendGif={sendGif}
            onOpenImage={openLightbox}
            onError={setError}
            onDelete={deleteMessage}
            onReactionError={setError}
            onRetryPending={retryPending}
            connectionNotice={connectionNotice}
            onDiscardPending={discardPending}
            onReply={startReply}
            onEdit={startEdit}
            onCopy={copyMessageText}
            onTogglePin={togglePin}
            onCancelReply={cancelReply}
            onCancelEdit={cancelEdit}
            onSaveEdit={saveEdit}
          />
        ) : (
          <>
            {shownError && (
              <p className={c.alert} role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                {shownError}
              </p>
            )}
            <MobileChannelList
              channels={channels}
              loading={loadingChannels}
              error={channelsError}
              onRetry={retryChannels}
              unreadByChannel={unreadByChannel}
              onOpenChannel={openChannelOnPhone}
            />
          </>
        )}
      </div>
      <ChannelInfoSheet channel={activeChannel} open={infoOpen} onOpenChange={setInfoOpen} isAdmin={isRole('admin')} authedFetch={authedFetch} onOpenImage={openLightbox} lightboxOpen={!!lightbox} />
      <ChatLightbox image={lightbox} onClose={closeLightbox} />
    </div>
  );
}
