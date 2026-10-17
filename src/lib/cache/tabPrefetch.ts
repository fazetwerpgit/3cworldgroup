'use client';

// Warms the data cache for the rep tab bar's screens, so switching tabs paints
// the screen at once from cache (the screen still refreshes it quietly, as on
// any revisit). Runs once the shell is idle after a page has loaded, and again
// when a finger lands on a tab (touchstart comes ~100ms before the tap).
//
// Same requests, same cache keys and shapes as the screens' own hooks; a read
// is tracked (trackDataCacheRead) so a screen opening mid-read waits for it
// instead of sending it twice. Never under "View as rep": those reads are
// tagged by ViewAsScope, and a prefetch from the shell would cache the owner's
// own answers under the rep.

import { getIdToken } from '@/lib/firebase/getIdToken';
import {
  dataCacheGeneration,
  isDataCacheReadPending,
  readDataCacheEntry,
  trackDataCacheRead,
  writeDataCache,
} from '@/lib/cache/dataCache';
import { salesListCacheKey, type CachedSales } from '@/hooks/useSales';
import { FIBER_CACHE_KEY } from '@/hooks/useFiberStatus';
import { COMP_PLAN_CACHE_KEY, compPlanState } from '@/hooks/useCompPlan';
import {
  boardFromResponse,
  FIRST_LEADERBOARD_BOARD,
  leaderboardCacheKey,
  leaderboardQuery,
} from '@/hooks/useLeaderboard';
import type { CompPlanResponse } from '@/types';

/** Who the prefetch is for: the signed-in user's own view only. */
export interface TabPrefetchContext {
  uid: string;
  /** users/{uid}.status === 'active' (pending accounts are refused by the routes). */
  active: boolean;
  /** hasPermission('sales:read:all'): the Sales tab reads the company book, which is not prefetched. */
  canViewAll: boolean;
  /** Per-tab gates, as the tab bar shows them. */
  canSales: boolean;
  canLeaderboard: boolean;
  /** Has a platform `role` (owner/admin/operations...): their pay and carrier report are not the rep's, so not warmed. */
  management: boolean;
}

/** An entry younger than this is left alone: the screen's own refresh is enough. */
const WARM_ENOUGH_MS = 60_000;

function needsRead(uid: string, key: string): boolean {
  if (isDataCacheReadPending(uid, key)) return false;
  const entry = readDataCacheEntry(uid, key);
  return !entry || Date.now() - entry.at > WARM_ENOUGH_MS;
}

async function getJson<T>(url: string): Promise<T> {
  const token = await getIdToken();
  const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  const data = (await response.json().catch(() => null)) as T | null;
  if (!response.ok || data === null) throw new Error(`Prefetch failed (${response.status})`);
  return data;
}

/** One cached read: skipped when warm or already under way; failures are silent (the screen reads itself). */
function warm<T>(uid: string, key: string, read: () => Promise<T>): Promise<void> | null {
  if (!needsRead(uid, key)) return null;
  const gen = dataCacheGeneration();
  const run = read().then((value) => writeDataCache(uid, key, value, gen));
  return trackDataCacheRead(uid, key, run).catch(() => undefined);
}

function warmSales(ctx: TabPrefetchContext): void {
  if (!ctx.canSales) return;
  const { uid } = ctx;
  // Management's Sales tab reads the whole company book: too big to fetch on spec.
  if (!ctx.canViewAll) {
    const filters = { limit: 500, salesRepId: uid };
    warm<CachedSales>(uid, salesListCacheKey(filters), async () => {
      const data = await getJson<{ sales: CachedSales['sales']; truncated?: boolean }>(
        `/api/portal/sales?${new URLSearchParams({ salesRepId: uid, limit: '500' })}`
      );
      return { sales: data.sales ?? [], truncated: data.truncated === true };
    });
  }
  // Management has no rep pay plan or own carrier report worth a spec read.
  if (ctx.management) return;
  warm(uid, FIBER_CACHE_KEY, () => getJson('/api/portal/sales/status'));
  if (ctx.active) {
    warm(uid, COMP_PLAN_CACHE_KEY, async () => compPlanState(uid, await getJson<CompPlanResponse>('/api/portal/comp-plan')));
  }
}

function warmLeaderboard(ctx: TabPrefetchContext): void {
  if (!ctx.canLeaderboard) return;
  warm(ctx.uid, leaderboardCacheKey(FIRST_LEADERBOARD_BOARD), async () =>
    boardFromResponse(await getJson(`/api/portal/leaderboard?${leaderboardQuery(FIRST_LEADERBOARD_BOARD)}`))
  );
}

/** Warms the data of the tab at `href` (a tab bar href), if it has any to warm. */
export function prefetchTab(href: string, ctx: TabPrefetchContext): void {
  if (href === '/portal/sales') warmSales(ctx);
  else if (href === '/portal/leaderboard') warmLeaderboard(ctx);
}

// The leaderboard is a heavy read: the idle pass warms it at most once per
// app session (per account); after that only a finger on the tab warms it.
const leaderboardIdleWarmed = new Set<string>();

/** Test hook: forget which accounts had their idle leaderboard warm. */
export function resetTabPrefetchSession(): void {
  leaderboardIdleWarmed.clear();
}

/** Warms every tab's data except the one on screen (the idle pass). */
export function prefetchTabs(currentPath: string | null | undefined, ctx: TabPrefetchContext): void {
  for (const href of ['/portal/sales', '/portal/leaderboard']) {
    if (currentPath && (currentPath === href || currentPath.startsWith(`${href}/`))) continue;
    if (href === '/portal/leaderboard') {
      if (!ctx.canLeaderboard || leaderboardIdleWarmed.has(ctx.uid)) continue;
      leaderboardIdleWarmed.add(ctx.uid);
    }
    prefetchTab(href, ctx);
  }
}
