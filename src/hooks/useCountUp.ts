'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animates a number from 0 to `target` once on mount (~500ms, ease-out).
 * Honors prefers-reduced-motion by snapping straight to the target.
 * Re-runs only when the target itself changes.
 */
export function useCountUp(target: number, durationMs = 500): number {
  const [value, setValue] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    const snap =
      typeof window === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      target === 0;
    if (snap) {
      frame.current = requestAnimationFrame(() => setValue(target));
      return () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      };
    }

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(target * eased));
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, durationMs]);

  return value;
}
