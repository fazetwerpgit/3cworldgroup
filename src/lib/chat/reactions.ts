export const CHAT_REACTION_EMOJIS = ['🔥', '👏', '💰', '🎉', '🙌', '✅', '❤️', '😂'] as const;

export type ChatReactionEmoji = (typeof CHAT_REACTION_EMOJIS)[number];

export interface ChatReactionState {
  reactionCounts?: Record<string, number>;
  reactions?: Record<string, string[]>;
}

export function isAllowedChatReactionEmoji(emoji: string): emoji is ChatReactionEmoji {
  return (CHAT_REACTION_EMOJIS as readonly string[]).includes(emoji);
}

export function toggleReaction(
  current: ChatReactionState,
  emoji: string,
  uid: string
): { reactionCounts: Record<string, number>; reactions: Record<string, string[]> } {
  const nextReactions: Record<string, string[]> = {};
  const sourceReactions = current.reactions ?? {};

  for (const [key, rawUids] of Object.entries(sourceReactions)) {
    if (!isAllowedChatReactionEmoji(key)) continue;
    const uniqueUids = Array.from(
      new Set((Array.isArray(rawUids) ? rawUids : []).filter((value) => typeof value === 'string'))
    ).slice(0, 50);
    if (uniqueUids.length > 0) nextReactions[key] = uniqueUids;
  }

  if (!isAllowedChatReactionEmoji(emoji)) {
    return {
      reactions: nextReactions,
      reactionCounts: countReactions(nextReactions),
    };
  }

  const currentUids = nextReactions[emoji] ?? [];
  if (currentUids.includes(uid)) {
    const withoutUid = currentUids.filter((value) => value !== uid);
    if (withoutUid.length > 0) {
      nextReactions[emoji] = withoutUid;
    } else {
      delete nextReactions[emoji];
    }
  } else {
    nextReactions[emoji] = [...currentUids, uid].slice(0, 50);
  }

  return {
    reactions: nextReactions,
    reactionCounts: countReactions(nextReactions),
  };
}

function countReactions(reactions: Record<string, string[]>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(reactions)
      .map(([emoji, uids]) => [emoji, uids.length] as const)
      .filter(([, count]) => count > 0)
  );
}
