'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAs } from '@/contexts/ViewAsContext';
import { isOnboardingUser } from '@/lib/auth/onboardingAccess';
import type { TabPrefetchContext } from '@/lib/cache/tabPrefetch';
import { waitForPageData } from '@/lib/cache/pageData';

/**
 * The other tabs are warmed once the page's own data has landed (a page that
 * loads on open holds pageData until it settles), then on the next idle frame.
 * A page that never holds gets this long to itself first.
 */
export const TAB_PREFETCH_IDLE_MS = 2000;

/** Runs `fn` when the main thread is idle (or soon, where requestIdleCallback is missing: iOS WebKit). */
function whenIdle(fn: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(fn, { timeout: 1000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = setTimeout(fn, 200);
  return () => clearTimeout(timer);
}

// Its own chunk, fetched on first use: the shell's first load stays as it was.
const loadPrefetch = () => import('@/lib/cache/tabPrefetch');

function useTabPrefetchContext(): TabPrefetchContext | null {
  const { user, hasPermission } = useAuth();
  const { viewing } = useViewAs();
  const uid = user?.uid ?? null;
  const active = user?.status === 'active';
  // A hire still onboarding cannot open these tabs; the owner viewing as a rep
  // must never cache their own answers under the rep (see tabPrefetch.ts).
  const allowed = !!uid && !viewing && !isOnboardingUser(user);
  const canViewAll = hasPermission('sales:read:all');
  const canSales = hasPermission('sales:read');
  const canLeaderboard = hasPermission('leaderboard:read');
  const management = !!user?.role;
  return useMemo(
    () => (allowed && uid ? { uid, active, canViewAll, canSales, canLeaderboard, management } : null),
    [allowed, uid, active, canViewAll, canSales, canLeaderboard, management]
  );
}

/** Warms the other tabs' data once the page at `pathname` has had its turn. */
export function useTabPrefetch(pathname: string | null) {
  const ctx = useTabPrefetchContext();
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    let cancelIdle: (() => void) | null = null;
    const controller = new AbortController();
    void waitForPageData({ fallbackMs: TAB_PREFETCH_IDLE_MS, signal: controller.signal }).then(() => {
      if (cancelled) return;
      cancelIdle = whenIdle(() => {
        void loadPrefetch()
          .then((m) => {
            if (!cancelled) m.prefetchTabs(pathname, ctx);
          })
          .catch(() => undefined);
      });
    });
    return () => {
      cancelled = true;
      controller.abort();
      cancelIdle?.();
    };
  }, [ctx, pathname]);
}

/** A tab's touchstart / pointerdown handler: warms that tab's data before the tap lands. */
export function usePrefetchTabOnTouch(): (href: string) => void {
  const ctx = useTabPrefetchContext();
  return useCallback(
    (href: string) => {
      if (!ctx) return;
      void loadPrefetch()
        .then((m) => m.prefetchTab(href, ctx))
        .catch(() => undefined);
    },
    [ctx]
  );
}
