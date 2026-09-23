'use client';

import { useEffect } from 'react';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { shouldCycleNetwork, type ResumeReason } from '@/lib/chat/reconnect';

// Wakes every Firestore listener in the portal (chat messages, the channel list,
// unread receipts behind the tab-bar dot) when the installed app comes back from
// the background. iOS freezes a backgrounded PWA and the watch stream underneath
// the listeners is usually dead by the time it resumes, but the SDK only notices
// after a long timeout, so the chat looks frozen until a manual reload.
//
// The fix is one disableNetwork/enableNetwork cycle on resume rather than
// resubscribing each hook: it rebuilds the single shared stream, every active
// listener re-attaches with its resume token (only changed docs are re-read),
// and no hook has to know about app lifecycle. Renders nothing.
export default function FirestoreResumeGuard() {
  useEffect(() => {
    const firestore = db;
    if (!firestore) return;
    let hiddenAt = document.visibilityState === 'hidden' ? Date.now() : 0;
    let lastCycleAt = 0;
    let cycling: Promise<void> | null = null;

    const resume = (reason: ResumeReason) => {
      const now = Date.now();
      const decision = shouldCycleNetwork({
        reason,
        hiddenForMs: hiddenAt ? now - hiddenAt : 0,
        sinceLastCycleMs: now - lastCycleAt,
        online: navigator.onLine !== false,
      });
      // 'online' can fire while still hidden; keep the hidden clock for the
      // visibilitychange that follows.
      if (reason !== 'online') hiddenAt = 0;
      if (!decision || cycling) return;
      lastCycleAt = now;
      cycling = disableNetwork(firestore)
        .then(() => enableNetwork(firestore))
        .catch((error) => {
          console.error('Firestore reconnect failed:', error);
          // Never leave the client offline because the cycle threw halfway.
          return enableNetwork(firestore).catch(() => undefined);
        })
        .finally(() => {
          cycling = null;
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else {
        resume('visible');
      }
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) resume('pageshow');
    };
    const onOnline = () => resume('online');

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  return null;
}
