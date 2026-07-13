'use client';

import { useEffect, useRef, useState } from 'react';
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
  forcePickerOpen?: boolean;
  onPickerOpenChange?: (open: boolean) => void;
  onError?: (message: string) => void;
}

/**
 * Slack-style reactions: only emojis that HAVE reactions render as compact
 * count chips; the full allowed set lives behind a quiet smiley button.
 *
 * Toggles are optimistic: a tap flips the visual state immediately and holds
 * it via a local overlay until the realtime props catch up (reconcile) or the
 * request fails (revert). The overlay maps an emoji to the intended "mine"
 * state; the shown count is derived from that against the base props.
 */
export function ReactionBar({
  channelId,
  messageId,
  reactionCounts,
  myReactions,
  forcePickerOpen = false,
  onPickerOpenChange,
  onError,
}: ReactionBarProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [overlay, setOverlay] = useState<Map<string, boolean>>(() => new Map());
  const inFlightRef = useRef<Set<string>>(new Set());

  // Reconcile: once the server-reflected props match an overlay's intended
  // state, drop that overlay entry so props take over. Keyed on myReactions so
  // other users' reactions (count-only changes) don't clear our pending flips.
  useEffect(() => {
    setOverlay((prev) => {
      if (prev.size === 0) return prev;
      let changed = false;
      const next = new Map(prev);
      for (const [emoji, mine] of prev) {
        if (myReactions.includes(emoji) === mine) {
          next.delete(emoji);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [myReactions]);

  useEffect(() => {
    if (forcePickerOpen) setPickerOpen(true);
  }, [forcePickerOpen]);

  const effectiveMine = (emoji: string) =>
    overlay.has(emoji) ? overlay.get(emoji)! : myReactions.includes(emoji);

  const effectiveCount = (emoji: string) => {
    const base = reactionCounts[emoji] ?? 0;
    if (!overlay.has(emoji)) return base;
    const optimisticMine = overlay.get(emoji)!;
    const serverMine = myReactions.includes(emoji);
    if (optimisticMine === serverMine) return base;
    return base + (optimisticMine ? 1 : -1);
  };

  const toggle = async (emoji: string) => {
    // Rapid re-taps on the same emoji during its own flight are ignored — the
    // visual has already flipped, so there is nothing more to show.
    if (inFlightRef.current.has(emoji)) return;
    inFlightRef.current.add(emoji);
    setPickerOpen(false);
    onPickerOpenChange?.(false);

    setOverlay((prev) => {
      const current = prev.has(emoji) ? prev.get(emoji)! : myReactions.includes(emoji);
      const next = new Map(prev);
      next.set(emoji, !current);
      return next;
    });

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
      // Revert this emoji's optimistic flip; props become the source of truth.
      setOverlay((prev) => {
        if (!prev.has(emoji)) return prev;
        const next = new Map(prev);
        next.delete(emoji);
        return next;
      });
      onError?.(error instanceof Error ? error.message : 'Failed to update reaction');
    } finally {
      inFlightRef.current.delete(emoji);
    }
  };

  const active = CHAT_REACTION_EMOJIS.filter(
    (emoji) => effectiveCount(emoji) > 0 || effectiveMine(emoji)
  );

  return (
    <div className={`chat-line-reactions mt-2 flex flex-wrap items-center gap-1.5 ${active.length > 0 ? 'chat-line-reactions-has' : 'chat-line-reactions-empty'} ${forcePickerOpen ? 'chat-line-reaction-picker-open' : ''}`} aria-label="Message reactions">
      {active.map((emoji) => {
        const count = effectiveCount(emoji);
        const mine = effectiveMine(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            aria-pressed={mine}
            title={mine ? 'Remove your reaction' : 'React'}
            className={`chat-line-reaction portal-num flex h-7 items-center gap-1 rounded-full border px-2 text-sm transition-colors duration-150 ${
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

      <DropdownMenu open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); onPickerOpenChange?.(open); }}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Add reaction"
            className="chat-line-add-reaction grid h-7 w-7 place-items-center rounded-full border border-transparent text-slate-400 transition-colors duration-150 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-600 dark:text-muted-foreground dark:hover:border-border dark:hover:bg-muted dark:hover:text-foreground"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={4} className="min-w-0 p-1.5">
          <div className="flex items-center gap-0.5">
            {CHAT_REACTION_EMOJIS.map((emoji) => {
              const mine = effectiveMine(emoji);
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
