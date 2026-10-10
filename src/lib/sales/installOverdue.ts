import type { FiberOrder, Sale } from '@/types';
import { customerLabel } from '@/lib/fiberReport/carrierNotice';
import { isPayableSale } from '@/lib/pay/expectedPay';
import { isCarrierCancelled } from '@/lib/sales/installBucket';
import type { MergedRow } from '@/lib/sales/mergeBook';
import { formatInstallDayShort, installDayKey } from '@/lib/sales/saleDate';

// An install the carrier still has open well past its day. Craig T.'s order sat
// at pending_install from an Aug 1 estimate into October and nobody noticed:
// the board's "Install overdue" chip only helps someone who is looking. This is
// the ONE definition of overdue the alerts (rep + owner) and the owner
// dashboard's Needs attention all read. Pure: the reads, the once-only claims
// and the sending live in lib/alerts/installOverdueAlerts.ts.

/** An install is overdue from this many whole days past its install day. */
export const OVERDUE_AFTER_DAYS = 3;

/** While still overdue, the rep is told again this many days after the last alert. */
export const OVERDUE_REPEAT_DAYS = 7;

export interface OverdueInstall {
  /** The install day it is overdue from (YYYY-MM-DD, America/Chicago). */
  dueDay: string;
  /** Whole days from dueDay to today. Always >= OVERDUE_AFTER_DAYS. */
  daysOverdue: number;
}

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
 * Whether a sale's install is overdue, given the carrier order the board
 * matched to it (buildMergedBook / matchFiberOrdersToSales: no matching here).
 *
 *   - There is a matched carrier order: with none, the carrier has not spoken
 *     and the sale's own date is all anyone has (the board reads it installed).
 *   - The sale is live (not cancelled or rejected) and the order is neither
 *     installed ('active') nor cancelled/churned (isCarrierCancelled).
 *   - The install day is OVERDUE_AFTER_DAYS or more in the past. The install
 *     day is the carrier's estimate, else the sale's own day; when both are
 *     there the LATER one counts, so a sale rescheduled past a missed install
 *     (isStandingBreakage's case) or a carrier estimate moved past the rep's
 *     day is measured from the newer day, never the stale one.
 *   - A sale rescheduled to today or later is waiting on its new day, whatever
 *     the carrier's old estimate says (installBucketForSale reads it scheduled).
 *
 * Days are Chicago calendar days (installDayKey), as the board counts them.
 */
export function overdueInstall(
  sale: Pick<Sale, 'installDate' | 'status'>,
  order: FiberOrder | null | undefined,
  now: Date = new Date()
): OverdueInstall | null {
  if (!order) return null;
  if (!isPayableSale(sale)) return null;
  if (order.status === 'active' || isCarrierCancelled(order)) return null;

  const today = installDayKey(now);
  if (!today) return null;
  const saleDay = installDayKey(sale.installDate);
  const estDay = installDayKey(order.estInstallDate);
  if (saleDay && saleDay >= today) return null;

  const dueDay = [saleDay, estDay].filter((day): day is string => !!day).sort().at(-1);
  if (!dueDay) return null;
  const daysOverdue = daysBetween(dueDay, today);
  if (!(daysOverdue >= OVERDUE_AFTER_DAYS)) return null;
  return { dueDay, daysOverdue };
}

/** One overdue sale on the company book, with what the alerts need to say it. */
export interface OverdueSale extends OverdueInstall {
  saleId: string;
  orderId: string;
  repId: string;
  /** The rep's name as the board shows it. */
  repName: string;
  /** "Craig T." (first name + last initial), else the street. */
  customer: string;
}

/** 'wendy D.' reads 'Wendy D.': a name typed all lowercase still starts with a capital in a push. */
function capitalized(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Every overdue sale on a built book, oldest first. Only rows the board counts
 * (a logged, live sale with its matched order) can be overdue.
 */
export function overdueSales(rows: readonly MergedRow[], now: Date = new Date()): OverdueSale[] {
  const out: OverdueSale[] = [];
  for (const row of rows) {
    if (!row.counted || !row.sale || !row.order) continue;
    const overdue = overdueInstall(row.sale, row.order, now);
    if (!overdue) continue;
    const saleId = row.sale.id?.trim();
    if (!saleId) continue;
    out.push({
      ...overdue,
      saleId,
      orderId: row.order.id,
      repId: row.repId ?? '',
      repName: row.repName,
      customer: capitalized(
        customerLabel(row.order, {
          customerName: row.sale.customerName ?? null,
          customerAddress: row.sale.customerAddress ?? null,
        })
      ),
    });
  }
  return out.sort(
    (a, b) => b.daysOverdue - a.daysOverdue || a.customer.localeCompare(b.customer) || a.saleId.localeCompare(b.saleId)
  );
}

// ---------------------------------------------------------------- rep alert schedule

/** What was last told about one sale (installOverdueAlerts/{saleId}). */
export interface OverdueAlertRecord {
  /** The install day the last alert was about. */
  dueDay: string;
  /** The Chicago day the last alert went out. */
  lastAlertDay: string;
  /** Alerts sent for this overdue stretch. */
  count: number;
}

/**
 * Whether the rep is told about an overdue sale today, and which alert of the
 * stretch it is. Day 3 overdue, then every OVERDUE_REPEAT_DAYS while it stays
 * overdue; never twice on one day. A sale rescheduled AFTER the last alert
 * (its due day is later than that alert) starts a new stretch: told again from
 * day 3 of the new day. A due day that merely shifted between two days that
 * were both already past keeps the weekly rhythm.
 */
export function overdueAlertDue(
  record: OverdueAlertRecord | null | undefined,
  overdue: OverdueInstall,
  today: string
): { send: false } | { send: true; count: number } {
  if (overdue.daysOverdue < OVERDUE_AFTER_DAYS) return { send: false };
  if (!record || !DAY_KEY.test(record.lastAlertDay)) return { send: true, count: 1 };
  if (overdue.dueDay > record.lastAlertDay) return { send: true, count: 1 };
  const since = daysBetween(record.lastAlertDay, today);
  if (!(since >= OVERDUE_REPEAT_DAYS)) return { send: false };
  return { send: true, count: (Number.isFinite(record.count) ? record.count : 0) + 1 };
}

// ---------------------------------------------------------------- copy

export const OVERDUE_REP_TITLE = 'Install overdue';
export const OVERDUE_OWNER_TITLE = 'Installs overdue';

/** "Oct 9" for a day key. */
function shortDay(day: string): string {
  return formatInstallDayShort(day) ?? day;
}

/** The rep's push body. With the title it reads "Install overdue: Craig T. was due Aug 1 (69 days). …" */
export function overdueRepMessage(sale: Pick<OverdueSale, 'customer' | 'dueDay' | 'daysOverdue'>): string {
  return `${sale.customer} was due ${shortDay(sale.dueDay)} (${sale.daysOverdue} days). Check with the customer or reschedule.`;
}

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'Unassigned';
}

/** "12 overdue. Oldest: Craig T. (Cooper, 69 days)". null when there are none. */
export function overdueOwnerMessage(sales: readonly OverdueSale[]): string | null {
  if (!sales.length) return null;
  const oldest = sales.reduce((a, b) => (b.daysOverdue > a.daysOverdue ? b : a));
  const who = `${oldest.customer} (${firstName(oldest.repName)}, ${oldest.daysOverdue} days)`;
  return sales.length === 1
    ? `1 overdue: ${who}`
    : `${sales.length} overdue. Oldest: ${who}`;
}
