'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronDown, Clock, Hash, Lock, MessageSquareText, RotateCw, Send, Trash2, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { ChannelInfoSheet } from '@/components/chat/ChannelInfoSheet';
import { MobileChannelList } from '@/components/chat/MobileChannelList';
import { MobileThread } from '@/components/chat/MobileThread';
import type { ThreadMessage } from '@/components/chat/MobileThread';
import { ReactionBar } from '@/components/chat/ReactionBar';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useMessages } from '@/hooks/chat/useMessages';
import { auth } from '@/lib/firebase/config';
import { ChatChannel, getEffectiveRole } from '@/types';

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

export default function TeamChatPage() {
  const { user, hasPermission, isRole } = useAuth();
  const [activeChannelId, setActiveChannelId] = useState('');
  // Channel-info Sheet (shared by desktop header title + mobile thread top bar).
  const [infoOpen, setInfoOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');
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
  const shownError = error || channelsError || messagesError;

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
    authedFetch('/api/portal/chat/channels').catch((err) => {
      console.error('Error bootstrapping chat channels:', err);
    });
  }, [authedFetch, user]);

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

  // POSTs an echo's text; on failure marks that echo 'failed' (retry flips it
  // back). On success the echo stays put until the realtime feed delivers the
  // real message and reconciliation drops it — no flicker.
  const postMessage = useCallback(
    async (echo: ThreadMessage) => {
      setSending(true);
      setError('');
      try {
        const response = await authedFetch('/api/portal/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ channelId: echo.channelId, text: echo.text }),
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
    };
    setPendingMessages((prev) => [...prev, echo]);
    setDraft('');
    setScrollToBottomSignal((tick) => tick + 1);
    void postMessage(echo);
  };

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

  const deleteMessage = async (messageId: string) => {
    if (!user || !activeChannelId) return;
    setDeletingId(messageId);
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
    } finally {
      setDeletingId(null);
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

  return (
    <ProtectedRoute permissions={['chat:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto lg:p-6">
            {/* Desktop (lg+): the shipped side-by-side panel layout, unchanged. */}
            <div className="hidden lg:block">
              <div className="mx-auto max-w-[1500px] space-y-5">
                <PortalPageHeader
                  eyebrow="Team resources"
                  title="Team Chat"
                  description="Live text-only team channels for onboarding, training, and manager coordination — a free Firebase pilot with no media hosting or paid chat vendor."
                />

                {shownError && (
                  <Alert className="border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
                    <AlertDescription>{shownError}</AlertDescription>
                  </Alert>
                )}

                <div className="grid min-h-[680px] grid-cols-1 overflow-hidden rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card shadow-sm lg:grid-cols-[320px_1fr]">
                  <aside className="border-b border-slate-200 dark:border-border bg-slate-50 dark:bg-muted/70 lg:border-b-0 lg:border-r">
                    <div className="border-b border-slate-200 dark:border-border p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-slate-950 dark:text-foreground">
                        <MessageSquareText className="size-4 text-[#0A1F44] dark:text-foreground" />
                        Pilot Channels
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                        Latest 75 messages per channel to control read volume.
                      </p>
                    </div>
                    <div className="space-y-2 p-3">
                      {loadingChannels ? (
                        <div className="rounded-md border border-slate-200 dark:border-border bg-white dark:bg-card p-4 text-sm text-slate-500 dark:text-muted-foreground">
                          Loading channels...
                        </div>
                      ) : channels.length === 0 ? (
                        <div className="rounded-md border border-slate-200 dark:border-border bg-white dark:bg-card p-4 text-sm text-slate-500 dark:text-muted-foreground">
                          No live channels yet. Ask an admin to sync chat channels.
                        </div>
                      ) : (
                        channels.map((channel) => (
                          <button
                            key={channel.id}
                            type="button"
                            onClick={() => setActiveChannelId(channel.id)}
                            className={`w-full cursor-pointer rounded-md border p-3 text-left transition-colors duration-200 ${
                              channel.id === activeChannelId
                                ? 'border-[#8dc63f]/50 bg-[#8dc63f]/10 text-slate-950 dark:text-foreground'
                                : 'border-transparent bg-white dark:bg-card text-slate-700 dark:text-muted-foreground hover:border-slate-200 dark:hover:border-border'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-2 text-sm font-semibold">
                                {channel.audience === 'managers' ? (
                                  <Lock className="size-4 text-slate-500 dark:text-muted-foreground" />
                                ) : (
                                  <Hash className="size-4 text-slate-500 dark:text-muted-foreground" />
                                )}
                                {channel.name}
                              </span>
                              <Badge variant="secondary" className="text-[11px]">
                                {audienceCopy[channel.audience]}
                              </Badge>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-muted-foreground">
                              {channel.description}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </aside>

                  <section className="flex min-h-[680px] flex-col">
                    <div className="flex items-center justify-between border-b border-slate-200 dark:border-border p-4">
                      <div>
                        <button
                          type="button"
                          onClick={() => setInfoOpen(true)}
                          disabled={!activeChannel}
                          aria-label="Channel details"
                          className="flex min-h-10 items-center gap-1.5 rounded-md text-left font-semibold text-slate-950 dark:text-foreground hover:text-[#0A1F44] disabled:cursor-default disabled:hover:text-slate-950 dark:hover:text-white dark:disabled:hover:text-foreground"
                        >
                          {activeChannel?.name ?? 'Select a channel'}
                          {activeChannel && (
                            <ChevronDown className="size-4 shrink-0 text-slate-400 dark:text-muted-foreground" />
                          )}
                        </button>
                        <p className="mt-1 text-xs text-slate-500 dark:text-muted-foreground">
                          {activeChannel?.description ?? 'Choose a channel to view messages.'}
                        </p>
                      </div>
                      <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-600 dark:text-muted-foreground">
                        {messages.length} shown
                      </Badge>
                    </div>

                    {/* relative wrapper hosts the floating jump-to-latest pill. */}
                    <div className="relative flex flex-1 flex-col overflow-hidden">
                    <div
                      ref={desktopScrollRef}
                      className="flex flex-1 flex-col overflow-auto bg-[linear-gradient(rgba(10,31,68,.025)_1px,transparent_1px),linear-gradient(90deg,rgba(10,31,68,.025)_1px,transparent_1px)] bg-[size:24px_24px] p-4 [&>*+*]:mt-3"
                    >
                      {/* mt-auto spacer bottom-anchors sparse conversations. */}
                      <div aria-hidden="true" className="mt-auto" />
                      {loadingMessages ? (
                        <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card/90 py-0 shadow-sm">
                          <CardContent className="p-5 text-sm text-slate-500 dark:text-muted-foreground">
                            Loading messages...
                          </CardContent>
                        </Card>
                      ) : threadMessages.length === 0 ? (
                        <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card/90 py-0 text-center shadow-sm">
                          <CardHeader className="border-b border-slate-100 dark:border-border p-5">
                            <CardTitle className="text-base">No messages yet</CardTitle>
                          </CardHeader>
                          <CardContent className="p-5 text-sm text-slate-500 dark:text-muted-foreground">
                            Start with a short update, question, or field note.
                          </CardContent>
                        </Card>
                      ) : (
                        threadMessages.map((message) => {
                          const isPending = !!message.pendingState;
                          const isFailed = message.pendingState === 'failed';
                          // Echoes block delete/reactions until they resolve.
                          const canDelete =
                            !isPending && (canModerate || message.authorId === user?.uid);
                          return (
                            <div
                              key={message.id}
                              className={`group rounded-md border bg-white p-4 shadow-sm portal-motion dark:bg-card/95 ${
                                isFailed
                                  ? 'border-red-300 dark:border-red-500/40'
                                  : 'border-slate-200 hover:border-slate-300 dark:border-border dark:hover:border-white/25'
                              } ${message.pendingState === 'sending' ? 'opacity-70' : ''}`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-semibold text-slate-950 dark:text-foreground">
                                      {message.authorName}
                                    </span>
                                    {message.authorRole && (
                                      <Badge variant="secondary" className="text-[11px]">
                                        {message.authorRole.replace('_', ' ')}
                                      </Badge>
                                    )}
                                    <span className="text-xs text-slate-500 dark:text-muted-foreground">
                                      {formatTime(message.createdAt)}
                                    </span>
                                  </div>
                                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">
                                    {message.text}
                                  </p>
                                  {isPending ? (
                                    isFailed ? (
                                      <div className="mt-2 flex items-center gap-3">
                                        <button
                                          type="button"
                                          onClick={() => retryPending(message)}
                                          className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                                        >
                                          <RotateCw className="size-3" />
                                          Failed — tap to retry
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => discardPending(message.id)}
                                          aria-label="Discard message"
                                          className="text-slate-400 hover:text-red-600 dark:text-muted-foreground dark:hover:text-red-400"
                                        >
                                          <X className="size-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <span className="mt-2 flex items-center gap-1 text-xs text-slate-400 dark:text-muted-foreground">
                                        <Clock className="size-3" />
                                        Sending…
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
                                {canDelete && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 shrink-0 text-slate-400 dark:text-muted-foreground opacity-100 hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/15 dark:hover:text-red-300 sm:opacity-0 sm:group-hover:opacity-100"
                                    onClick={() => deleteMessage(message.id)}
                                    disabled={deletingId === message.id}
                                    aria-label="Delete message"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Jump-to-latest pill — only while scrolled up with unseen messages. */}
                    {desktopNewCount > 0 && (
                      <button
                        type="button"
                        onClick={jumpToLatestDesktop}
                        className="portal-motion absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[#8dc63f] px-4 py-1.5 text-xs font-semibold text-[#0A1F44] shadow-lg shadow-black/10 hover:bg-[#7ab82e] dark:shadow-black/40"
                      >
                        {desktopNewCount} new message{desktopNewCount > 1 ? 's' : ''}
                        <ArrowDown className="size-3.5" />
                      </button>
                    )}
                    </div>

                    <div className="border-t border-slate-200 dark:border-border bg-white dark:bg-card p-4">
                      <div className="flex flex-col gap-3">
                        <Textarea
                          value={draft}
                          onChange={(event) => setDraft(event.target.value.slice(0, 1000))}
                          onKeyDown={(event) => {
                            // Enter sends; Shift+Enter inserts a newline.
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              sendMessage();
                            }
                          }}
                          placeholder={
                            activeChannel
                              ? `Message ${activeChannel.name}...`
                              : 'Select a channel to send a message...'
                          }
                          disabled={!activeChannelId}
                          rows={3}
                          className="resize-none"
                        />
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-slate-500 dark:text-muted-foreground">
                            Enter to send · Shift+Enter for a new line. No customer PII, card numbers, or SSNs.
                          </p>
                          <Button
                            type="button"
                            onClick={sendMessage}
                            disabled={!activeChannelId || !draft.trim() || sending}
                            className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                          >
                            <Send className="size-4" />
                            Send
                          </Button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>

            {/* Mobile (< lg): Connecteam-style two-screen — channel list, then a
                full-screen conversation with a back arrow. */}
            <div className="lg:hidden">
              {mobileView === 'thread' ? (
                <MobileThread
                  channel={activeChannel}
                  channelId={activeChannelId}
                  messages={threadMessages}
                  loading={loadingMessages}
                  error={shownError}
                  currentUserId={user?.uid}
                  canModerate={canModerate}
                  draft={draft}
                  sending={sending}
                  deletingId={deletingId}
                  messagesEndRef={mobileMessagesEndRef}
                  scrollToBottomSignal={scrollToBottomSignal}
                  formatTime={formatTime}
                  onBack={() => setMobileView('list')}
                  onOpenInfo={() => setInfoOpen(true)}
                  onDraftChange={setDraft}
                  onSend={sendMessage}
                  onDelete={deleteMessage}
                  onReactionError={setError}
                  onRetryPending={retryPending}
                  onDiscardPending={discardPending}
                />
              ) : (
                <MobileChannelList
                  channels={channels}
                  loading={loadingChannels}
                  error={shownError}
                  onOpenChannel={(channelId) => {
                    setActiveChannelId(channelId);
                    setMobileView('thread');
                  }}
                />
              )}
            </div>

            {/* Channel-info Sheet — opened from the desktop header title or the
                mobile thread top bar; members fetched lazily on open. */}
            <ChannelInfoSheet
              channel={activeChannel}
              open={infoOpen}
              onOpenChange={setInfoOpen}
              isAdmin={isRole('admin')}
              authedFetch={authedFetch}
            />
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
