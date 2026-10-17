'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { firstThisSession, markPlayedThisSession } from '@/lib/motion/sessionOnce';
import { useAppVisible } from '@/lib/app/appVisibility';

const noSubscribe = () => () => {};

/**
 * True when this surface should play its entrance: the first time it shows,
 * with its content, in this browser session. Decided once, on the first render
 * where `ready` (the real content, not a skeleton) is true, and kept for the
 * life of the component, so a data refresh never replays it. Content that is
 * already there in the server HTML never animates (it is on screen already).
 * In the iOS app it also waits until the portal is on screen (not behind the
 * splash or Face ID lock), so the reveal is seen and its key is not spent unseen.
 */
export function useFirstReveal(key: string, ready: boolean): boolean {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  const visible = useAppVisible();
  const [reveal, setReveal] = useState<boolean | null>(null);
  let shown = reveal;
  if (reveal === null && ready && visible) {
    shown = hydrated && firstThisSession(key);
    setReveal(shown);
  }

  useEffect(() => {
    if (reveal) markPlayedThisSession(key);
  }, [reveal, key]);

  return shown === true;
}
