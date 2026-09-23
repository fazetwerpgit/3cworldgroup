'use client';

import { useEffect, useRef } from 'react';

// The installed app is backgrounded for hours and comes back to the same page.
// Pages that load once on mount call this so a rep reopening the app sees
// today's numbers, not the morning's. A quick glance away doesn't refetch.
export const RESUME_REFRESH_STALE_MS = 60_000;

/**
 * Calls `refresh` when the page becomes visible again (or is restored from the
 * back/forward cache) and it has been at least `staleMs` since mount or the
 * last resume refresh. `refresh` must reload quietly: keep the data on screen
 * and swap it when the new data arrives, never back to a skeleton.
 */
export function useRefreshOnResume(refresh: () => void, { enabled = true, staleMs = RESUME_REFRESH_STALE_MS } = {}) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    const maybe = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - last < staleMs) return;
      last = Date.now();
      refreshRef.current();
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) maybe();
    };
    document.addEventListener('visibilitychange', maybe);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      document.removeEventListener('visibilitychange', maybe);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [enabled, staleMs]);
}
