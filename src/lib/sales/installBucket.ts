import type { FiberOrder, Sale } from '@/types';
import { isPayableSale } from '@/lib/pay/expectedPay';
import { installDayKey } from '@/lib/sales/saleDate';

// Where a sale sits in the install pipeline. With sale approval removed, this is
// the ONLY lifecycle the Sales page shows, so it has to be derived in exactly one
// place — the summary bar, the key line, each rep's sub-line and every row chip
// all read from here. Two of them disagreeing would mean the bar says one thing
// and the rows say another, which is worse than showing nothing.

export type InstallBucket = 'attention' | 'scheduled' | 'installed';

export const INSTALL_BUCKETS: readonly InstallBucket[] = ['attention', 'scheduled', 'installed'];

export type InstallCounts = Record<InstallBucket, number>;

/**
 * A breakage row reports one install day that broke at the door. Once the sale
 * carries a LATER day (the rep or an admin rescheduled it), that row is
 * history and the new day stands until the carrier reports on it. A breakage
 * row with no readable day, or a sale still on the broken day or earlier, is
 * a missed install.
 */
export function isStandingBreakage(
  sale: Pick<Sale, 'installDate'>,
  fiberOrder?: FiberOrder | null
): boolean {
  if (fiberOrder?.status !== 'breakage') return false;
  const brokeDay = installDayKey(fiberOrder.estInstallDate);
  const saleDay = installDayKey(sale.installDate);
  if (!brokeDay || !saleDay) return true;
  return saleDay <= brokeDay;
}

// ---------------------------------------------------------------- report coverage

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Whole calendar days from one day key to a later one (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const a = DAY_KEY.exec(from);
  const b = DAY_KEY.exec(to);
  if (!a || !b) return Number.NaN;
  const time = (m: RegExpExecArray) => Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Math.round((time(b) - time(a)) / 86_400_000);
}

/**
 * With no report stamp to go on, an install day this many days back or fewer
 * is treated as not yet covered: the report lands once a day covering the day
 * before, and it can skip a weekend day.
 */
export const UNKNOWN_REPORT_GRACE_DAYS = 2;

/**
 * Whether the newest carrier report can speak for install day `day`
 * (YYYY-MM-DD, Chicago). Owner, 2026-10-10 (Noah: "a bunch of my installs are
 * saying they need rescheduled but they're installed"): the report dated Thu
 * covers Thu; it cannot know a Fri install happened. So a day is covered only
 * when `reportAsOf` (config/fiberReportStatus.lastReportAsOf) is that day or
 * later. With no usable stamp, a day more than UNKNOWN_REPORT_GRACE_DAYS back
 * is taken as covered and anything newer is not.
 */
export function carrierReportCovers(
  day: string,
  reportAsOf: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (typeof reportAsOf === 'string' && DAY_KEY.test(reportAsOf)) return day <= reportAsOf;
  const today = installDayKey(now);
  if (!today) return true;
  return daysBetween(day, today) > UNKNOWN_REPORT_GRACE_DAYS;
}

/**
 * The day an install the carrier still has open is judged on: the later of the
 * sale's own day and the carrier's estimate, so a rescheduled sale (or a moved
 * estimate) is measured from the newer day, never the stale one.
 */
export function judgedInstallDay(
  sale: Pick<Sale, 'installDate'>,
  order: FiberOrder | null | undefined
): string | null {
  const days = [installDayKey(sale.installDate), installDayKey(order?.estInstallDate)];
  return days.filter((day): day is string => !!day).sort().at(-1) ?? null;
}

/** Neutral line for an install whose day passed before the carrier report caught up. */
export const AWAITING_CARRIER_LABEL = 'Install day passed · waiting on carrier';

