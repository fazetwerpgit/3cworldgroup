import type { FiberOrder, Sale } from '@/types';
import { isPayableSale } from '@/lib/pay/expectedPay';

// Where a sale sits in the install pipeline. With sale approval removed, this is
// the ONLY lifecycle the Sales page shows, so it has to be derived in exactly one
// place — the summary bar, the key line, each rep's sub-line and every row chip
// all read from here. Two of them disagreeing would mean the bar says one thing
// and the rows say another, which is worse than showing nothing.

export type InstallBucket = 'attention' | 'scheduled' | 'installed';

export const INSTALL_BUCKETS: readonly InstallBucket[] = ['attention', 'scheduled', 'installed'];

export type InstallCounts = Record<InstallBucket, number>;

/**
 * The fiber report is display-only "peace of mind" data (see types/fiberOrder),
 * so it may sharpen a sale's bucket but never invents one: a sale with no
 * install date is 'attention' whatever the report says, because someone still
 * has to go get a date on the calendar.
 */
export function installBucketForSale(
  sale: Pick<Sale, 'installDate'>,
  fiberOrder?: FiberOrder | null,
  now: Date = new Date()
): InstallBucket {
  if (!sale.installDate) return 'attention';
  // Breakage means the customer missed, rescheduled or cancelled at the door —
  // the date on the sale is stale and somebody has to chase it.
  if (fiberOrder?.status === 'breakage') return 'attention';
  // The carrier is the record of what actually happened (CALL 2). A cancelled
  // or churned order never installed, or no longer is, so the install date on
  // the sale is stale — without this the row reads 'installed' off its own past
  // date and a rep's month counts a cancellation as a completed install.
  if (fiberOrder?.status === 'cancelled' || fiberOrder?.status === 'churned') return 'attention';
  if (fiberOrder?.status === 'active') return 'installed';

  const installed = new Date(sale.installDate as Date | string);
  // An unparseable date is no date: it can't be scheduled against.
  if (Number.isNaN(installed.getTime())) return 'attention';
  return installed.getTime() <= now.getTime() ? 'installed' : 'scheduled';
}

/**
 * Jacob, 2026-09-10: a carrier cancellation drops the MONEY too.
 *
 * CALL 2 originally said the carrier won the status while the sale kept its
 * value. The result was a rep's month reading "15 installs" with three of those
 * customers cancelled — the carrier's word changed a chip somewhere and nothing
 * else. A carrier 'cancelled' or 'churned' now settles the row exactly like a
 * cancellation typed into the portal: out of the count, out of the value, out of
 * expected pay. The reverse still never happens — a carrier status cannot
 * un-cancel what a human cancelled.
 */
export function isCarrierCancelled(order: FiberOrder | null | undefined): boolean {
  return order?.status === 'cancelled' || order?.status === 'churned';
}

type SaleForCount = Pick<Sale, 'status'> & { id?: string };

/** The order matched to a sale, when the caller has the map to look it up. */
function orderFor(
  sale: SaleForCount,
  fiberBySale?: Map<string, FiberOrder>
): FiberOrder | undefined {
  return fiberBySale?.get(sale.id || '');
}

/**
 * Sales worth counting. A rejected or cancelled sale is not money and not work:
 * it drops out of the pipeline bar, the rep sub-lines and the month totals
 * rather than sitting in a bucket nobody will ever act on. Pass `fiberBySale`
 * wherever the carrier report is on hand, so a carrier cancellation drops out
 * of the same figures.
 */
export function countedSales<T extends SaleForCount>(
  sales: T[],
  fiberBySale?: Map<string, FiberOrder>
): T[] {
  return sales.filter((sale) => isPayableSale(sale) && !isCarrierCancelled(orderFor(sale, fiberBySale)));
}

/**
 * The other half of countedSales: the month's cancellations. They are kept out
 * of every figure on the board but not out of sight — a cancelled sale is the
 * paper trail for a customer who backed out, and losing it is exactly what
 * deleting the row would do.
 */
export function cancelledSales<T extends SaleForCount>(
  sales: T[],
  fiberBySale?: Map<string, FiberOrder>
): T[] {
  return sales.filter(
    (sale) => sale.status === 'cancelled' || isCarrierCancelled(orderFor(sale, fiberBySale))
  );
}

export function emptyInstallCounts(): InstallCounts {
  return { attention: 0, scheduled: 0, installed: 0 };
}

export function countInstallBuckets(
  sales: Sale[],
  fiberBySale?: Map<string, FiberOrder>,
  now: Date = new Date()
): InstallCounts {
  const counts = emptyInstallCounts();
  for (const sale of countedSales(sales, fiberBySale)) {
    counts[installBucketForSale(sale, fiberBySale?.get(sale.id || ''), now)] += 1;
  }
  return counts;
}

export interface RepRollup {
  repId: string;
  repName: string;
  sales: Sale[];
  count: number;
  /** Σ monthly value across the rep's counted sales. */
  value: number;
  counts: InstallCounts;
}

/** Attention first, then the soonest install, then the most recent one. */
const BUCKET_ORDER: Record<InstallBucket, number> = { attention: 0, scheduled: 1, installed: 2 };

function installTime(sale: Sale): number {
  if (!sale.installDate) return 0;
  const time = new Date(sale.installDate as Date | string).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Groups a month of sales into one row per rep, ordered by monthly value so the
 * question "who is producing" is answered by the order of the list itself.
 *
 * Rows are keyed by `salesRepId` rather than name — two reps can share a display
 * name, and a renamed rep must not split into two rows mid-month. A sale with no
 * rep id falls back to its name so it stays visible instead of vanishing.
 */
export function rollupSalesByRep(
  sales: Sale[],
  fiberBySale?: Map<string, FiberOrder>,
  now: Date = new Date()
): RepRollup[] {
  const byRep = new Map<string, RepRollup>();

  for (const sale of countedSales(sales, fiberBySale)) {
    const repId = sale.salesRepId || sale.salesRepName || 'unassigned';
    let rollup = byRep.get(repId);
    if (!rollup) {
      rollup = {
        repId,
        repName: sale.salesRepName || 'Unassigned',
        sales: [],
        count: 0,
        value: 0,
        counts: emptyInstallCounts(),
      };
      byRep.set(repId, rollup);
    }
    rollup.sales.push(sale);
    rollup.count += 1;
    rollup.value += sale.totalValue || 0;
    rollup.counts[installBucketForSale(sale, fiberBySale?.get(sale.id || ''), now)] += 1;
  }

  for (const rollup of byRep.values()) {
    rollup.sales.sort((a, b) => {
      const bucketA = BUCKET_ORDER[installBucketForSale(a, fiberBySale?.get(a.id || ''), now)];
      const bucketB = BUCKET_ORDER[installBucketForSale(b, fiberBySale?.get(b.id || ''), now)];
      if (bucketA !== bucketB) return bucketA - bucketB;
      // Within scheduled, soonest first (that is the next thing to happen).
      // Within installed, most recent first (that is the money that just landed).
      return bucketA === 1 ? installTime(a) - installTime(b) : installTime(b) - installTime(a);
    });
  }

  return [...byRep.values()].sort((a, b) => b.value - a.value || b.count - a.count);
}
