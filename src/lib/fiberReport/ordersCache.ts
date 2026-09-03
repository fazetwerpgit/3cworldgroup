import { adminDb } from '@/lib/firebase/admin';
import { FiberOrder } from '@/types';

// The admin fiber board reads the WHOLE fiberOrders collection: there is no
// bound that is safe to add. A month range on orderDate would silently drop
// every row with a null orderDate, and the standing rule is that all the sales
// stay visible. So the read is cached instead of narrowed.
//
// The carrier workbook lands once each morning, so the snapshot is keyed on
// `config/fiberReportStatus.lastReportAt`: a new report changes the key and the
// cache misses on the next read. The TTL is the backstop for writes we did not
// see (another instance's assign, a script, the console).
//
// IMPORTANT: this is module state, so on serverless it warms PER INSTANCE and
// is invalidated per instance too. It reduces the read volume; it does not
// eliminate it, and a write on instance A does not clear instance B's copy —
// that is what the 5 minute TTL is for.
const TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  /** lastReportAt of the report the cached docs were read under. */
  reportKey: string;
  readAt: number;
  orders: FiberOrder[];
}

let cache: CacheEntry | null = null;

/**
 * Drop the cached fiberOrders snapshot. Call after ANY write that changes a
 * fiberOrders doc: the dealer assign backfill, the unmatched rematch, and the
 * per-order sale link.
 */
export function invalidateFiberOrdersCache(): void {
  cache = null;
}

/**
 * Every fiberOrder, cached against the current report stamp. `lastReportAt` is
 * the value already read from `config/fiberReportStatus` by the caller — this
 * helper never re-reads it, so the cache costs no extra round trip.
 */
export async function getAllFiberOrders(
  lastReportAt: string | null,
  options?: { fresh?: boolean },
): Promise<FiberOrder[]> {
  if (!adminDb) throw new Error('Database not configured');

  const reportKey = lastReportAt ?? '';
  const now = Date.now();
  // `fresh` skips the cache for the refetch that follows a write. Invalidation
  // is per-instance, so without this the client's refetch can land on a DIFFERENT
  // warm instance and get the pre-write snapshot for up to the TTL: the linked
  // row stays red with no error, which reads as "the button did nothing". The
  // fresh read still repopulates this instance's cache.
  if (!options?.fresh && cache && cache.reportKey === reportKey && now - cache.readAt < TTL_MS) {
    return cache.orders;
  }

  const snapshot = await adminDb.collection('fiberOrders').get();
  const orders = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as FiberOrder);
  cache = { reportKey, readAt: now, orders };
  return orders;
}
