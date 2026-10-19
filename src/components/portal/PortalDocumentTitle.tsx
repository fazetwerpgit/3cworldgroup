'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { portalDocumentTitle } from '@/lib/portal/pageTitles';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Gives each portal page its own document title (lib/portal/pageTitles), set
 * before Next's route announcer reads it, and kept when the router puts the
 * layout's shared title back. Renders nothing.
 */
export default function PortalDocumentTitle() {
  const pathname = usePathname();
  const title = portalDocumentTitle(pathname);

  useIsoLayoutEffect(() => {
    if (!title) return;
    if (document.title !== title) document.title = title;
    const observer = new MutationObserver(() => {
      if (document.title !== title) document.title = title;
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [title]);

  return null;
}
