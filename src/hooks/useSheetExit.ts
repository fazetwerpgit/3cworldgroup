'use client';

import { useEffect, useState } from 'react';

function reducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Keeps a sheet on screen for its closing animation. `rendered` stays true for
 * `exitMs` after `open` turns false, with `closing` set, so the sheet can play
 * its exit (the CSS keys off data-closing). Reduced motion closes at once.
 */
export function useSheetExit(open: boolean, exitMs = 180): { rendered: boolean; closing: boolean } {
  const [closing, setClosing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    setClosing(!open && !reducedMotion());
  }

  useEffect(() => {
    if (!closing) return;
    const timer = setTimeout(() => setClosing(false), exitMs);
    return () => clearTimeout(timer);
  }, [closing, exitMs]);

  return { rendered: open || closing, closing: !open && closing };
}
