'use client';

import { useEffect, useRef, useState } from 'react';
import { firstThisSession, markPlayedThisSession, motionAllowed } from '@/lib/motion/sessionOnce';
import { useAppVisible } from '@/lib/app/appVisibility';

export interface CountUpOptions {
  /** Length of the count, ease-out. */
  durationMs?: number;
  /**
   * sessionStorage key: count once per browser session on this surface, then
   * show the value outright. Omitted, it counts on every mount.
   */
  sessionKey?: string;
}

/** Whether a count should play now. Reads only; the flag is written once it starts. */
function shouldCount(sessionKey: string | undefined): boolean {
  return sessionKey ? firstThisSession(sessionKey) : motionAllowed();
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a number up from 0 to `target` once, on mount (~600ms, ease-out).
 * Mount the numeral only once the real value has loaded, so the count never
 * starts from a loading placeholder. A later change of `target` (a data
 * refresh) shows the new value at once, with no second count. Reduced motion,
 * an already-counted `sessionKey`, or blocked storage show the value outright.
 * In the iOS app the decision waits until the portal is on screen (not behind
 * the splash or Face ID lock); until then the value shows outright, unseen.
 */
export function useCountUp(target: number, { durationMs = 600, sessionKey }: CountUpOptions = {}): number {
  const visible = useAppVisible();
  // Decided once, at mount (or when the app first shows the portal): the value
  // the count is for, or null for no count. undefined = not decided yet.
  const [countFor, setCountFor] = useState<number | null | undefined>(() =>
    visible ? (shouldCount(sessionKey) ? target : null) : undefined
  );
  const [shown, setShown] = useState<number | null>(countFor === null || countFor === undefined ? null : 0);
  if (countFor === undefined && visible) {
    const decided = shouldCount(sessionKey) ? target : null;
    setCountFor(decided);
    setShown(decided === null ? null : 0);
  }
  const start = useRef<number | null>(null);
  const counting = countFor !== null && countFor === target;

  useEffect(() => {
    if (!counting) return;
    if (sessionKey) markPlayedThisSession(sessionKey);
    let frame = requestAnimationFrame(function tick(now) {
      start.current ??= now;
      const t = Math.min(1, (now - start.current) / durationMs);
      setShown(t >= 1 ? null : Math.round(target * easeOut(t)));
      if (t < 1) frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [counting, target, durationMs, sessionKey]);

  return counting && shown !== null ? shown : target;
}
