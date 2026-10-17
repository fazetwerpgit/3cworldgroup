'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { onNativeMessage } from '@/lib/app/bridge';
import { isNativeApp } from '@/lib/app/isNativeApp';
import { NOTICE_HIDE_MS, nextNotice, type ShownNotice } from './appNotice';
import n from './AppNotice.module.css';

// In the 3C iOS app: shows the shell's `notice` events (BRIDGE.md) as one small
// toast, e.g. "Preparing download…" then "Download ready." or the error.
// Portaled to <body> (which carries portal-scope / dark) so the fixed toast is
// not inside the <main> scroller, which breaks position: fixed on iPhone.
// Renders nothing on the web.
export default function AppNotice() {
  const [notice, setNotice] = useState<ShownNotice | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    return onNativeMessage((message) => {
      if (message.type === 'notice') setNotice((current) => nextNotice(current, message));
    });
  }, []);

  useEffect(() => {
    const hideAfter = notice ? NOTICE_HIDE_MS[notice.kind] : null;
    if (!notice || hideAfter === null) return;
    const timer = setTimeout(() => setNotice((current) => (current === notice ? null : current)), hideAfter);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!notice || typeof document === 'undefined') return null;
  return createPortal(
    <div
      key={notice.id}
      className={`${n.notice} ${n[notice.kind]}`}
      role={notice.kind === 'error' ? 'alert' : 'status'}
      aria-live={notice.kind === 'error' ? 'assertive' : 'polite'}
    >
      <span className={n.dot} aria-hidden="true" />
      <span>{notice.message}</span>
    </div>,
    document.body
  );
}
