'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, RefObject, TouchEvent } from 'react';
import { AlertCircle, ArrowDown, Check, ChevronLeft, Clock, ImagePlus, Info, Lock, Pin, RotateCw, Send, X } from 'lucide-react';
import { ChatAvatar } from '@/components/chat/ChatAvatar';
import { ReactionBar } from '@/components/chat/ReactionBar';
import { GifPicker } from '@/components/chat/GifPicker';
import type { GifResult } from '@/components/chat/GifPicker';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { MessageActionSheet } from '@/components/chat/MessageActions';
import type { MessageActionsConfig } from '@/components/chat/MessageActions';
import { validateSelectedImage } from '@/components/chat/attachmentUpload';
import { clockTime, pendingStatusLabel, type CompanyStats } from '@/components/chat/chatFormat';
import { CompanyTape } from '@/components/chat/CompanyTape';
import { ConnectionNotice } from '@/components/chat/ConnectionNotice';
import { gifPickerMaxHeight, keyboardInset } from '@/lib/chat/keyboard';
import type { ConnectionNotice as ConnectionNoticeState } from '@/lib/chat/reconnect';
import { useHideRepTabBar } from '@/components/portal/rep/RepShell';
import s from '@/components/portal/rep/rep.module.css';
import { GROW_STEP, MAX_WINDOW } from '@/hooks/chat/useMessages';
import type { ChatMessageView } from '@/hooks/chat/useMessages';
import { getAuthorColor, isDeveloperAuthor } from '@/lib/chat/authorColor';
import { countNewArrivals, newestDeliveredId } from '@/lib/chat/unseen';
import { ChatChannel, ChatAttachment, ChatReplySnippet } from '@/types';
import c from './chat.module.css';

/**
 * A message as rendered in the thread: a real Firestore message, or an
 * optimistic local echo the page pushed on send. `pendingState` is only set on
 * echoes; real messages omit it. Echoes are shaped like real messages so they
 * participate in grouping/day-separators naturally, but must not offer
 * reactions or delete until they resolve into the realtime feed.
 */
export type ThreadMessage = ChatMessageView & {
  pendingState?: 'sending' | 'failed';
  // Optimistic image sends only: a local object URL shown in the pending bubble
  // (with an upload shimmer) until the real message reconciles in, the original
  // file so a failed send can retry the upload, the resolved server attachment
  // cached after a successful upload so a message-POST retry doesn't re-upload,
  // and the prepared image dimensions so the pending tile reserves its box (no
  // layout shift). All absent on text/GIF echoes and on real messages.
  localPreviewUrl?: string;
  pendingFile?: File;
  uploadedAttachment?: ChatAttachment;
  localPreviewWidth?: number;
  localPreviewHeight?: number;
  // Set on optimistic reply echoes so the page's postMessage includes it and the
  // pending bubble can show its quote before the server echo reconciles.
  replyToMessageId?: string;
  // Send reliability (echoes only): the idempotency key the POST sends (the
  // echo's id is the doc id the server derives from it), the id the POST
  // reported once it landed, attempts made in the current auto-retry run and
  // when that run started, the photo prepared once (so a retry never re-reads
  // the picked file), and upload progress 0..1 while a photo is uploading.
  clientMessageId?: string;
  deliveredId?: string;
  sendAttempts?: number;
  retryWindowStart?: number;
  preparedUpload?: { file: File; width?: number; height?: number };
  uploadProgress?: number;
};

