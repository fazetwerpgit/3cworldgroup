'use client';

import { useEffect, useRef, useState } from 'react';

export interface CountUpOptions {
  /** Length of the count, ease-out. */
  durationMs?: number;
  /**
   * sessionStorage key: count once per browser session on this surface, then
   * show the value outright. Omitted, it counts on every mount.
   */
  sessionKey?: string;
}

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Whether a count should play now. Reads only; the flag is written once it starts. */
function shouldCount(sessionKey: string | undefined): boolean {
  if (typeof window === 'undefined' || reducedMotion()) return false;
  if (!sessionKey) return true;
  try {
    return window.sessionStorage.getItem(sessionKey) === null;
  } catch {
    return false;
  }
}

function markCounted(sessionKey: string | undefined) {
  if (!sessionKey) return;
  try {
    window.sessionStorage.setItem(sessionKey, '1');
  } catch {
    // Storage blocked: nothing to remember it by, and nothing breaks.
  }
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Counts a number up from 0 to `target` once, on mount (~600ms, ease-out).
 * Mount the numeral only once the real value has loaded, so the count never
 * starts from a loading placeholder. A later change of `target` (a data
 * refresh) shows the new value at once, with no second count. Reduced motion,
 * an already-counted `sessionKey`, or blocked storage show the value outright.
 */
export function useCountUp(target: number, { durationMs = 600, sessionKey }: CountUpOptions = {}): number {
  // Decided once, at mount: the value the count is for, or null for no count.
  const [countFor] = useState<number | null>(() => (shouldCount(sessionKey) ? target : null));
  const [shown, setShown] = useState<number | null>(countFor === null ? null : 0);
  const start = useRef<number | null>(null);
  const counting = countFor !== null && countFor === target;

  useEffect(() => {
    if (!counting) return;
    markCounted(sessionKey);
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
