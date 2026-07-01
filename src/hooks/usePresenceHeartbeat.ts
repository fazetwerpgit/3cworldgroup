'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

const HEARTBEAT_MS = 60_000;

// Stamps the current user's lastActiveAt on mount and every 60s while the tab is
// visible, powering the "who's active" green dot. Best-effort — failures are ignored.
export function usePresenceHeartbeat() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

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

    ping();
    const interval = setInterval(ping, HEARTBEAT_MS);
    // Ping immediately when the tab becomes visible again, so the dot refreshes fast.
    const onVisible = () => {
      if (document.visibilityState === 'visible') ping();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);
}
