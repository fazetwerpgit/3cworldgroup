'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { ArrowDown, Check, Clock, ImagePlus, Loader2, Pin, RotateCw, Send, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ChannelInfoSheet } from '@/components/chat/ChannelInfoSheet';
import { ChatLightbox } from '@/components/chat/ChatLightbox';
import type { LightboxImage } from '@/components/chat/ChatLightbox';
import { GifPicker } from '@/components/chat/GifPicker';
import type { GifResult } from '@/components/chat/GifPicker';
import { prepareImageForUpload, uploadChatImage, validateSelectedImage } from '@/components/chat/attachmentUpload';
import { ChatAvatar } from '@/components/chat/ChatAvatar';
import { MessageActions } from '@/components/chat/MessageActions';
import { MobileChannelList } from '@/components/chat/MobileChannelList';
import { MobileThread } from '@/components/chat/MobileThread';
import { isAbortError } from '@/lib/fetch/isAbortError';
import type { ThreadMessage } from '@/components/chat/MobileThread';
import { ReactionBar } from '@/components/chat/ReactionBar';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread, markChannelRead } from '@/hooks/chat/useChatUnread';
import { useMessages } from '@/hooks/chat/useMessages';
import { getAuthorColor, getInitials, isDeveloperAuthor } from '@/lib/chat/authorColor';
import { auth } from '@/lib/firebase/config';
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

  if (isSameLocalDay(date, today)) return 'TODAY';
  if (isSameLocalDay(date, yesterday)) return `YESTERDAY · ${dateLabel}`;
  return dateLabel.toUpperCase();
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
function DesktopAttachment({ message, onOpen }: { message: ThreadMessage; onOpen: () => void }) {
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
      className={`chat-line-attachment relative mt-2 block w-full max-w-xs overflow-hidden rounded-lg bg-[#0A1F44]/5 ring-1 transition disabled:cursor-default dark:bg-white/5 ${
        isFailed ? 'ring-red-400/70 dark:ring-red-500/50' : 'ring-slate-200 dark:ring-border'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={message.text || 'Shared image'}
        loading="lazy"
        style={aspectStyle}
        className={`chat-line-attachment-image max-h-64 w-full object-cover ${isUploading ? 'opacity-70' : ''}`}
      />
      {isUploading && (
        <span className="pointer-events-none absolute inset-0 animate-pulse bg-gradient-to-t from-[#0A1F44]/30 to-transparent" />
      )}
    </button>
  );
}

export default function TeamChatPage() {
  const { user, hasPermission, isRole } = useAuth();
  const [activeChannelId, setActiveChannelId] = useState('');
  // Channel-info Sheet (shared by desktop header title + mobile thread top bar).
  const [infoOpen, setInfoOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
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
  const [desktopPrevChannel, setDesktopPrevChannel] = useState('');
  const desktopSignalRef = useRef(0);

  const { channels, loading: loadingChannels, error: channelsError } = useChatChannels();
  const { messages, loading: loadingMessages, error: messagesError } = useMessages(
    activeChannelId || null
  );

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
    'ibo_level_4'
  );
  const shownError = error || channelsError || messagesError;

  // Unread badges: compare each channel's streamed lastMessageAt against this
  // user's own read receipts. All-read until reads settle (see the hook).
  const { unreadByChannel } = useChatUnread(channels, user?.uid);

  // Whether the desktop (lg+) layout is the one on screen. Both layouts render in
  // the DOM (CSS toggles them), so mark-read needs the breakpoint to know which
  // channel is actually being viewed: desktop always shows its active channel,
  // while mobile only "opens" a channel in the thread view.
  const [isLgUp, setIsLgUp] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 721px)');
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
  // duplicate). An echo is reconciled when a real message with the same
  // (authorId, text) exists — matched one-to-one via a consumed Set so two
  // identical sends map to two distinct real messages. No time window: a stale
  // still-"sending" echo must reconcile whenever its message finally shows,
  // however long that takes. Failed echoes are never matched — they have no
  // delivered counterpart, so matching them would let a failed send silently
  // vanish onto an unrelated older message.
  const threadMessages = useMemo<ThreadMessage[]>(() => {
    const consumed = new Set<string>();
    const unreconciled = pendingMessages.filter((echo) => {
      if (echo.channelId !== activeChannelId) return false;
      if (echo.pendingState === 'failed') return true;
      const match = messages.find(
        (real) => !consumed.has(real.id) && real.authorId === echo.authorId && real.text === echo.text
      );
      if (match) {
        consumed.add(match.id);
        return false;
      }
      return true;
    });
    return [...messages, ...unreconciled];
  }, [messages, pendingMessages, activeChannelId]);

  // State hygiene only: drop reconciled echoes from state so pendingMessages
  // doesn't grow without bound. Render correctness is already guaranteed by the
  // synchronous filter above; this mirrors it (same no-window, consumed-Set,
  // failed-excluded rules) for the active channel's echoes.
  useEffect(() => {
    setPendingMessages((prev) => {
      if (prev.length === 0) return prev;
      const consumed = new Set<string>();
      const next = prev.filter((echo) => {
        if (echo.channelId !== activeChannelId) return true;
        if (echo.pendingState === 'failed') return true;
        const match = messages.find(
          (real) => !consumed.has(real.id) && real.authorId === echo.authorId && real.text === echo.text
        );
        if (match) {
          consumed.add(match.id);
          return false;
        }
        return true;
      });
      return next.length === prev.length ? prev : next;
    });
  }, [messages, activeChannelId]);

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
  // avatarUrl (Firestore doc is unchanged), so we resolve photos from the
  // active channel's member list (already-visible data — same population whose
  // names are shown on every message). Merged across channels rather than reset,
  // so switching channels never flashes photos back to initials for a uid we've
  // already resolved.
  const [authorAvatars, setAuthorAvatars] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!user || !activeChannelId) return;
    const controller = new AbortController();
    let mounted = true;
    authedFetch(`/api/portal/chat/channels/${activeChannelId}/members`, {
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        if (!mounted || !Array.isArray(json.members)) return;
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
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authedFetch, user, activeChannelId]);

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
  if (activeChannelId !== desktopPrevChannel) {
    setDesktopPrevChannel(activeChannelId);
    setDesktopPrevLen(threadMessages.length);
    setDesktopNewCount(0);
  } else if (threadMessages.length !== desktopPrevLen) {
    const grew = threadMessages.length - desktopPrevLen;
    setDesktopPrevLen(threadMessages.length);
    // Own sends force-scroll to the bottom anyway — don't flash the pill when
    // the newest arrival is the reader's own message (or echo).
    const newest = threadMessages[threadMessages.length - 1];
    const ownArrival = !!newest && newest.authorId === user?.uid;
    if (grew > 0 && !desktopPinned && !ownArrival) setDesktopNewCount((count) => count + grew);
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

  // Desktop smart auto-scroll (mobile owns its own inside MobileThread). Pure
  // DOM sync (no setState): opening/switching a channel jumps instantly to the
  // bottom; an own send/retry (signal bump) always smooth-scrolls; otherwise a
  // new message only scrolls when the reader is already pinned.
  const scrollContextRef = useRef('');
  useEffect(() => {
    const anchor = messagesEndRef.current;
    if (!anchor) return;
    const opening = scrollContextRef.current !== activeChannelId;
    const forced = desktopSignalRef.current !== scrollToBottomSignal;
    scrollContextRef.current = activeChannelId;
    desktopSignalRef.current = scrollToBottomSignal;
    if (opening) {
      anchor.scrollIntoView({ behavior: 'auto', block: 'end' });
    } else if (forced || desktopPinnedRef.current) {
      anchor.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [threadMessages.length, activeChannelId, scrollToBottomSignal]);

  const jumpToLatestDesktop = () => {
    setDesktopPinned(true);
    setDesktopNewCount(0);
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  // Flag <body> while the phone conversation is open so globals.css hides the
  // bottom nav and reclaims its reserved scroll room (composer owns the edge).
  useEffect(() => {
    if (mobileView !== 'thread') return;
    document.body.dataset.chatThread = 'on';
    return () => {
      delete document.body.dataset.chatThread;
    };
  }, [mobileView]);

  // POSTs an echo; on failure marks it 'failed' (retry flips it back). On success
  // the echo stays put until the realtime feed delivers the real message and
  // reconciliation drops it — no flicker. Attachment echoes take the SAME path as
  // text: an image echo first uploads its file (result cached on the echo so a
  // later message-POST retry won't re-upload), a GIF echo already carries its
  // Tenor attachment, and reconciliation matches on (authorId, text) exactly as
  // for text messages.
  const postMessage = useCallback(
    async (echo: ThreadMessage) => {
      setSending(true);
      setError('');
      try {
        let attachment: ChatAttachment | undefined =
          echo.uploadedAttachment ?? (echo.attachment?.type === 'gif' ? echo.attachment : undefined);
        if (echo.pendingFile && !attachment) {
          const prepared = await prepareImageForUpload(echo.pendingFile);
          // Publish prepared dimensions before the (slower) upload so the pending
          // tile reserves its box immediately and its decode causes no shift.
          if (prepared.width && prepared.height) {
            const { width: pw, height: ph } = prepared;
            setPendingMessages((prev) =>
              prev.map((p) =>
                p.id === echo.id ? { ...p, localPreviewWidth: pw, localPreviewHeight: ph } : p
              )
            );
          }
          attachment = await uploadChatImage(
            authedFetch,
            echo.channelId,
            prepared.file,
            prepared.width,
            prepared.height
          );
          const uploaded = attachment;
          setPendingMessages((prev) =>
            prev.map((p) => (p.id === echo.id ? { ...p, uploadedAttachment: uploaded } : p))
          );
        }
        const response = await authedFetch('/api/portal/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channelId: echo.channelId,
            text: echo.text,
            ...(attachment ? { attachment } : {}),
            // Reply rides the same send path; the server re-stamps the snippet.
            ...(echo.replyToMessageId ? { replyToMessageId: echo.replyToMessageId } : {}),
          }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to send message');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to send message');
        setPendingMessages((prev) =>
          prev.map((p) => (p.id === echo.id ? { ...p, pendingState: 'failed' as const } : p))
        );
      } finally {
        setSending(false);
      }
    },
    [authedFetch]
  );

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
      id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      channelId: activeChannelId,
      text: draft.trim(),
      authorId: user.uid,
      authorName: user.displayName,
      authorRole: getEffectiveRole(user) ?? undefined,
      createdAt: new Date(),
      reactionCounts: {},
      myReactions: [],
      pendingState: 'sending',
      ...stagedReplyFields(),
    };
    setPendingMessages((prev) => [...prev, echo]);
    setDraft('');
    setReplyTarget(null);
    setScrollToBottomSignal((tick) => tick + 1);
    void postMessage(echo);
  };

  // Base fields shared by every optimistic echo this user creates.
  const makeEchoBase = () => ({
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    channelId: activeChannelId,
    authorId: user!.uid,
    authorName: user!.displayName,
    authorRole: getEffectiveRole(user!) ?? undefined,
    createdAt: new Date(),
    reactionCounts: {},
    myReactions: [],
    pendingState: 'sending' as const,
  });

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

  const retryPending = (echo: ThreadMessage) => {
    setPendingMessages((prev) =>
      prev.map((p) => (p.id === echo.id ? { ...p, pendingState: 'sending' as const } : p))
    );
    setScrollToBottomSignal((tick) => tick + 1);
    void postMessage({ ...echo, pendingState: 'sending' });
  };

  const discardPending = (echoId: string) => {
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

  const roleLabel = isRole('admin')
    ? 'Admin'
    : isRole('operations')
      ? 'Operations'
      : canPin
        ? 'Manager'
        : 'Rep';
  const todayLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
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
    : 'No pinned message yet';
  const pinnedAuthor = pinnedMessage?.authorName;
  const pinnedTime = pinnedMessage ? formatTime(pinnedMessage.createdAt) : '';

  return (
    <ProtectedRoute permissions={['chat:read']}>
      <div className="chat-line-portal min-h-screen portal-canvas lg:flex lg:h-dvh lg:flex-col">
        <PortalHeader />
        <div className="flex min-h-0 lg:flex-1">
          <PortalSidebar />
          <main className="chat-line-main flex-1 min-h-0 overflow-hidden">
            <div className="chat-line-page">
              <header className="chat-line-masthead">
                <div className="chat-line-mark"><span aria-hidden="true" />3C WORLD GROUP / THE LINE</div>
                <p className="chat-line-mast-meta">Team chat · broadcast / {todayLabel}</p>
                <span className="chat-line-role-chip">{roleLabel}</span>
              </header>
              {shownError && <div className="chat-line-alert" role="alert">{shownError}</div>}
              <div className="chat-line-desktop">
                <aside className="chat-line-rail">
                  <p className="chat-line-kicker">Channel switcher / 01–{String(Math.max(channels.length, 1)).padStart(2, '0')}</p>
                  <h1 className="chat-line-rail-title">The line<br />chat</h1>
                  <div className="chat-line-channel-list">
                    {loadingChannels ? [0, 1, 2, 3].map((row) => <div className="chat-line-channel-skeleton" key={row} aria-hidden="true"><span /><span /><span /></div>) : channels.length === 0 ? <p className="chat-line-empty">No live channels yet. Ask an admin to sync chat channels.</p> : channels.map((channel, index) => {
                      const memberCount = channel.memberIds?.length ?? 0;
                      return <button key={channel.id} type="button" onClick={() => setActiveChannelId(channel.id)} className={`chat-line-channel ${channel.id === activeChannelId ? 'is-active' : ''}`}>
                        <span className="chat-line-channel-number">{String(index + 1).padStart(2, '0')}</span>
                        <span className="chat-line-channel-tick" />
                        <span className="chat-line-channel-copy"><strong>{channel.name}</strong><small>{channel.description}</small><span className="chat-line-channel-tail">{unreadByChannel[channel.id] && <i aria-label="Unread messages" />}{channel.audience.toUpperCase()} · {memberCount} member{memberCount === 1 ? '' : 's'}</span></span>
                      </button>;
                    })}
                  </div>
                  <p className="chat-line-rail-note"><strong>Signal discipline</strong><br />Keep customer details out of chat.<br /><br />No customer PII — never card numbers or SSNs.</p>
                </aside>
                <section className="chat-line-conversation">
                  <header className="chat-line-conversation-head">
                    <div className="chat-line-head-copy">
                      <button type="button" onClick={() => setInfoOpen(true)} disabled={!activeChannel} className="chat-line-title-button" aria-label="Channel details">
                        <p className="chat-line-kicker">{activeChannel ? `${String(channels.indexOf(activeChannel) + 1).padStart(2, '0')} / ${activeChannel.audience.toUpperCase()} / BROADCAST` : '— / CHANNEL / BROADCAST'}</p>
                        <h2 className="chat-line-display-title portal-metallic-num">{activeChannel?.name ?? 'Select a channel'}</h2>
                        <p className="chat-line-head-description">{activeChannel?.description ?? 'Choose a channel to view messages.'}</p>
                      </button>
                    </div>
                    <div className="chat-line-head-meta"><span className="chat-line-live">LIVE</span><span>{activeChannel ? `${activeChannel.memberIds?.length ?? 0} members` : '— members'}</span></div>
                  </header>
                  <div className="chat-line-pinned-band"><span className="chat-line-pinned-label"><Pin aria-hidden="true" /> PINNED</span><span className="chat-line-pinned-copy">{pinnedCopy || 'No pinned message yet'}{pinnedAuthor && <em> · {pinnedAuthor}</em>}</span><span className="chat-line-pinned-time">{pinnedTime}</span></div>
                  <div className="chat-line-message-stage">
                    <div ref={desktopScrollRef} className="chat-line-messages">
                      <div aria-hidden="true" className="chat-line-scroll-spacer" />
                      {loadingMessages ? <div className="chat-line-message-skeletons" aria-hidden="true">{[0, 1, 2, 3, 4].map((row) => <span key={row} />)}</div> : threadMessages.length === 0 ? <div className="chat-line-empty-message"><strong>No messages yet</strong><span>Start with a short update, question, or field note.</span></div> : displayMessages.map((message, index) => {
                        const previousMessage = displayMessages[index - 1];
                        const showDayDivider = !previousMessage || getLocalDayKey(previousMessage.createdAt) !== getLocalDayKey(message.createdAt);
                        const grouped = !!previousMessage && !showDayDivider && previousMessage.authorId === message.authorId && Math.abs((message.createdAt?.getTime() ?? 0) - (previousMessage.createdAt?.getTime() ?? 0)) <= 300000;
                        const isPending = !!message.pendingState;
                        const isFailed = message.pendingState === 'failed';
                        const isOwn = message.authorId === user?.uid;
                        const canEdit = isOwn && !!message.text;
                        const canDelete = canModerate || isOwn;
                        return <Fragment key={message.id}>
                          {showDayDivider && <div className="chat-line-day-divider"><span>{formatChatLineDayDivider(message.createdAt)}</span></div>}
                          <article className={`chat-line-message ${isOwn ? 'is-own' : ''} ${grouped ? 'is-grouped' : ''} ${isFailed ? 'is-failed' : ''} ${message.pendingState === 'sending' ? 'is-sending' : ''}`}>
                            <div className="chat-line-avatar-column">{grouped ? <span className="chat-line-avatar-spacer" aria-hidden="true" /> : isOwn ? <span className="chat-line-avatar chat-line-avatar-own" aria-hidden="true">{getInitials(message.authorName)}</span> : <ChatAvatar authorId={message.authorId} authorName={message.authorName} avatarUrl={authorAvatars[message.authorId]} size="sm" className="chat-line-avatar" />}</div>
                            <div className="chat-line-message-content">
                              <div className="chat-line-message-top"><strong style={isDeveloperAuthor(message.authorId) ? undefined : ({ '--an': getAuthorColor(message.authorId).name, '--an-dark': getAuthorColor(message.authorId).nameDark } as CSSProperties)} className={isDeveloperAuthor(message.authorId) ? 'chat-dev-name' : 'chat-line-author'}>{message.authorName}</strong>{isDeveloperAuthor(message.authorId) && <span className="chat-dev-badge">DEV</span>}{message.authorRole && <span className="chat-line-role">{message.authorRole.replace(/_/g, ' ')}</span>}<span className="chat-line-timestamp">{formatTime(message.createdAt)}</span></div>
                              <div className="chat-line-bubble-row">
                                <div className="chat-line-bubble">
                                  {message.isPinned && <span className="chat-line-pinned-mini"><Pin aria-hidden="true" /> PINNED</span>}
                                  {message.replyTo && <div className="chat-line-quote"><strong>{message.replyTo.authorName}</strong><span>{message.replyTo.text}</span></div>}
                                  <DesktopAttachment message={message} onOpen={() => openLightbox({ url: message.attachment?.url ?? message.localPreviewUrl ?? '', author: message.authorName, time: formatTime(message.createdAt) })} />
                                  {message.text && <p>{message.text}{message.editedAt && <span className="chat-line-edited"> (edited)</span>}</p>}
                                  {isPending ? isFailed ? <div className="chat-line-failed-actions"><button type="button" onClick={() => retryPending(message)}><RotateCw aria-hidden="true" /> Failed — tap to retry</button><button type="button" onClick={() => discardPending(message.id)} aria-label="Discard message"><X aria-hidden="true" /></button></div> : <span className="chat-line-message-status"><Clock aria-hidden="true" /> Sending…</span> : <ReactionBar channelId={activeChannelId} messageId={message.id} reactionCounts={message.reactionCounts} myReactions={message.myReactions} onError={setError} />}
                                </div>
                                {!isPending && <MessageActions triggerClassName="chat-line-message-actions" config={{ hasText: !!message.text, canEdit, canDelete, canPin, isPinned: !!message.isPinned, onReply: () => startReply(message), onCopy: () => copyMessageText(message.text), onEdit: () => startEdit(message), onDelete: () => deleteMessage(message.id), onTogglePin: () => void togglePin(message) }} />}
                              </div>
                            </div>
                          </article>
                        </Fragment>;
                      })}
                      <div ref={messagesEndRef} />
                    </div>
                    {desktopNewCount > 0 && <button type="button" onClick={jumpToLatestDesktop} className="chat-line-jump-pill">{desktopNewCount} new message{desktopNewCount > 1 ? 's' : ''} <ArrowDown aria-hidden="true" /></button>}
                  </div>
                  <div className="chat-line-composer-wrap">
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; onDesktopFilePicked(file); }} />
                    {attachFile && attachPreview && (
                      <div className="chat-line-attachment-preview">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={attachPreview} alt="Selected image preview" />
                        <span>{attachFile.name}</span>
                        <button type="button" onClick={clearDesktopAttachment} aria-label="Remove image"><X aria-hidden="true" /></button>
                      </div>
                    )}
                    {replyTarget && <div className="chat-line-compose-strip"><div><strong>REPLYING TO {replyTarget.authorName}</strong><span>{makeReplySnippet(replyTarget).text}</span></div><button type="button" onClick={cancelReply} aria-label="Cancel reply"><X aria-hidden="true" /></button></div>}
                    {editTarget && <div className="chat-line-compose-strip"><div><strong>EDITING MESSAGE</strong><span>{editTarget.text}</span></div><button type="button" onClick={cancelEdit} aria-label="Cancel edit"><X aria-hidden="true" /></button></div>}
                    <div className="chat-line-composer">
                      <button type="button" className="chat-line-tool" onClick={() => fileInputRef.current?.click()} disabled={!activeChannelId || !!editTarget} aria-label="Attach an image"><ImagePlus aria-hidden="true" /></button>
                      <Textarea value={draft} onChange={(event) => setDraft(event.target.value.slice(0, 1000))} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); if (editTarget) void saveEdit(); else handleDesktopSend(); } else if (event.key === 'Escape' && editTarget) { event.preventDefault(); cancelEdit(); } }} placeholder={editTarget ? 'Edit your message...' : 'Broadcast an update…'} disabled={!activeChannelId} rows={1} className="chat-line-textarea" />
                      {gifEnabled && <div className="chat-line-gif-wrap"><button type="button" className="chat-line-tool chat-line-gif-button" onClick={() => setGifOpen((open) => !open)} disabled={!activeChannelId || !!editTarget} aria-label="Add a GIF" aria-expanded={gifOpen}>GIF</button>{gifOpen && activeChannelId && <GifPicker authedFetch={authedFetch} onSelect={sendGif} onClose={() => setGifOpen(false)} />}</div>}
                      <button type="button" className="chat-line-send" onClick={editTarget ? () => void saveEdit() : handleDesktopSend} disabled={!activeChannelId || (editTarget ? !draft.trim() : !draft.trim() && !attachFile) || sending}>{sending ? <Loader2 aria-hidden="true" /> : editTarget ? <Check aria-hidden="true" /> : <Send aria-hidden="true" />}<span className="chat-line-send-label">{editTarget ? 'Save' : 'Send'}</span></button>
                    </div>
                    <div className="chat-line-composer-meta"><span>No customer PII — never card numbers or SSNs.</span><span>Enter to send · Shift + Enter for line break</span></div>
                  </div>
                </section>
              </div>
              <div className="chat-line-mobile">
                {mobileView === 'thread' ? <MobileThread pinnedMessage={pinnedMessage} channelNumber={activeChannel ? channels.indexOf(activeChannel) + 1 : 0} channel={activeChannel} channelId={activeChannelId} messages={displayMessages} authorAvatars={authorAvatars} loading={loadingMessages} error={shownError} currentUserId={user?.uid} canModerate={canModerate} canPin={canPin} draft={draft} sending={sending} gifEnabled={gifEnabled} authedFetch={authedFetch} messagesEndRef={mobileMessagesEndRef} scrollToBottomSignal={scrollToBottomSignal} formatTime={formatTime} replyTarget={replyTarget} editTarget={editTarget} replySnippet={makeReplySnippet} onBack={() => setMobileView('list')} onOpenInfo={() => setInfoOpen(true)} onDraftChange={setDraft} onSend={sendMessage} onSendImage={sendImage} onSendGif={sendGif} onOpenImage={openLightbox} onError={setError} onDelete={deleteMessage} onReactionError={setError} onRetryPending={retryPending} onDiscardPending={discardPending} onReply={startReply} onEdit={startEdit} onCopy={copyMessageText} onTogglePin={togglePin} onCancelReply={cancelReply} onCancelEdit={cancelEdit} onSaveEdit={saveEdit} /> : <MobileChannelList channels={channels} loading={loadingChannels} error={shownError} unreadByChannel={unreadByChannel} onOpenChannel={(channelId) => { setActiveChannelId(channelId); setMobileView('thread'); }} />}
              </div>
              <ChannelInfoSheet channel={activeChannel} open={infoOpen} onOpenChange={setInfoOpen} isAdmin={isRole('admin')} authedFetch={authedFetch} onOpenImage={openLightbox} lightboxOpen={!!lightbox} />
              <ChatLightbox image={lightbox} onClose={closeLightbox} />
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
