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
    <div className="flex h-[calc(100dvh-4rem)] flex-col bg-slate-50 dark:bg-muted/40">
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

      {/* Message list — newest at the bottom. */}
      <div className="flex-1 space-y-3 overflow-auto p-3">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-muted-foreground">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-muted-foreground">
            Start with a short update, question, or field note.
          </p>
        ) : (
          messages.map((message) => {
            const isOwn = message.authorId === currentUserId;
            const canDelete = canModerate || isOwn;
            return (
              <div key={message.id} className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}>
                {!isOwn && (
                  <div className="mb-1 flex flex-wrap items-center gap-2 px-1">
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
                <span className="mt-1 px-1 text-[11px] text-slate-400 dark:text-muted-foreground">
                  {formatTime(message.createdAt)}
                </span>
                <div className={`flex w-full ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <ReactionBar
                    channelId={channelId}
                    messageId={message.id}
                    reactionCounts={message.reactionCounts}
                    myReactions={message.myReactions}
                    onError={onReactionError}
                  />
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
            disabled={!channelId || sending}
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
