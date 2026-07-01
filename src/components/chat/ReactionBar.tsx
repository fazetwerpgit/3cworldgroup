'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { auth } from '@/lib/firebase/config';
import { CHAT_REACTION_EMOJIS } from '@/lib/chat/reactions';

interface ReactionBarProps {
  channelId: string;
  messageId: string;
  reactionCounts: Record<string, number>;
  myReactions: string[];
  onError?: (message: string) => void;
}

export function ReactionBar({
  channelId,
  messageId,
  reactionCounts,
  myReactions,
  onError,
}: ReactionBarProps) {
  const [pendingEmoji, setPendingEmoji] = useState<string | null>(null);

  const toggle = async (emoji: string) => {
    if (pendingEmoji) return;
    setPendingEmoji(emoji);
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

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5" aria-label="Message reactions">
      {CHAT_REACTION_EMOJIS.map((emoji) => {
        const count = reactionCounts[emoji] ?? 0;
        const mine = myReactions.includes(emoji);
        return (
          <Button
            key={emoji}
            type="button"
            variant="outline"
            size="sm"
            onClick={() => toggle(emoji)}
            disabled={pendingEmoji !== null}
            aria-pressed={mine}
            className={`h-8 gap-1 rounded-full px-2 text-sm transition-colors ${
              mine
                ? 'border-[#8dc63f] bg-[#8dc63f]/10 text-[#0A1F44] ring-1 ring-[#8dc63f] dark:text-green-200'
                : 'border-slate-200 bg-white text-slate-600 hover:border-[#8dc63f]/60 hover:bg-[#8dc63f]/10 dark:border-border dark:bg-card dark:text-muted-foreground dark:hover:text-foreground'
            }`}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <span className="text-[11px] font-semibold">{count}</span>}
          </Button>
        );
      })}
    </div>
  );
}
