'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { firstThisSession, markPlayedThisSession } from '@/lib/motion/sessionOnce';

const noSubscribe = () => () => {};

/**
 * True when this surface should play its entrance: the first time it shows,
 * with its content, in this browser session. Decided once, on the first render
 * where `ready` (the real content, not a skeleton) is true, and kept for the
 * life of the component, so a data refresh never replays it. Content that is
 * already there in the server HTML never animates (it is on screen already).
 */
export function useFirstReveal(key: string, ready: boolean): boolean {
  const hydrated = useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false
  );
  const [reveal, setReveal] = useState<boolean | null>(null);
  let shown = reveal;
  if (reveal === null && ready) {
    shown = hydrated && firstThisSession(key);
    setReveal(shown);
  }

  useEffect(() => {
    if (reveal) markPlayedThisSession(key);
  }, [reveal, key]);

  return shown === true;
}