/**
 * The install day a sale is waiting on the carrier report for, or null. Only
 * the INFERRED overdue qualifies — a dated sale the carrier still has
 * pending_install or pre_sale, whose day has come (today or earlier) and that
 * the newest report does not cover yet. Such a sale is not attention, not
 * overdue and not a reschedule: it reads as scheduled until a report that
 * covers its day says otherwise. A carrier breakage or cancellation is data
 * the report actually holds and is never waited on.
 */
export function awaitingCarrierDay(
  sale: Pick<Sale, 'installDate'>,
  order: FiberOrder | null | undefined,
  now: Date = new Date(),
  reportAsOf?: string | null
): string | null {
  if (!sale.installDate) return null;
  if (order?.status !== 'pending_install' && order?.status !== 'pre_sale') return null;
  const day = judgedInstallDay(sale, order);
  const today = installDayKey(now);
  if (!day || !today || day > today) return null;
  return carrierReportCovers(day, reportAsOf, now) ? null : day;
}

/**
 * True when the sale's install day is behind us (before today) and the carrier
 * report has not caught up to it: the rows that read AWAITING_CARRIER_LABEL.
 * The install day itself still reads "Installs today".
 */
export function isAwaitingCarrier(
  sale: Pick<Sale, 'installDate'>,
  order: FiberOrder | null | undefined,
  now: Date = new Date(),
  reportAsOf?: string | null
): boolean {
  const day = awaitingCarrierDay(sale, order, now, reportAsOf);
  return !!day && day !== installDayKey(now);
}

/**
 * The words for a sale waiting on the carrier (awaitingCarrierDay), or null
 * when it is not waiting. Its day being today still reads "Installs today".
 */
export function awaitingCarrierLabel(
  sale: Pick<Sale, 'installDate'>,
  order: FiberOrder | null | undefined,
  now: Date = new Date(),
  reportAsOf?: string | null
): string | null {
  const day = awaitingCarrierDay(sale, order, now, reportAsOf);
  if (!day) return null;
  return day === installDayKey(now) ? 'Installs today' : AWAITING_CARRIER_LABEL;
}

// ---------------------------------------------------------------- buckets

/**
 * The fiber report is display-only "peace of mind" data (see types/fiberOrder),
 * so it may sharpen a sale's bucket but never invents one: a sale with no
 * install date is 'attention' whatever the report says, because someone still
 * has to go get a date on the calendar.
 */
export function installBucketForSale(
  sale: Pick<Sale, 'installDate'>,
  fiberOrder?: FiberOrder | null,
  now: Date = new Date(),
  /** config/fiberReportStatus.lastReportAsOf; omitted = unknown (see carrierReportCovers). */
  reportAsOf?: string | null
): InstallBucket {
  if (!sale.installDate) return 'attention';
  // Breakage means the customer missed, rescheduled or cancelled at the door —
  // the date on the sale is stale and somebody has to chase it.
  if (isStandingBreakage(sale, fiberOrder)) return 'attention';
  // The carrier is the record of what actually happened (CALL 2). A cancelled
  // or churned order never installed, or no longer is, so the install date on
  // the sale is stale — without this the row reads 'installed' off its own past
  // date and a rep's month counts a cancellation as a completed install.
  if (fiberOrder?.status === 'cancelled' || fiberOrder?.status === 'churned') return 'attention';
  if (fiberOrder?.status === 'active') return 'installed';

  const installed = new Date(sale.installDate as Date | string);
  // An unparseable date is no date: it can't be scheduled against.
  if (Number.isNaN(installed.getTime())) return 'attention';
  if (installed.getTime() > now.getTime()) return 'scheduled';
  // The day has come but the newest carrier report predates it: the report
  // cannot know yet, so the install stays scheduled (awaitingCarrierDay).
  if (awaitingCarrierDay(sale, fiberOrder, now, reportAsOf)) return 'scheduled';
  // The sale's day has passed, but the carrier says the install has not
  // happened: a pending install is still scheduled while the carrier's own
  // estimate is ahead (as the book reads an order alone), otherwise it needs chasing.
  if (fiberOrder?.status === 'pre_sale') return 'attention';
  if (fiberOrder?.status === 'pending_install') {
    const estDay = installDayKey(fiberOrder.estInstallDate);
    const today = installDayKey(now);
    // The install day itself is still scheduled: the crew has all day to get
    // there, so a pending order only needs chasing from the day after.
    return estDay && today && estDay >= today ? 'scheduled' : 'attention';
  }
  return 'installed';
}

