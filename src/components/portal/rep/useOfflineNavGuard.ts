'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * The portal page a link click would open, or null when the click is not an
 * ordinary in-portal navigation (another origin, a new tab, a download, a
 * modified click, the page already on screen).
 */
export function portalNavTarget(event: MouseEvent, currentHref: string): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const target = event.target as Element | null;
  const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (!anchor || anchor.hasAttribute('download')) return null;
  const rel = anchor.getAttribute('target');
  if (rel && rel !== '_self') return null;
  let url: URL;
  let current: URL;
  try {
    current = new URL(currentHref);
    url = new URL(anchor.getAttribute('href') ?? '', current);
  } catch {
    return null;
  }
  if (url.origin !== current.origin) return null;
  if (url.pathname !== '/portal' && !url.pathname.startsWith('/portal/')) return null;
  if (url.pathname === current.pathname) return null;
  return url.pathname + url.search + url.hash;
}

/**
 * Offline tab taps in the 3C iOS app. A link to a page whose code has not been
 * prefetched yet makes the router fall back to a full page load, which fails
 * offline and leaves WKWebView on a blank white error page that never comes
 * back. So while the device is offline, an in-portal link click is held here
 * instead: the shell shows its offline notice with Try again, and the held
 * page opens by itself once the connection returns. Pass enabled=false on the
 * web, where nothing is intercepted.
 */
export function useOfflineNavGuard(enabled: boolean, pathname: string) {
  const router = useRouter();
  const [held, setHeld] = useState<{ href: string; from: string; replace: boolean } | null>(null);
  // Any navigation that does happen (Back, the held page itself) drops the hold.
  const [seenPath, setSeenPath] = useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (held) setHeld(null);
  }

  useEffect(() => {
    if (!enabled) return;
    const onClick = (event: MouseEvent) => {
      if (navigator.onLine !== false) return;
      const href = portalNavTarget(event, window.location.href);
      if (!href) return;
      // Capture phase, before the router's Link handler: it sees
      // defaultPrevented and leaves the page alone.
      event.preventDefault();
      // A tab keeps its no-history behaviour (RepTabBar replaces).
      const replace = !!(event.target as Element | null)?.closest?.('[data-slot="rep-tab-bar"]');
      setHeld({ href, from: window.location.pathname, replace });
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [enabled]);

  const heldHref = held && held.from === pathname ? held.href : null;
  const heldReplace = !!held?.replace;

  const retry = useCallback(() => {
    if (!heldHref || navigator.onLine === false) return;
    if (heldReplace) router.replace(heldHref, { scroll: false });
    else router.push(heldHref);
  }, [heldHref, heldReplace, router]);

  // Back online: open the held page.
  useEffect(() => {
    if (!heldHref) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [heldHref, retry]);

  return { heldHref, retry };
}
