'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useChatChannels } from './useChatChannels';
import { useChatUnread } from './useChatUnread';

type ChannelsResult = ReturnType<typeof useChatChannels>;
type UnreadResult = ReturnType<typeof useChatUnread>;

/** The rep shell's live channel list and read receipts, shared with the chat page. */
export type SharedChat = { channels: ChannelsResult; unread: UnreadResult };

const SharedChatContext = createContext<SharedChat | null>(null);

/** Provided once by the rep shell, which already listens for the tab bar's unread dot. */
export function SharedChatProvider({ value, children }: { value: SharedChat; children: ReactNode }) {
  return <SharedChatContext.Provider value={value}>{children}</SharedChatContext.Provider>;
}

/**
 * The live channel list: the rep shell's when inside it (one Firestore
 * listener per session), otherwise this component's own listener.
 */
export function useSharedChatChannels(): ChannelsResult {
  const shared = useContext(SharedChatContext);
  const own = useChatChannels({ enabled: !shared });
  return shared ? shared.channels : own;
}

/**
 * Read receipts for these channels: the rep shell's when inside it (same uid
 * and list), otherwise this component's own listener.
 */
export function useSharedChatUnread(
  channels: Parameters<typeof useChatUnread>[0],
  uid: string | null | undefined
): UnreadResult {
  const shared = useContext(SharedChatContext);
  const own = useChatUnread(channels, shared ? null : uid);
  return shared ? shared.unread : own;
}
