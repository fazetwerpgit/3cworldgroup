'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAs } from '@/contexts/ViewAsContext';
import { isOnboardingUser } from '@/lib/auth/onboardingAccess';
import type { TabPrefetchContext } from '@/lib/cache/tabPrefetch';

/** After a page opens, wait this long (its own reads go first) before warming the other tabs. */
export const TAB_PREFETCH_IDLE_MS = 2000;

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
  return useMemo(
    () => (allowed && uid ? { uid, active, canViewAll, canSales, canLeaderboard } : null),
    [allowed, uid, active, canViewAll, canSales, canLeaderboard]
  );
}

/** Warms the other tabs' data once the page at `pathname` has had its turn. */
export function useTabPrefetch(pathname: string | null) {
  const ctx = useTabPrefetchContext();
  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadPrefetch()
        .then((m) => {
          if (!cancelled) m.prefetchTabs(pathname, ctx);
        })
        .catch(() => undefined);
    }, TAB_PREFETCH_IDLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
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
