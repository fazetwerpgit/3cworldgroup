'use client';

import type { RefObject } from 'react';
import { ChevronLeft, Hash, Lock, Send, Trash2 } from 'lucide-react';
import { ReactionBar } from '@/components/chat/ReactionBar';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { ChatMessageView } from '@/hooks/chat/useMessages';
import { ChatChannel } from '@/types';

const audienceCopy: Record<ChatChannel['audience'], string> = {
  all: 'Everyone',
  field: 'Field users',
  managers: 'Managers',
  platform: 'Admin/Ops',
};

interface MobileThreadProps {
  channel?: ChatChannel;
  channelId: string;
  messages: ChatMessageView[];
  loading: boolean;
  error?: string;
  currentUserId?: string;
  canModerate: boolean;
  draft: string;
  sending: boolean;
  deletingId: string | null;
  messagesEndRef: RefObject<HTMLDivElement | null>;
  formatTime: (date: Date | null) => string;
  onBack: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onDelete: (messageId: string) => void;
  onReactionError: (message: string) => void;
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
  draft,
  sending,
  deletingId,
  messagesEndRef,
  formatTime,
  onBack,
  onDraftChange,
  onSend,
  onDelete,
  onReactionError,
}: MobileThreadProps) {
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
        <div className="flex min-w-0 flex-1 items-center gap-2">
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
        </div>
      </div>

      {/* Message list — newest at the bottom. flex-col + mt-auto spacer
          bottom-anchors sparse conversations so the latest message sits just
          above the composer, chat-style. Vertical rhythm is per-message so
          grouped bubbles can tighten up (see mt-* below). */}
      <div className="flex flex-1 flex-col overflow-auto p-3">
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
            const canDelete = canModerate || isOwn;

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
                      className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-6 shadow-sm ${
                        isOwn
                          ? 'rounded-br-md bg-[#0A1F44] text-white'
                          : 'rounded-bl-md border border-slate-200 bg-white text-slate-700 dark:border-border dark:bg-card dark:text-slate-200'
                      }`}
                    >
                      {message.text}
                    </div>
                    {canDelete && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="size-7 shrink-0 text-slate-400 dark:text-muted-foreground hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                        onClick={() => onDelete(message.id)}
                        disabled={deletingId === message.id}
                        aria-label="Delete message"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    )}
                  </div>
                  {isLastOfGroup && (
                    <span
                      className={`mt-1 text-[11px] text-slate-400 dark:text-muted-foreground ${
                        isOwn ? 'px-1' : 'pl-9 pr-1'
                      }`}
                    >
                      {formatTime(message.createdAt)}
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
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <Alert className="mx-3 mb-2 w-auto border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Composer pinned to the bottom edge. */}
      <div className="border-t border-slate-200 dark:border-border bg-white dark:bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="flex items-end gap-2">
          <Textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value.slice(0, 1000))}
            onKeyDown={(event) => {
              // Enter sends; Shift+Enter inserts a newline.
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder={channel ? `Message ${channel.name}...` : 'Select a channel...'}
            disabled={!channelId}
            rows={1}
            className="max-h-32 min-h-[2.5rem] flex-1 resize-none"
          />
          <Button
            type="button"
            onClick={onSend}
            disabled={!channelId || !draft.trim() || sending}
            size="icon"
            className="size-10 shrink-0 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
            aria-label="Send message"
          >
            <Send className="size-4" />
          </Button>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-muted-foreground">
          Enter to send · Shift+Enter for a new line. No customer PII.
        </p>
      </div>
    </div>
  );
}
