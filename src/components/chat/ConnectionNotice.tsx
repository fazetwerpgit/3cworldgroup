'use client';

import { RefreshCw, WifiOff } from 'lucide-react';
import type { ConnectionNotice as ConnectionNoticeState } from '@/lib/chat/reconnect';
import c from './chat.module.css';

/**
 * A small, calm status chip floated over the top of the thread while the chat
 * is actually disconnected (see useConnectionNotice for the delay that keeps a
 * quick resume from flashing it). Queued messages keep their own "Sending…".
 */
export function ConnectionNotice({ notice }: { notice: ConnectionNoticeState }) {
  return (
    <p className={c.connection} role="status" aria-live="polite" data-state={notice ?? undefined} hidden={!notice}>
      {notice === 'offline' ? (
        <>
          <WifiOff size={14} aria-hidden="true" />
          Offline · messages send when you&rsquo;re back
        </>
      ) : notice === 'reconnecting' ? (
        <>
          <RefreshCw size={14} aria-hidden="true" className={c.connectionSpin} />
          Reconnecting…
        </>
      ) : null}
    </p>
  );
}
