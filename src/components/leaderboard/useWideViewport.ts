'use client';

import { useCallback, useSyncExternalStore } from 'react';

/** The one breakpoint the leaderboard route splits on. It matches the portal
 *  rail's own breakpoint in globals.css: at 1024px the rail appears and the
 *  page becomes a desktop page. */
export const WIDE_VIEWPORT = '(min-width: 1024px)';

/** True while the window is desktop-width.
 *
 *  Read through useSyncExternalStore rather than an effect, so the first render
 *  already knows the answer and neither tree is built and then thrown away. The
 *  route's ProtectedRoute renders a spinner until Firebase auth resolves, so
 *  this component tree never exists in the server HTML and the server snapshot
 *  below is only a formality. The layout itself is gated in CSS as well, which
 *  is what holds if scripting is slow or absent. */
export function useWideViewport(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || !window.matchMedia) return () => {};
    const query = window.matchMedia(WIDE_VIEWPORT);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== 'undefined' && !!window.matchMedia ? window.matchMedia(WIDE_VIEWPORT).matches : false),
    () => false
  );
}
