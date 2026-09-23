'use client';

import { useEffect, useState } from 'react';
import { CONNECTION_NOTICE_DELAY_MS, connectionNotice, type ConnectionNotice } from '@/lib/chat/reconnect';

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine !== false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
}

/**
 * The connection notice the chat thread should show: 'offline' or
 * 'reconnecting' only once that state has held for CONNECTION_NOTICE_DELAY_MS,
 * and cleared the moment the connection is back, so a quick resume never
 * flashes a banner.
 */
export function useConnectionNotice(fromCache: boolean, rendered: boolean): {
  notice: ConnectionNotice;
  online: boolean;
} {
  const online = useOnline();
  const target = connectionNotice({ online, fromCache, rendered });
  // The last notice that has held for the full delay. Once armed, the wording
  // follows the live state (offline → reconnecting) without another wait; it
  // disarms the moment the connection is back.
  const [armed, setArmed] = useState<ConnectionNotice>(null);
  if (target === null && armed !== null) setArmed(null);

  useEffect(() => {
    if (target === null) return;
    const timer = window.setTimeout(() => setArmed(target), CONNECTION_NOTICE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [target]);

  return { notice: armed === null ? null : target, online };
}
