'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import { markChannelRead } from './useChatUnread';

// Minimum gap between two receipts for the same channel while it stays open.
export const MARK_READ_THROTTLE_MS = 2000;

function subscribeVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

/** Whether the page is on screen. False during SSR, so nothing marks before hydration. */
export function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    () => document.visibilityState === 'visible',
    () => false
  );
}

/**
 * Marks the open channel read on open, and again as new messages arrive while
 * it is being viewed — throttled so a burst doesn't hammer writes (a trailing
 * write captures the final state). Switching channels marks immediately.
 *
 * Only while the page is visible: a thread left open in a backgrounded tab or a
 * suspended home-screen app is not being read, so it must not write receipts
 * (they now drive "Read by"). Coming back to the page marks once.
 */
export function useMarkChannelRead(
  uid: string | null | undefined,
  channelId: string,
  latestMessageAt: number
): void {
  const visible = useDocumentVisible();
  const lastRef = useRef<{ channelId: string; at: number }>({ channelId: '', at: 0 });

  useEffect(() => {
    if (!uid || !channelId || !visible) return;
    const mark = () => {
      lastRef.current = { channelId, at: Date.now() };
      void markChannelRead(uid, channelId);
    };
    const now = Date.now();
    const last = lastRef.current;
    if (last.channelId !== channelId || now - last.at >= MARK_READ_THROTTLE_MS) {
      mark();
      return;
    }
    // Within the throttle window: one trailing write so the last message in a
    // burst is still acknowledged.
    const timer = setTimeout(mark, MARK_READ_THROTTLE_MS - (now - last.at));
    return () => clearTimeout(timer);
  }, [uid, channelId, latestMessageAt, visible]);
}
