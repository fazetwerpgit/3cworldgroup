'use client';

import { useState } from 'react';
import { SmilePlus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { auth } from '@/lib/firebase/config';
import { CHAT_REACTION_EMOJIS } from '@/lib/chat/reactions';

interface ReactionBarProps {
  channelId: string;
  messageId: string;
  reactionCounts: Record<string, number>;
  myReactions: string[];
  onError?: (message: string) => void;
}

/**
 * Slack-style reactions: only emojis that HAVE reactions render as compact
 * count chips; the full allowed set lives behind a quiet smiley button.
 */
export function ReactionBar({
  channelId,
  messageId,
  reactionCounts,
  myReactions,
  onError,
}: ReactionBarProps) {
  const [pendingEmoji, setPendingEmoji] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const toggle = async (emoji: string) => {
    if (pendingEmoji) return;
    setPendingEmoji(emoji);
    setPickerOpen(false);
    try {
      const token = await auth?.currentUser?.getIdToken();
      const response = await fetch('/api/portal/chat/reactions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token ?? ''}`,
        },
        body: JSON.stringify({ channelId, messageId, emoji }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to update reaction');
    } catch (error) {
      onError?.(error instanceof Error ? error.message : 'Failed to update reaction');
    } finally {
      setPendingEmoji(null);
    }
  };

  const active = CHAT_REACTION_EMOJIS.filter(
    (emoji) => (reactionCounts[emoji] ?? 0) > 0 || myReactions.includes(emoji)
  );

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Message reactions">
      {active.map((emoji) => {
        const count = reactionCounts[emoji] ?? 0;
        const mine = myReactions.includes(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            disabled={pendingEmoji !== null}
            aria-pressed={mine}
            title={mine ? 'Remove your reaction' : 'React'}
            className={`portal-num flex h-7 items-center gap-1 rounded-full border px-2 text-sm transition-colors duration-150 disabled:opacity-60 ${
              mine
                ? 'border-[#8dc63f]/60 bg-[#8dc63f]/10 text-[#3f6212] dark:bg-[#8dc63f]/15 dark:text-[#d7ecc0]'
                : 'border-slate-200 bg-white text-slate-600 hover:border-[#8dc63f]/50 hover:bg-[#8dc63f]/5 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:text-foreground'
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <span className="text-[11px] font-semibold">{count}</span>}
          </button>
        );
      })}

      <DropdownMenu open={pickerOpen} onOpenChange={setPickerOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={pendingEmoji !== null}
            aria-label="Add reaction"
            className="grid h-7 w-7 place-items-center rounded-full border border-transparent text-slate-400 transition-colors duration-150 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-600 dark:text-muted-foreground dark:hover:border-border dark:hover:bg-muted dark:hover:text-foreground"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="min-w-0 p-1.5">
          <div className="flex items-center gap-0.5">
            {CHAT_REACTION_EMOJIS.map((emoji) => {
              const mine = myReactions.includes(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggle(emoji)}
                  aria-pressed={mine}
                  aria-label={`React with ${emoji}`}
                  className={`grid h-9 w-9 place-items-center rounded-md text-lg transition-transform duration-150 hover:scale-110 hover:bg-slate-100 dark:hover:bg-muted ${
                    mine ? 'bg-[#8dc63f]/15' : ''
                  }`}
                >
                  {emoji}
                </button>
              );
            })}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
