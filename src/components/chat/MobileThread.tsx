'use client';

import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { ArrowDown, Check, ChevronDown, ChevronLeft, Clock, Hash, ImagePlus, Loader2, Lock, Pencil, Pin, RotateCw, Send, Sparkles, X } from 'lucide-react';
import { ReactionBar } from '@/components/chat/ReactionBar';
import { GifPicker } from '@/components/chat/GifPicker';
import type { GifResult } from '@/components/chat/GifPicker';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { MessageActionSheet } from '@/components/chat/MessageActions';
import type { MessageActionsConfig } from '@/components/chat/MessageActions';
import { validateSelectedImage } from '@/components/chat/attachmentUpload';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessageView } from '@/hooks/chat/useMessages';
import { ChatChannel, ChatAttachment, ChatReplySnippet } from '@/types';

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

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
};

interface MobileThreadProps {
  channel?: ChatChannel;
  channelId: string;
  messages: ThreadMessage[];
  loading: boolean;
  error?: string;
  currentUserId?: string;
  canModerate: boolean;
  // Pin eligibility (admin/operations or l1/l2 managers) — the page derives it and
  // the long-press sheet shows Pin/Unpin only for eligible users.
  canPin: boolean;
  draft: string;
  sending: boolean;
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
 * A message's image/GIF rendered as a chat bubble (Connecteam style). Shows the
 * local preview with an upload shimmer while a pending image echo uploads (not
 * clickable then); a delivered image/GIF opens the lightbox. Nothing for text.
 */
function BubbleImage({
  message,
  isOwn,
  onOpen,
}: {
  message: ThreadMessage;
  isOwn: boolean;
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
      className={`relative block w-60 max-w-full overflow-hidden bg-[#0A1F44]/5 shadow-sm ring-1 disabled:cursor-default dark:bg-white/5 ${
        isFailed ? 'ring-red-400/70 dark:ring-red-500/50' : 'ring-slate-200 dark:ring-border'
      } ${isOwn ? 'rounded-2xl rounded-br-md' : 'rounded-2xl rounded-bl-md'}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={message.text || 'Shared image'}
        loading="lazy"
        style={aspectStyle}
        className={`max-h-64 w-full object-cover ${isUploading ? 'opacity-70' : ''}`}
      />
      {isUploading && (
        <span className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-t from-[#0A1F44]/30 to-transparent" />
      )}
    </button>
  );
}

/** Grouping window: messages from the same author within this gap merge. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

/** First letters of first+last name words (mirrors repInitials in SalesTable). */
function chatInitials(name: string) {
  const words = name.split(' ').filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

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

/**
 * Phone conversation screen (Connecteam-style): compact back bar, chat-bubble
 * messages that fill the height, and a composer pinned to the bottom edge.
 * The chat page hides the bottom nav while this is mounted. Desktop never
 * renders this (lg:hidden owner).
 */
export function MobileThread({
  channel,
  channelId,
  messages,
  loading,
  error,
  currentUserId,
  canModerate,
  canPin,
  draft,
  sending,
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
  const longPressTimer = useRef<number | undefined>(undefined);
  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  };
  const startLongPress = (message: ThreadMessage) => {
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => setActionSheet(message), 500);
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
  const [prevChannel, setPrevChannel] = useState(channelId);
  const contextRef = useRef('');
  const signalRef = useRef(scrollToBottomSignal);

  if (channelId !== prevChannel) {
    setPrevChannel(channelId);
    setPrevLen(messages.length);
    setNewCount(0);
  } else if (messages.length !== prevLen) {
    const grew = messages.length - prevLen;
    setPrevLen(messages.length);
    // Own sends force-scroll to the bottom anyway — don't flash the pill when
    // the newest arrival is the reader's own message (or echo).
    const newest = messages[messages.length - 1];
    const ownArrival = !!newest && newest.authorId === currentUserId;
    if (grew > 0 && !pinned && !ownArrival) setNewCount((count) => count + grew);
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

  // Pure DOM sync (no setState): opening a channel jumps instantly to the
  // bottom; an own send/retry (signal bump) always smooth-scrolls; otherwise a
  // new message only scrolls when the reader is already pinned.
  useEffect(() => {
    const anchor = messagesEndRef.current;
    if (!anchor) return;
    const opening = contextRef.current !== channelId;
    const forced = signalRef.current !== scrollToBottomSignal;
    contextRef.current = channelId;
    signalRef.current = scrollToBottomSignal;
    if (opening) {
      anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
    } else if (forced || pinnedRef.current) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [messages.length, channelId, scrollToBottomSignal, messagesEndRef]);

  const jumpToLatest = () => {
    setPinned(true);
    setNewCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  return (
    <div className="chat-slide-in flex h-[calc(100dvh-4rem-env(safe-area-inset-top))] flex-col bg-slate-50 dark:bg-muted/40">
      {/* Compact top bar with back arrow (≥40px target). */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-border bg-white/95 dark:bg-card/95 px-1.5 py-1.5 backdrop-blur">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to channels"
          className="grid size-10 shrink-0 place-items-center rounded-md text-slate-600 dark:text-muted-foreground hover:bg-slate-100 dark:hover:bg-muted"
        >
          <ChevronLeft className="size-6" />
        </button>
        <button
          type="button"
          onClick={onOpenInfo}
          aria-label="Channel details"
          className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 text-left hover:bg-slate-100 dark:hover:bg-muted"
        >
          {channel?.audience === 'managers' ? (
            <Lock className="size-4 shrink-0 text-slate-500 dark:text-muted-foreground" />
          ) : (
            <Hash className="size-4 shrink-0 text-slate-500 dark:text-muted-foreground" />
          )}
          <span className="truncate font-semibold text-slate-950 dark:text-foreground">
            {channel?.name ?? 'Channel'}
          </span>
          {channel && (
            <Badge variant="secondary" className="shrink-0 text-[11px]">
              {audienceCopy[channel.audience]}
            </Badge>
          )}
          <ChevronDown className="size-4 shrink-0 text-slate-400 dark:text-muted-foreground" />
        </button>
      </div>

      {/* Message list — newest at the bottom. flex-col + mt-auto spacer
          bottom-anchors sparse conversations so the latest message sits just
          above the composer, chat-style. Vertical rhythm is per-message so
          grouped bubbles can tighten up (see mt-* below). The relative wrapper
          hosts the floating jump-to-latest pill so it clears the composer. */}
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <div ref={scrollRef} onScroll={clearLongPress} className="flex flex-1 flex-col overflow-auto p-3">
        <div aria-hidden="true" className="mt-auto" />
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-muted-foreground">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-muted-foreground">
            Start with a short update, question, or field note.
          </p>
        ) : (
          messages.map((message, index) => {
            const prev = index > 0 ? messages[index - 1] : null;
            const next = index < messages.length - 1 ? messages[index + 1] : null;
            const isOwn = message.authorId === currentUserId;
            const isPending = !!message.pendingState;
            const isFailed = message.pendingState === 'failed';

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
            const spacing = showDaySeparator
              ? ''
              : index === 0
                ? ''
                : isFirstOfGroup
                  ? 'mt-3'
                  : 'mt-0.5';

            return (
              <div key={message.id}>
                {showDaySeparator && message.createdAt && (
                  <div className="my-3 flex items-center gap-3 px-1">
                    <span className="h-px flex-1 bg-slate-200 dark:bg-border" />
                    <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-muted-foreground">
                      {dayLabel(message.createdAt)}
                    </span>
                    <span className="h-px flex-1 bg-slate-200 dark:bg-border" />
                  </div>
                )}
                <div className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'} ${spacing}`}>
                  {!isOwn && isFirstOfGroup && (
                    <div className="mb-1 flex flex-wrap items-center gap-2 pl-9 pr-1">
                      <span className="text-xs font-semibold text-slate-950 dark:text-foreground">
                        {message.authorName}
                      </span>
                      {message.authorRole && (
                        <Badge variant="secondary" className="text-[10px]">
                          {message.authorRole.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className={`flex max-w-[85%] items-end gap-1 ${isOwn ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* Avatar gutter (others only): 32px chip on first-of-group,
                        empty spacer otherwise so grouped bubbles stay aligned. */}
                    {!isOwn && (
                      <div className="w-8 shrink-0 self-end">
                        {isFirstOfGroup && (
                          <span className="grid size-8 place-items-center rounded-full bg-[#0A1F44]/10 text-xs font-semibold text-[#0A1F44] dark:bg-white/10 dark:text-white">
                            {chatInitials(message.authorName)}
                          </span>
                        )}
                      </div>
                    )}
                    <div
                      className={`flex min-w-0 flex-col gap-1 ${isOwn ? 'items-end' : 'items-start'}`}
                      onTouchStart={() => !isPending && startLongPress(message)}
                      onTouchMove={clearLongPress}
                      onTouchEnd={clearLongPress}
                      onTouchCancel={clearLongPress}
                      onContextMenu={(event) => {
                        // Long-press on mobile also fires the browser context menu —
                        // suppress it so our action sheet is the only affordance.
                        if (!isPending) event.preventDefault();
                      }}
                    >
                      {message.replyTo && (
                        <div
                          className={`max-w-full rounded-lg border-l-2 border-[#8dc63f] bg-slate-100 px-2.5 py-1.5 dark:bg-muted/70 ${
                            isOwn ? 'rounded-br-md' : 'rounded-bl-md'
                          }`}
                        >
                          <p className="truncate text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            {message.replyTo.authorName}
                          </p>
                          <p className="line-clamp-2 text-[11px] text-slate-500 dark:text-muted-foreground">
                            {message.replyTo.text}
                          </p>
                        </div>
                      )}
                      {(message.attachment || message.localPreviewUrl) && (
                        <BubbleImage
                          message={message}
                          isOwn={isOwn}
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
                          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-6 shadow-sm portal-motion ${
                            isOwn
                              ? 'rounded-br-md bg-[#0A1F44] text-white'
                              : 'rounded-bl-md border border-slate-200 bg-white text-slate-700 dark:border-border dark:bg-card dark:text-slate-200'
                          } ${message.pendingState === 'sending' ? 'opacity-70' : ''} ${
                            isFailed ? 'ring-1 ring-red-400/70 dark:ring-red-500/50' : ''
                          }`}
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
                      <div className="mt-1 flex items-center gap-2 px-1">
                        <button
                          type="button"
                          onClick={() => onRetryPending(message)}
                          className="flex items-center gap-1 text-[11px] font-medium text-red-600 hover:underline dark:text-red-400"
                        >
                          <RotateCw className="size-3" />
                          Failed — tap to retry
                        </button>
                        <button
                          type="button"
                          onClick={() => onDiscardPending(message.id)}
                          aria-label="Discard message"
                          className="text-slate-400 hover:text-red-600 dark:text-muted-foreground dark:hover:text-red-400"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="mt-1 flex items-center gap-1 px-1 text-[11px] text-slate-400 dark:text-muted-foreground">
                        <Clock className="size-3" />
                        Sending…
                      </span>
                    )
                  ) : (
                    <>
                      {isLastOfGroup && (
                        <span
                          className={`mt-1 text-[11px] text-slate-400 dark:text-muted-foreground ${
                            isOwn ? 'px-1' : 'pl-9 pr-1'
                          }`}
                        >
                          {formatTime(message.createdAt)}
                          {message.editedAt && <span className="ml-1">(edited)</span>}
                          {message.isPinned && (
                            <Pin aria-label="Pinned" className="ml-1 inline-block size-3 align-[-1px]" />
                          )}
                        </span>
                      )}
                      <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start pl-9'}`}>
                        <ReactionBar
                          channelId={channelId}
                          messageId={message.id}
                          reactionCounts={message.reactionCounts}
                          myReactions={message.myReactions}
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
          <button
            type="button"
            onClick={jumpToLatest}
            className="portal-motion absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#8dc63f] px-3.5 py-1.5 text-xs font-semibold text-[#0A1F44] shadow-lg shadow-black/10 hover:bg-[#7ab82e] dark:shadow-black/40"
          >
            {newCount} new message{newCount > 1 ? 's' : ''}
            <ArrowDown className="size-3.5" />
          </button>
        )}
      </div>

      {error && (
        <Alert className="mx-3 mb-2 w-auto border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Composer pinned to the bottom edge. */}
      <div className="border-t border-slate-200 dark:border-border bg-white dark:bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Hidden file input — opened by the ImagePlus button. */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            // Clear so re-picking the same file fires onChange again.
            event.target.value = '';
            pickFile(file);
          }}
        />
        {/* Reply / edit staging bar (lime left border, X to cancel). */}
        {replyTarget && (
          <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-[#8dc63f] bg-slate-50 px-3 py-2 dark:bg-muted/60">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                Replying to {replyTarget.authorName}
              </p>
              <p className="truncate text-[11px] text-slate-500 dark:text-muted-foreground">
                {replySnippet(replyTarget).text}
              </p>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-muted-foreground dark:hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {editTarget && (
          <div className="mb-2 flex items-center gap-2 rounded-md border-l-2 border-[#8dc63f] bg-slate-50 px-3 py-2 dark:bg-muted/60">
            <Pencil className="size-3.5 shrink-0 text-slate-500 dark:text-muted-foreground" />
            <span className="flex-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
              Editing message
            </span>
            <button
              type="button"
              onClick={onCancelEdit}
              aria-label="Cancel edit"
              className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-muted-foreground dark:hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        {/* Staged-image preview chip. */}
        {attachFile && attachPreview && (
          <div className="mb-2 flex items-center gap-2.5 rounded-md border border-slate-200 bg-slate-50 p-2 dark:border-border dark:bg-muted/60">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={attachPreview}
              alt="Selected image preview"
              className="size-10 shrink-0 rounded object-cover ring-1 ring-slate-200 dark:ring-border"
            />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-600 dark:text-muted-foreground">
              {attachFile.name}
            </span>
            <button
              type="button"
              onClick={clearAttachment}
              aria-label="Remove image"
              className="grid size-7 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:text-muted-foreground dark:hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
        )}
        <div className="flex items-end gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={!channelId || !!editTarget}
            aria-label="Attach an image"
            className="size-10 shrink-0 text-slate-500 hover:text-[#0A1F44] dark:text-muted-foreground dark:hover:text-foreground"
          >
            <ImagePlus className="size-5" />
          </Button>
          {gifEnabled && (
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setGifOpen((open) => !open)}
                disabled={!channelId || !!editTarget}
                aria-label="Add a GIF"
                aria-expanded={gifOpen}
                className="size-10 shrink-0 text-slate-500 hover:text-[#0A1F44] dark:text-muted-foreground dark:hover:text-foreground"
              >
                <Sparkles className="size-5" />
              </Button>
              {gifOpen && channelId && (
                <GifPicker
                  authedFetch={authedFetch}
                  onSelect={onSendGif}
                  onClose={() => setGifOpen(false)}
                />
              )}
            </div>
          )}
          <Textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value.slice(0, 1000))}
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
            placeholder={
              editTarget ? 'Edit your message...' : channel ? `Message ${channel.name}...` : 'Select a channel...'
            }
            disabled={!channelId}
            rows={1}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none"
          />
          <Button
            type="button"
            onClick={handleSend}
            disabled={
              !channelId || (editTarget ? !draft.trim() : !draft.trim() && !attachFile) || sending
            }
            size="icon"
            className="size-10 shrink-0 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
            aria-label={editTarget ? 'Save edit' : sending ? 'Sending' : 'Send message'}
          >
            {sending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editTarget ? (
              <Check className="size-4" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-muted-foreground">
          Enter to send · Shift+Enter for a new line. No customer PII.
        </p>
      </div>

      {/* Long-press action sheet — Reply / Copy / Edit / Delete for one message. */}
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
              } satisfies MessageActionsConfig)
            : null
        }
        onClose={() => setActionSheet(null)}
      />
    </div>
  );
}