/**
 * Why a sale sits in 'attention', so the words can say what actually went
 * wrong. Only meaningful when installBucketForSale returned 'attention'; it
 * walks the same checks in the same order.
 *   - 'no-date':   nothing usable on the calendar
 *   - 'missed':    the carrier reported a breakage at the door
 *   - 'cancelled': the carrier cancelled or churned the order
 *   - 'overdue':   the install day has passed and the carrier still has it
 *                  pending (or pre-sale)
 */
export type AttentionReason = 'no-date' | 'missed' | 'cancelled' | 'overdue';

export function installAttentionReason(
  sale: Pick<Sale, 'installDate'>,
  fiberOrder?: FiberOrder | null
): AttentionReason {
  if (!sale.installDate) return 'no-date';
  if (isStandingBreakage(sale, fiberOrder)) return 'missed';
  if (isCarrierCancelled(fiberOrder)) return 'cancelled';
  if (Number.isNaN(new Date(sale.installDate as Date | string).getTime())) return 'no-date';
  return 'overdue';
}

/**
 * The install day (YYYY-MM-DD in INSTALL_DATE_TIME_ZONE) a 'scheduled' sale
 * rests on, read the way installBucketForSale read it: the sale's own date
 * while it is still ahead, otherwise the carrier's estimate that kept a
 * pending order scheduled, falling back to the sale's date.
 */
export function scheduledInstallDay(
  sale: Pick<Sale, 'installDate'>,
  fiberOrder?: FiberOrder | null,
  now: Date = new Date()
): string | null {
  const saleDay = installDayKey(sale.installDate);
  if (sale.installDate) {
    const installed = new Date(sale.installDate as Date | string);
    if (!Number.isNaN(installed.getTime()) && installed.getTime() > now.getTime()) return saleDay;
  }
  if (fiberOrder?.status === 'pending_install') {
    return installDayKey(fiberOrder.estInstallDate) ?? saleDay;
  }
  return saleDay;
}

/** True when a day key (or any date installDayKey reads) is today's install day. */
export function isInstallToday(value: unknown, now: Date = new Date()): boolean {
  const day = installDayKey(value);
  return !!day && day === installDayKey(now);
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
  now: Date = new Date(),
  reportAsOf?: string | null
): InstallCounts {
  const counts = emptyInstallCounts();
  for (const sale of countedSales(sales, fiberBySale)) {
    counts[installBucketForSale(sale, fiberBySale?.get(sale.id || ''), now, reportAsOf)] += 1;
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
  now: Date = new Date(),
  reportAsOf?: string | null
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
    rollup.counts[installBucketForSale(sale, fiberBySale?.get(sale.id || ''), now, reportAsOf)] += 1;
  }

  for (const rollup of byRep.values()) {
    rollup.sales.sort((a, b) => {
      const bucketA = BUCKET_ORDER[installBucketForSale(a, fiberBySale?.get(a.id || ''), now, reportAsOf)];
      const bucketB = BUCKET_ORDER[installBucketForSale(b, fiberBySale?.get(b.id || ''), now, reportAsOf)];
      if (bucketA !== bucketB) return bucketA - bucketB;
      // Within scheduled, soonest first (that is the next thing to happen).
      // Within installed, most recent first (that is the money that just landed).
      return bucketA === 1 ? installTime(a) - installTime(b) : installTime(b) - installTime(a);
    });
  }

  return [...byRep.values()].sort((a, b) => b.value - a.value || b.count - a.count);
}
