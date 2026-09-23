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
import c from './chat.module.css';

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
    <div
      className={`${c.reactions} ${active.length > 0 ? '' : c.reactionsEmpty} ${forcePickerOpen || pickerOpen ? c.pickerOpen : ''}`}
      aria-label="Message reactions"
    >
      {active.map((emoji) => {
        const count = effectiveCount(emoji);
        const mine = effectiveMine(emoji);
        return (
          <button
            key={emoji}
            type="button"
            onClick={() => toggle(emoji)}
            aria-pressed={mine}
            aria-label={`${emoji} ${count}${mine ? ', remove your reaction' : ', react'}`}
            className={`${c.reaction} ${mine ? c.reactionMine : ''}`}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <span aria-hidden="true">{count}</span>}
          </button>
        );
      })}

      <DropdownMenu open={pickerOpen} onOpenChange={(open) => { setPickerOpen(open); onPickerOpenChange?.(open); }}>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Add reaction" className={c.addReaction}>
            <SmilePlus size={18} aria-hidden="true" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={6} className={c.picker}>
          <div className={c.pickerRow}>
            {CHAT_REACTION_EMOJIS.map((emoji) => {
              const mine = effectiveMine(emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => toggle(emoji)}
                  aria-pressed={mine}
                  aria-label={`React with ${emoji}`}
                  className={`${c.pickerEmoji} ${mine ? c.pickerEmojiMine : ''}`}
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
