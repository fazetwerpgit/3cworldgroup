'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { PAGE_DATA_FALLBACK_MS, waitForPageData } from '@/lib/cache/pageData';

const HEARTBEAT_MS = 60_000;

// Stamps the current user's lastActiveAt on mount and every 60s while the tab is
// visible, powering the "who's active" green dot. Best-effort — failures are ignored.
export function usePresenceHeartbeat({ enabled = true }: { enabled?: boolean } = {}) {
  const { user } = useAuth();
  // Keyed on the account, not the user object: a profile refresh is not a new session.
  const uid = user?.uid ?? null;

  useEffect(() => {
    if (!uid || !enabled) return;
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const ping = async () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      try {
        const token = await auth?.currentUser?.getIdToken();
        if (!token) return;
        await fetch('/api/portal/presence', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        // best-effort; ignore
      }
    };

    // The beat runs only while the page is visible; hidden, it stops.
    const start = () => {
      if (interval === null) interval = setInterval(ping, HEARTBEAT_MS);
    };
    const stop = () => {
      if (interval !== null) clearInterval(interval);
      interval = null;
    };

    // The first ping waits for the page's own data (a cold open on LTE).
    const firstPing = new AbortController();
    let started = false;
    void waitForPageData({ fallbackMs: PAGE_DATA_FALLBACK_MS, signal: firstPing.signal }).then(() => {
      if (cancelled) return;
      started = true;
      void ping();
      if (document.visibilityState === 'visible') start();
    });
    // Ping immediately when the tab becomes visible again, so the dot refreshes fast.
    const onVisible = () => {
      if (!started) return;
      if (document.visibilityState === 'visible') {
        void ping();
        start();
      } else {
        stop();
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      firstPing.abort();
      stop();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid, enabled]);
}
