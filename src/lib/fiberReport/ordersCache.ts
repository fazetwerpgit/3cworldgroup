import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { FiberOrder } from '@/types';

// The admin fiber board reads the WHOLE fiberOrders collection: there is no
// bound that is safe to add. A month range on orderDate would silently drop
// every row with a null orderDate, and the standing rule is that all the sales
// stay visible. So the read is cached instead of narrowed.
//
// The cache is keyed on two fields of `config/fiberReportStatus`, the doc every
// caller already reads:
// - `lastReportAt`: the carrier workbook lands once each morning, so a new
//   report changes the key;
// - `ordersRev`: bumped by invalidateFiberOrdersCache() on EVERY write that
//   changes a fiberOrders doc (assign, rematch, link, the report upsert).
// So a write on instance A is seen by instance B on its next read, and a warm
// instance re-reads the collection only when the orders actually changed. It
// used to expire every 5 minutes on every instance (about 12 full reads an
// hour each). The TTL is now only the backstop for writes no code path stamps
// (a script, the console).
const TTL_MS = 60 * 60 * 1000;

/** The config/fiberReportStatus fields the key is built from. */
export type FiberStatusFields = { lastReportAt?: unknown; ordersRev?: unknown } | null | undefined;

interface CacheEntry {
  key: string;
  readAt: number;
  orders: FiberOrder[];
}

let cache: CacheEntry | null = null;

/** The cache key for a fiberReportStatus doc (or a bare lastReportAt, for old callers). */
export function fiberOrdersCacheKey(status: FiberStatusFields | string | null): string {
  if (status === null || status === undefined) return '|0';
  if (typeof status === 'string') return `${status}|0`;
  const report = typeof status.lastReportAt === 'string' ? status.lastReportAt : '';
  const rev = typeof status.ordersRev === 'number' ? status.ordersRev : 0;
  return `${report}|${rev}`;
}

/** Test hook: forget this instance's copy without touching Firestore. */
export function resetFiberOrdersCacheForTests(): void {
  cache = null;
}

/**
 * Call after ANY write that changes a fiberOrders doc: the dealer assign
 * backfill, the unmatched rematch, the per-order sale link, the report upsert.
 * Drops this instance's copy and bumps `ordersRev`, so every other instance's
 * next read misses too. The board snapshot is marked dirty as well (the
 * carrier join decides what the board counts). Never throws: the write it
 * follows already landed.
 */
export async function invalidateFiberOrdersCache(): Promise<void> {
  cache = null;
  if (!adminDb) return;
  try {
    await adminDb
      .collection('config')
      .doc('fiberReportStatus')
      .set({ ordersRev: FieldValue.increment(1) }, { merge: true });
  } catch (error) {
    console.error('[ordersCache] failed to bump ordersRev', error);
  }
  try {
    const { markLeaderboardDirty } = await import('@/lib/leaderboard/snapshotStore');
    await markLeaderboardDirty();
  } catch (error) {
    console.error('[ordersCache] failed to mark the leaderboard dirty', error);
  }
}

/**
 * Every fiberOrder, cached against the current report stamp and orders
 * revision. Pass the `config/fiberReportStatus` data the caller already read
 * (or just its lastReportAt) — this helper never re-reads it, so the cache
 * costs no extra round trip.
 */
export async function getAllFiberOrders(
  status: FiberStatusFields | string | null,
  options?: { fresh?: boolean },
): Promise<FiberOrder[]> {
  if (!adminDb) throw new Error('Database not configured');

  const key = fiberOrdersCacheKey(status);
  const now = Date.now();
  // `fresh` skips the cache for the refetch that follows a write: the client's
  // refetch can land before the ordersRev bump is visible to it. The fresh read
  // still repopulates this instance's cache.
  if (!options?.fresh && cache && cache.key === key && now - cache.readAt < TTL_MS) {
    return cache.orders;
  }

  const snapshot = await adminDb.collection('fiberOrders').get();
  const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as FiberOrder);
  cache = { key, readAt: now, orders };
  return orders;
}