interface MobileThreadProps {
  pinnedMessage: ThreadMessage | null;
  channel?: ChatChannel & { memberIds?: string[] };
  // Resolved active-account head-count from the members endpoint; the raw
  // memberIds array over-counts (deleted/deactivated uids linger in it).
  memberCount?: number;
  channelId: string;
  messages: ThreadMessage[];
  // Bumped once per COMMITTED useMessages snapshot (not on echo updates or on
  // the eviction-guard's skipped snapshots) — keys the scroll-anchor effect so
  // a pending anchor is always cleared after the next real snapshot, and an
  // echo append never triggers a head-growth adjustment. See onLoadOlder.
  snapshotVersion: number;
  // useMessages' current window limit and the limit the last COMMITTED
  // snapshot actually ran under. Together they let the anchor-race guard tell
  // a real post-growth snapshot apart from one the OLD (pre-growth) listener
  // fires in between calling onLoadOlder and the resubscribe landing.
  windowSize: number;
  lastSnapshotWindow: number;
  // True while useMessages' sliding window hasn't reached the channel's start;
  // drives both the "earlier messages" pager copy and whether scrolling near
  // the top requests more history.
  hasMore: boolean;
  onLoadOlder: () => void;
  // The All Company line, already gated to that channel by the page (null
  // elsewhere, or when the stats call failed) — rendered as-is, never fabricated.
  companyStats: CompanyStats | null;
  // uid -> photo URL, resolved server-side from the active channel's members
  // (already-visible data — the same population whose names are shown per message).
  authorAvatars: Record<string, string>;
  loading: boolean;
  // Which channel's messages are actually committed in state (from useMessages;
  // null until the first commit). An EMPTY committed channel still counts —
  // inspecting messages[0] would not cover it.
  renderedChannel: string | null;
  error?: string;
  currentUserId?: string;
  canModerate: boolean;
  // Pin eligibility (admin/operations or l1/l2 managers) — the page derives it and
  // the long-press sheet shows Pin/Unpin only for eligible users.
  canPin: boolean;
  // Role labels (tiers, manager titles, IBO) show only to admins.
  draft: string;
  // GIF feature availability (probed by the page) + the shared verified-token
  // fetch the GIF picker uses to search Tenor.
  gifEnabled: boolean;
  authedFetch: (url: string, init?: RequestInit) => Promise<Response>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  // Bumped by the page on every own action (send/retry) so the thread always
  // scrolls to the bottom regardless of the reader's scroll position.
  scrollToBottomSignal: number;
  formatTime: (date: Date | null) => string;
  // Reply/edit composer modes are owned by the page (shared with desktop). The
  // snippet builder mirrors the server rule for the staged reply preview.
  replyTarget: ThreadMessage | null;
  editTarget: ThreadMessage | null;
  replySnippet: (message: ThreadMessage) => ChatReplySnippet;
  onBack: () => void;
  onOpenInfo: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  // Media sends flow back to the page's optimistic machinery (same as text).
  onSendImage: (file: File, caption: string) => void;
  onSendGif: (gif: GifResult) => void;
  onOpenImage: (image: LightboxImage) => void;
  onError: (message: string) => void;
  onDelete: (messageId: string) => void;
  onReactionError: (message: string) => void;
  onRetryPending: (message: ThreadMessage) => void;
  onDiscardPending: (messageId: string) => void;
  // Offline / reconnecting chip (already delayed by the page's hook).
  connectionNotice: ConnectionNoticeState;
  // Message-action callbacks (Reply/Copy/Edit) + composer mode cancels/save.
  onReply: (message: ThreadMessage) => void;
  onEdit: (message: ThreadMessage) => void;
  onCopy: (text: string) => void;
  onTogglePin: (message: ThreadMessage) => void;
  onCancelReply: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
}

/**
 * A message's image/GIF as a rounded tile in the bubble column. Shows the local
 * preview with an upload shimmer while a pending image echo uploads (not
 * clickable then); a delivered image/GIF opens the lightbox. Nothing for text.
 */
