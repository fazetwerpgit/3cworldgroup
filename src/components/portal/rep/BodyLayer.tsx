'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import s from './rep.module.css';

const noopSubscribe = () => () => {};

/** False during SSR and hydration, true once running in the browser. */
export function useIsClient(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

/**
 * Renders fixed bars, sheets and panels on <body>. On iPhones <main> is the
 * scroller, and iOS WebKit breaks position:fixed inside a scroller (clipped to
 * the box, painted under the bars) — see SaleDetailSheet. The display:contents
 * `.layer` wrapper re-supplies the D tokens, which live on the shell's .root.
 */
export function BodyLayer({ children }: { children: ReactNode }) {
  const isClient = useIsClient();
  if (!isClient) return null;
  return createPortal(<div className={s.layer}>{children}</div>, document.body);
}
