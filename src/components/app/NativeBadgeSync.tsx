'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread } from '@/hooks/chat/useChatUnread';
import { countUnread, sendNativeBadge } from '@/lib/app/shellExtras';

// Inside the 3C iOS app only (AppBridgeHost mounts it for a signed-in person):
// reports the number of unread chat channels as the app icon badge whenever it
// changes. Reads the same hooks as the tab bar's unread dot. Renders nothing.
export default function NativeBadgeSync() {
  const { user } = useAuth();
  const { channels } = useChatChannels();
  const { unreadByChannel } = useChatUnread(channels, user?.uid);
  const count = countUnread(unreadByChannel);

  useEffect(() => {
    sendNativeBadge(count);
  }, [count]);

  return null;
}
