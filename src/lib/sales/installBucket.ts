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
  if (fiberOrder?.status === 'active') return 'installed';

  const installed = new Date(sale.installDate as Date | string);
  // An unparseable date is no date: it can't be scheduled against.
  if (Number.isNaN(installed.getTime())) return 'attention';
  return installed.getTime() <= now.getTime() ? 'installed' : 'scheduled';
}

/**
 * Sales worth counting. A rejected or cancelled sale is not money and not work:
 * it drops out of the pipeline bar, the rep sub-lines and the month totals
 * rather than sitting in a bucket nobody will ever act on.
 */
export function countedSales<T extends Pick<Sale, 'status'>>(sales: T[]): T[] {
  return sales.filter(isPayableSale);
}

/**
 * The other half of countedSales: the month's cancellations. They are kept out
 * of every figure on the board but not out of sight — a cancelled sale is the
 * paper trail for a customer who backed out, and losing it is exactly what
 * deleting the row would do.
 */
export function cancelledSales<T extends Pick<Sale, 'status'>>(sales: T[]): T[] {
  return sales.filter((sale) => sale.status === 'cancelled');
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
  for (const sale of countedSales(sales)) {
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

  for (const sale of countedSales(sales)) {
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