function BubbleImage({
  message,
  isOwn,
  eager,
  onOpen,
}: {
  message: ThreadMessage;
  isOwn: boolean;
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
  // messages, prepared dims on pending image echoes) so the navy skeleton shows
  // while loading and the decode causes no layout shift — which would otherwise
  // nudge the scroll anchor past the pin margin.
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
      data-own={isOwn ? 'true' : undefined}
      className={`${c.attachment} ${isFailed ? c.attachmentFailed : ''}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={message.text || 'Shared image'}
        // WebKit can leave a newly appended lazy image unloaded inside this
        // nested overflow scroller. Eager-load the recent tail only; older
        // history stays lazy so loading a large message window remains bounded.
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

/** Grouping window: messages from the same author within this gap merge. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** Null timestamps are treated as the same day as the neighbouring message. */
function sameCalendarDay(a: Date | null, b: Date | null) {
  if (!a || !b) return true;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Missing timestamps stay in the current group rather than splitting it. */
function withinGroupWindow(a: Date | null, b: Date | null) {
  if (!a || !b) return true;
  return Math.abs(b.getTime() - a.getTime()) <= GROUP_WINDOW_MS;
}

/** Today / Yesterday / "Mon, Jul 1" for a day-separator chip. */
function dayLabel(date: Date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThat = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((startOfToday.getTime() - startOfThat.getTime()) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// Caps the GIF picker (opening upward from the composer) to the room left in
// the thread, via --gif-max on the thread element.
function fitGifPicker(thread: HTMLElement) {
  const anchor = thread.querySelector<HTMLElement>('[data-gif-anchor]');
  if (!anchor) return;
  const max = gifPickerMaxHeight(anchor.getBoundingClientRect().top, thread.getBoundingClientRect().top);
  thread.style.setProperty('--gif-max', `${max}px`);
}

/**
 * Phone conversation screen: a back/title row under the D top bar, bubbles that
 * fill the height, and the composer on the bottom edge. The composer replaces
 * the tab bar while this is mounted (a thread is a task screen: back returns to
 * the channel list, where the tabs come back). Sized to the visual viewport so
 * the iOS keyboard never covers the input. Desktop hides it.
 */
export function MobileThread({
  pinnedMessage,
  channel,
  memberCount,
  channelId,
  messages,
  snapshotVersion,
  windowSize,
  lastSnapshotWindow,
  hasMore,
  onLoadOlder,
  companyStats,
  authorAvatars,
  loading,
  renderedChannel,
  error,
  currentUserId,
  canModerate,
  canPin,
  draft,
  gifEnabled,
  authedFetch,
  messagesEndRef,
  scrollToBottomSignal,
  formatTime,
  replyTarget,
  editTarget,
  replySnippet,
  onBack,
  onOpenInfo,
  onDraftChange,
  onSend,
  onSendImage,
  onSendGif,
  onOpenImage,
  onError,
  onDelete,
  onReactionError,
  onRetryPending,
  connectionNotice,
  onDiscardPending,
  onReply,
  onEdit,
  onCopy,
  onTogglePin,
  onCancelReply,
  onCancelEdit,
  onSaveEdit,
}: MobileThreadProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // Long-press → bottom action sheet. A single shared timer/target avoids per-row
  // hooks: touchstart on a bubble arms a 500ms timer; move/scroll/end cancel it;
  // firing opens the sheet for that message.
  const [actionSheet, setActionSheet] = useState<ThreadMessage | null>(null);
  const [reactionPickerMessageId, setReactionPickerMessageId] = useState<string | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  // The sheet opens while the finger is still down; the tap the browser makes
  // from that touch's release must not land on a sheet row (Delete sits last,
  // right under the thumb).
  const longPressFired = useRef(false);
  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  };
  const startLongPress = (message: ThreadMessage) => {
    clearLongPress();
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressTimer.current = undefined;
      longPressFired.current = true;
      setActionSheet(message);
    }, 500);
  };
  const endLongPress = (event: TouchEvent) => {
    clearLongPress();
    if (!longPressFired.current) return;
    longPressFired.current = false;
    if (event.cancelable) event.preventDefault();
  };
  // Composer media state (mobile owns its own, mirroring the desktop composer).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [attachFile, setAttachFile] = useState<File | null>(null);
  const [attachPreview, setAttachPreview] = useState('');
  const [gifOpen, setGifOpen] = useState(false);

  // Release the staged preview object URL when cleared or swapped.
  useEffect(() => {
    if (!attachPreview) return;
    return () => URL.revokeObjectURL(attachPreview);
  }, [attachPreview]);

  const pickFile = (file: File | undefined) => {
    if (!file) return;
    const validationError = validateSelectedImage(file);
    if (validationError) {
      onError(validationError);
      return;
    }
    onError('');
    setAttachFile(file);
    setAttachPreview(URL.createObjectURL(file));
  };

  const clearAttachment = () => {
    setAttachFile(null);
    setAttachPreview('');
  };

  // Send: an active edit saves; otherwise a staged image takes priority (caption
  // from the draft); otherwise a plain text send.
  const handleSend = () => {
    if (editTarget) {
      onSaveEdit();
      return;
    }
    if (attachFile) {
      onSendImage(attachFile, draft);
      clearAttachment();
      return;
    }
    onSend();
  };
  // Pinned-ness drives the pill (state, for re-render) and is also read
  // synchronously inside the scroll effect (ref mirror) so a mere pin flip
  // doesn't itself trigger a scroll.
  const [pinned, setPinned] = useState(true);
  const pinnedRef = useRef(true);
  const [newCount, setNewCount] = useState(0);
  // Previous message count / channel, tracked in state so the unseen counter is
  // adjusted during render (React's "info from previous renders" pattern —
  // avoids a cascading setState inside an effect).
  const [prevLen, setPrevLen] = useState(messages.length);
  // The previous render's newest DELIVERED message id — the unseen-count math
  // (countNewArrivals) counts only delivered messages from others that landed
  // after it, so a loadOlder prepend of older history never counts, and an
  // arrival above an unsent echo (echoes render at the tail) still does.
  const [prevNewestId, setPrevNewestId] = useState<string | undefined>(newestDeliveredId(messages));
  const [prevChannel, setPrevChannel] = useState(channelId);
  const contextRef = useRef('');
  const signalRef = useRef(scrollToBottomSignal);

  const newestId = newestDeliveredId(messages);
  if (channelId !== prevChannel) {
    setPrevChannel(channelId);
    setPrevLen(messages.length);
    setPrevNewestId(newestId);
    setNewCount(0);
  } else if (messages.length !== prevLen || newestId !== prevNewestId) {
    setPrevLen(messages.length);
    setPrevNewestId(newestId);
    const grew = countNewArrivals(messages, prevNewestId, currentUserId);
    if (grew > 0 && !pinned) setNewCount((count) => count + grew);
  }

  // Pinned detection: the bottom anchor is "intersecting" while the reader is
  // within ~150px of the bottom (rootMargin extends the scroller's bottom).
  useEffect(() => {
    const anchor = messagesEndRef.current;
    const root = scrollRef.current;
    if (!anchor || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        pinnedRef.current = entry.isIntersecting;
        setPinned(entry.isIntersecting);
        if (entry.isIntersecting) setNewCount(0);
      },
      { root, rootMargin: '0px 0px 150px 0px', threshold: 0 }
    );
    observer.observe(anchor);
    return () => observer.disconnect();
  }, [messagesEndRef]);

  // True only when the rendered list is THIS channel's committed content
  // (an empty committed channel counts). The auto-scroll effect must not
  // consume its "opening" jump on the loading render — or, if a channel ever
  // changes under a mounted thread, on a render still showing the OLD
  // channel's messages (loading only flips true a render later). Consuming
  // "opening" early hands the real first paint to the pinned SMOOTH path — an
  // animated crawl from scrollTop 0 that sweeps the <=200px zone and arms a
  // bogus load-older mid-flight.
  const renderedChannelMatches = !loading && renderedChannel === channelId;

  // Pure DOM sync (no setState): opening a channel jumps instantly to the
  // bottom; an own send/retry (signal bump) always smooth-scrolls; otherwise a
  // new message only scrolls when the reader is already pinned.
  useEffect(() => {
    const anchor = messagesEndRef.current;
    if (!anchor || !renderedChannelMatches) return;
    const opening = contextRef.current !== channelId;
    const forced = signalRef.current !== scrollToBottomSignal;
    contextRef.current = channelId;
    signalRef.current = scrollToBottomSignal;
    if (opening) {
      // 'instant', not 'auto': the scroller inherits scroll-behavior: smooth,
      // and 'auto' defers to it — the "jump" then animates up from scrollTop 0,
      // sweeping through the <=200px zone where handleScroll arms a bogus
      // load-older that interrupts the landing mid-history.
      anchor.scrollIntoView({ behavior: 'instant', block: 'end' });
    } else if (forced || pinnedRef.current) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, renderedChannelMatches, channelId, scrollToBottomSignal, messagesEndRef]);

  const jumpToLatest = () => {
    setPinned(true);
    setNewCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  // iOS keyboard guard: in the installed PWA the software keyboard shrinks the
  // layout viewport (~330px on current iPhones), which pushes the bottom anchor
  // far outside the pinned observer's 150px margin — the reader silently
  // becomes "not pinned" and new messages stop auto-scrolling while they type.
  // If they were at the bottom when they tapped the composer, keep them there
  // through the resize (its timing varies by device, hence the timer ladder).
  const keyboardTimersRef = useRef<number[]>([]);
  const clearKeyboardTimers = () => {
    keyboardTimersRef.current.forEach((timer) => window.clearTimeout(timer));
    keyboardTimersRef.current = [];
  };
  const handleComposerFocus = () => {
    if (!pinnedRef.current) return;
    clearKeyboardTimers();
    const el = scrollRef.current;
    // A touch on the thread while the ladder is live is the reader taking
    // over — never yank them back down after that.
    el?.addEventListener('touchstart', clearKeyboardTimers, { once: true, passive: true });
    keyboardTimersRef.current = [80, 250, 600].map((ms) =>
      window.setTimeout(() => {
        const scroller = scrollRef.current;
        if (!scroller) return;
        // Scoped to the thread scroller (scrollIntoView would also scroll
        // ancestors mid-keyboard-animation); 'instant' beats the inherited
        // scroll-behavior: smooth. The queued scroll event refreshes the
        // compensation's viewportOffset via handleScroll.
        scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'instant' });
      }, ms)
    );
  };
  useEffect(() => clearKeyboardTimers, []);

  // "Load older" trigger: scrolling near the top of the thread requests more
  // history (see useMessages' sliding window). olderPendingRef guards against
  // spamming onLoadOlder while a growth is already in flight; anchorRef
  // captures the pre-growth scroll geometry so the prepend can be re-anchored
  // (Safari doesn't do this natively via overflow-anchor). minWindow records
  // the windowSize this growth needs to have landed under — see the layout
  // effect below, which won't consume the anchor until a snapshot actually
  // came from a query with at least that limit (guards against the OLD
  // listener firing one more unrelated snapshot between onLoadOlder() and the
  // resubscribe, which would otherwise consume+clear the anchor early and
  // leave the real prepend unanchored).
  const olderPendingRef = useRef(false);
  const anchorRef = useRef<{ scrollHeight: number; scrollTop: number; minWindow: number } | null>(null);

  // Tracks the topmost rendered message so a snapshot that PREPENDS history
  // (the eviction guard grows the window on every new incoming message once
  // it's full) can hold the reader's view steady. Safari has no native scroll
  // anchoring (overflow-anchor), so without this the view visibly shifts up by
  // the height of the prepended block. viewportOffset is refreshed from
  // handleScroll so the correction lands where the reader actually is now.
  const firstMsgRef = useRef<{ id: string; node: HTMLElement; viewportOffset: number } | null>(null);

  // Defensive parity with the desktop pane: MobileThread normally unmounts on
  // the way back to the channel list, but if a channel ever changes under a
  // mounted thread, an in-flight growth's anchor would target a minWindow the
  // reset window can no longer reach — abandon it.
  useEffect(() => {
    olderPendingRef.current = false;
    anchorRef.current = null;
    firstMsgRef.current = null;
  }, [channelId]);

  const handleScroll = () => {
    clearLongPress();
    const el = scrollRef.current;
    // Scroll events during a channel-switch loading phase are clamp noise from
    // the skeleton content (scrollTop 0) — acting on them arms a phantom
    // load-older against the incoming channel.
    if (!el || loading) return;
    const first = firstMsgRef.current;
    if (first?.node.isConnected) first.viewportOffset = first.node.offsetTop - el.scrollTop;
    if (!hasMore || olderPendingRef.current) return;
    if (el.scrollTop > 200) return;
    anchorRef.current = { scrollHeight: el.scrollHeight, scrollTop: el.scrollTop, minWindow: Math.min(windowSize + GROW_STEP, MAX_WINDOW) };
    olderPendingRef.current = true;
    onLoadOlder();
  };

  // Runs before paint after every COMMITTED useMessages snapshot (keyed on
  // snapshotVersion — a growth that leaves the message count unchanged still
  // bumps this, so a pending anchor/pending-flag never leaks past one render).
  // If a load-older growth is pending, restore the reader's visual anchor —
  // never when pinned to bottom, which is the auto-scroll effect's territory.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // The thread scroller can inherit scroll-behavior: smooth from the
    // global html rule, which would animate a plain scrollTop assignment —
    // visibly glide instead of snapping, and re-fire handleScroll mid-animation
    // while scrollTop still reads <200. Toggle to 'auto' for the instant jump.
    const setScrollTopInstant = (value: number) => {
      const previousBehavior = el.style.scrollBehavior;
      el.style.scrollBehavior = 'auto';
      el.scrollTop = value;
      el.style.scrollBehavior = previousBehavior;
    };
    const remeasureFirst = () => {
      const node = el.querySelector('[data-mid]');
      firstMsgRef.current =
        node instanceof HTMLElement
          ? { id: node.getAttribute('data-mid') ?? '', node, viewportOffset: node.offsetTop - el.scrollTop }
          : null;
    };
    const anchor = anchorRef.current;
    if (anchor) {
      // The snapshot that just committed may still be from the OLD (pre-growth)
      // listener — don't consume the anchor until one lands from a query whose
      // limit actually covers the requested growth.
      if (lastSnapshotWindow < anchor.minWindow) {
        remeasureFirst();
        return;
      }
      anchorRef.current = null;
      olderPendingRef.current = false;
      if (!pinnedRef.current) {
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
    const first = firstMsgRef.current;
    if (!pinnedRef.current && first?.node.isConnected && el.querySelector('[data-mid]') !== first.node) {
      const target = first.node.offsetTop - first.viewportOffset;
      if (Math.abs(target - el.scrollTop) > 1) setScrollTopInstant(target);
    }
    remeasureFirst();
  }, [snapshotVersion, lastSnapshotWindow]);

  // The composer takes the tab bar's place while a conversation is open.
  useHideRepTabBar(true);

  // iOS keyboard: Safari keeps the layout viewport and overlays the keyboard,
  // so the thread pads its bottom by the covered height (--kb) and the composer
  // rides just above the keys; any pan Safari applied to reveal the input is
  // taken back out so the header stays on screen. The installed app shrinks the
  // layout viewport instead, which 100dvh already follows (--kb stays 0).
  // data-keyboard drops the home-indicator padding while the keys are up.
  const threadRef = useRef<HTMLDivElement | null>(null);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const el = threadRef.current;
    if (!el) return;
    const vv = window.visualViewport;
    const update = () => {
      const inset = vv
        ? keyboardInset({ innerHeight: window.innerHeight, height: vv.height, offsetTop: vv.offsetTop, scale: vv.scale })
        : 0;
      // Pinch-zoomed: the shrunken viewport isn't a keyboard; leave it be.
      if (inset === null) return;
      el.style.setProperty('--kb', `${inset}px`);
      if (inset && vv && vv.offsetTop > 0) window.scrollTo(0, 0);
      fitGifPicker(el);
      const active = document.activeElement;
      const typing = active instanceof HTMLTextAreaElement && el.contains(active);
      setKeyboardOpen(inset > 0 || (typing && window.matchMedia('(pointer: coarse)').matches));
    };
    // Coming back to the app (keyboard dismissed while away, rotation) doesn't
    // always fire a viewport resize, so measure again on resume.
    let resumeFrame = 0;
    const onResume = () => {
      if (document.visibilityState !== 'visible') return;
      window.cancelAnimationFrame(resumeFrame);
      resumeFrame = window.requestAnimationFrame(update);
    };
    const frame = window.requestAnimationFrame(update);
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    document.addEventListener('visibilitychange', onResume);
    window.addEventListener('pageshow', onResume);
    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(resumeFrame);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
      document.removeEventListener('visibilitychange', onResume);
      window.removeEventListener('pageshow', onResume);
    };
  }, []);

  // Size the GIF picker to the room above the composer as soon as it opens
  // (the keyboard its search box raises re-fits it through update above).
  useLayoutEffect(() => {
    if (gifOpen && threadRef.current) fitGifPicker(threadRef.current);
  }, [gifOpen]);

  const memberTotal = channel ? memberCount ?? channel.memberIds?.length ?? 0 : 0;
  const pinnedCopy = pinnedMessage
    ? pinnedMessage.text || (pinnedMessage.attachment?.type === 'gif' ? 'GIF' : 'Photo')
    : '';

  return (
    <div ref={threadRef} className={c.thread} data-keyboard={keyboardOpen ? 'open' : undefined}>
      <div className={c.threadHead}>
        <button type="button" onClick={onBack} aria-label="Back to channels" className={c.iconBtn}>
          <ChevronLeft size={26} aria-hidden="true" />
        </button>
        <button type="button" onClick={onOpenInfo} aria-label="Channel details" className={c.threadTitle}>
          <span className={c.threadName}>
            {channel?.name ?? 'Channel'}
            {channel?.audience === 'managers' ? <Lock size={12} aria-hidden="true" /> : null}
          </span>
          <span className={c.threadSub}>
            {channel ? `${memberTotal} member${memberTotal === 1 ? '' : 's'}` : 'Choose a channel'}
            {channel?.description ? ` · ${channel.description}` : ''}
          </span>
        </button>
        <button type="button" onClick={onOpenInfo} aria-label="Members, pinned and photos" className={c.threadInfo}>
          <Info size={20} aria-hidden="true" />
        </button>
      </div>

      {companyStats && <CompanyTape stats={companyStats} />}

      {pinnedMessage && (
        <div className={c.pinned}>
          <Pin size={16} aria-hidden="true" />
          <span className={s.srOnly}>Pinned:</span>
          <span className={c.pinnedText}>{pinnedCopy}</span>
          <span className={c.pinnedBy}>{pinnedMessage.authorName}</span>
        </div>
      )}

      {/* Message list — newest at the bottom; the scroller's ::before spacer
          bottom-anchors a sparse conversation onto the composer. Vertical rhythm
          is per-message so grouped bubbles can tighten up. The relative stage
          hosts the floating jump-to-latest pill. */}
      <div className={c.stage}>
        <ConnectionNotice notice={connectionNotice} />
        <div ref={scrollRef} onScroll={handleScroll} className={c.threadScroller}>
          {!loading && messages.length > 0 && hasMore && (
            <p className={c.pager}>Earlier messages load as you scroll</p>
          )}
          {loading ? (
            <div className={c.msgSkels} aria-hidden="true">
              {[62, 44, 70, 38].map((width, row) => (
                <div key={row} className={c.msgSkel}>
                  <span className={s.skel} style={{ width: 36, height: 36, borderRadius: '50%' }} />
                  <span>
                    <span className={s.skel} style={{ width: '28%', height: 12 }} />
                    <span className={s.skel} style={{ width: `${width}%`, height: 36, borderRadius: 12 }} />
                  </span>
                </div>
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className={c.emptyThread}>
              <strong>No messages yet</strong>
              <span>Start with a short update, question, or field note.</span>
            </div>
          ) : (
            messages.map((message, index) => {
              const prev = index > 0 ? messages[index - 1] : null;
              const next = index < messages.length - 1 ? messages[index + 1] : null;
              const isOwn = message.authorId === currentUserId;
              const isPending = !!message.pendingState;
              const isFailed = message.pendingState === 'failed';
              const isDev = isDeveloperAuthor(message.authorId);

              // Day separator whenever the calendar day changes (or at the top).
              const showDaySeparator = !prev || !sameCalendarDay(message.createdAt, prev.createdAt);

              // A message merges with the previous one when it shares author, day,
              // and falls inside the 5-minute window. First-of-group carries the
              // name + avatar; last-of-group carries the timestamp.
              const groupWithPrev =
                !!prev &&
                !showDaySeparator &&
                prev.authorId === message.authorId &&
                withinGroupWindow(prev.createdAt, message.createdAt);
              const groupWithNext =
                !!next &&
                next.authorId === message.authorId &&
                sameCalendarDay(message.createdAt, next.createdAt) &&
                withinGroupWindow(message.createdAt, next.createdAt);
              const isFirstOfGroup = !groupWithPrev;
              const isLastOfGroup = !groupWithNext;

              // Tighten spacing inside a group; keep breathing room between groups.
              const spacing = showDaySeparator || index === 0 ? '' : isFirstOfGroup ? c.gapGroup : c.gapTight;

              return (
                <div key={message.id}>
                  {showDaySeparator && message.createdAt && <div className={c.threadDay}>{dayLabel(message.createdAt)}</div>}
                  {/* data-mid anchors the scroll compensation. It lives HERE, not
                      on the outer keyed wrapper: the wrapper also contains the
                      day separator, which disappears when a prepend gives this
                      message a same-day predecessor — anchoring the wrapper would
                      then hold its top steady while the visible message shifts. */}
                  <div data-mid={message.id} className={`${c.bubbleWrap} ${isOwn ? c.bubbleWrapOwn : ''} ${spacing}`}>
                    {/* Own-message headers are hidden by design, except the
                        developer identity — it shows on the author's own phone too. */}
                    {(!isOwn || isDev) && isFirstOfGroup && (
                      <div className={c.bubbleAuthor}>
                        {isDev ? (
                          <>
                            <span className="chat-dev-name">{message.authorName}</span>
                            <span className="chat-dev-badge">DEV</span>
                          </>
                        ) : (
                          <span
                            className={c.author}
                            style={{ '--an': getAuthorColor(message.authorId).nameDark } as CSSProperties}
                          >
                            {message.authorName}
                          </span>
                        )}
                      </div>
                    )}
                    <div className={c.bubbleRow}>
                      {/* Avatar gutter (others only): chip on first-of-group,
                          empty spacer otherwise so grouped bubbles stay aligned. */}
                      {!isOwn && (
                        <div className={c.gutter}>
                          {isFirstOfGroup && (
                            <ChatAvatar
                              authorId={message.authorId}
                              authorName={message.authorName}
                              avatarUrl={authorAvatars[message.authorId]}
                              size="md"
                            />
                          )}
                        </div>
                      )}
                      <div
                        className={c.bubbleCol}
                        onTouchStart={() => !isPending && startLongPress(message)}
                        onTouchMove={clearLongPress}
                        onTouchEnd={endLongPress}
                        onTouchCancel={clearLongPress}
                        onContextMenu={(event) => {
                          // Long-press on mobile also fires the browser context menu —
                          // suppress it so our action sheet is the only affordance.
                          if (!isPending) event.preventDefault();
                        }}
                      >
                        {message.replyTo && (
                          <div className={c.quote}>
                            <strong>{message.replyTo.authorName}</strong>
                            <span>{message.replyTo.text}</span>
                          </div>
                        )}
                        {(message.attachment || message.localPreviewUrl) && (
                          <BubbleImage
                            message={message}
                            isOwn={isOwn}
                            eager={index >= messages.length - 12}
                            onOpen={() =>
                              onOpenImage({
                                url: message.attachment?.url ?? message.localPreviewUrl ?? '',
                                author: message.authorName,
                                time: formatTime(message.createdAt),
                              })
                            }
                          />
                        )}
                        {message.text && (
                          <div
                            className={`${c.bubble} ${isOwn ? c.bubbleOwn : ''} ${
                              message.pendingState === 'sending' ? c.bubbleSending : ''
                            } ${isFailed ? c.bubbleFailed : ''}`}
                          >
                            {message.text}
                          </div>
                        )}
                      </div>
                    </div>
                    {/* Pending echoes swap the timestamp/reactions for a status
                        caption; failed sends offer retry/discard inline. */}
                    {isPending ? (
                      isFailed ? (
                        <div className={c.failed}>
                          <button type="button" onClick={() => onRetryPending(message)} className={c.retryBtn}>
                            <RotateCw size={14} aria-hidden="true" />
                            Not sent · Tap to retry
                          </button>
                          <button
                            type="button"
                            onClick={() => onDiscardPending(message.id)}
                            aria-label="Discard message"
                            className={c.discardBtn}
                          >
                            <X size={16} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        <span className={c.status}>
                          <Clock size={12} aria-hidden="true" />
                          {pendingStatusLabel(message)}
                        </span>
                      )
                    ) : (
                      <>
                        {isLastOfGroup && (
                          <span className={c.stamp}>
                            {clockTime(message.createdAt)}
                            {message.editedAt && <span>· edited</span>}
                            {message.isPinned && <Pin size={12} aria-label="Pinned" />}
                          </span>
                        )}
                        <div className={c.bubbleReactions}>
                          <ReactionBar
                            channelId={channelId}
                            messageId={message.id}
                            reactionCounts={message.reactionCounts}
                            myReactions={message.myReactions}
                            forcePickerOpen={reactionPickerMessageId === message.id}
                            onPickerOpenChange={(open) => {
                              if (!open && reactionPickerMessageId === message.id) setReactionPickerMessageId(null);
                            }}
                            onError={onReactionError}
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Jump-to-latest pill — only while scrolled up with unseen messages. */}
        {newCount > 0 && (
          <button type="button" onClick={jumpToLatest} className={c.jump}>
            {newCount} new message{newCount > 1 ? 's' : ''}
            <ArrowDown size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {error && (
        <p className={c.threadError} role="alert">
          <AlertCircle size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      {/* Composer on the bottom edge, in the tab bar's place. */}
      <div className={c.threadComposer}>
        {/* Hidden file input — opened by the ImagePlus button. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear so re-picking the same file fires onChange again.
            event.target.value = '';
            pickFile(file);
          }}
        />
        {replyTarget && (
          <div className={c.strip}>
            <div className={c.stripCopy}>
              <strong>Replying to {replyTarget.authorName}</strong>
              <span>{replySnippet(replyTarget).text}</span>
            </div>
            <button type="button" onClick={onCancelReply} aria-label="Cancel reply" className={c.iconBtn}>
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
            <button type="button" onClick={onCancelEdit} aria-label="Cancel edit" className={c.iconBtn}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        {attachFile && attachPreview && (
          <div className={c.strip}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={attachPreview} alt="Selected image preview" className={c.stripThumb} />
            <div className={c.stripCopy}>
              <strong>Photo ready</strong>
              <span>{attachFile.name}</span>
            </div>
            <button type="button" onClick={clearAttachment} aria-label="Remove image" className={c.iconBtn}>
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        )}
        <div className={c.composeRow}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!channelId || !!editTarget}
            aria-label="Attach an image"
            className={c.tool}
          >
            <ImagePlus size={22} aria-hidden="true" />
          </button>
          {gifEnabled && (
            <div className={c.gifWrap} data-gif-anchor="">
              <button
                type="button"
                onClick={() => setGifOpen((open) => !open)}
                disabled={!channelId || !!editTarget}
                aria-label="Add a GIF"
                aria-expanded={gifOpen}
                className={c.tool}
              >
                GIF
              </button>
              {gifOpen && channelId && (
                <GifPicker authedFetch={authedFetch} onSelect={onSendGif} onClose={() => setGifOpen(false)} />
              )}
            </div>
          )}
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value.slice(0, 1000))}
            onFocus={handleComposerFocus}
            onKeyDown={(event) => {
              // Enter sends (or saves an edit); Shift+Enter inserts a newline;
              // Esc cancels edit mode.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              } else if (event.key === 'Escape' && editTarget) {
                event.preventDefault();
                onCancelEdit();
              }
            }}
            placeholder={editTarget ? 'Edit your message' : 'Message #' + (channel?.name ?? 'channel')}
            aria-label={editTarget ? 'Edit your message' : 'Message'}
            disabled={!channelId}
            rows={1}
            enterKeyHint="send"
            className={c.input}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!channelId || (editTarget ? !draft.trim() : !draft.trim() && !attachFile)}
            className={c.send}
            aria-label={editTarget ? 'Save edit' : 'Send message'}
          >
            {editTarget ? (
              <Check size={20} aria-hidden="true" />
            ) : (
              <Send size={18} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Long-press action sheet — React / Reply / Copy / Pin / Edit / Delete for one message. */}
      <MessageActionSheet
        open={!!actionSheet}
        authorName={actionSheet?.authorName}
        config={
          actionSheet
            ? ({
                hasText: !!actionSheet.text,
                canEdit: actionSheet.authorId === currentUserId && !!actionSheet.text,
                canDelete: canModerate || actionSheet.authorId === currentUserId,
                canPin,
                isPinned: !!actionSheet.isPinned,
                onReply: () => onReply(actionSheet),
                onCopy: () => onCopy(actionSheet.text),
                onEdit: () => onEdit(actionSheet),
                onDelete: () => onDelete(actionSheet.id),
                onTogglePin: () => onTogglePin(actionSheet),
                onAddReaction: () => setReactionPickerMessageId(actionSheet.id),
              } satisfies MessageActionsConfig)
            : null
        }
        onClose={() => setActionSheet(null)}
      />
    </div>
  );
}
