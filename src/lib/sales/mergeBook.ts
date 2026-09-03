import type { Sale } from '@/types/sales';
import type { FiberOrder } from '@/types/fiberOrder';
import {
  cancelledSales,
  countedSales,
  emptyInstallCounts,
  installBucketForSale,
  type InstallBucket,
  type InstallCounts,
} from '@/lib/sales/installBucket';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import type { MonthKey } from '@/lib/sales/monthWindow';

// One book. The admin Sales page used to show two lists that disagreed: the
// sales the reps logged, and the carrier's report. This merges them into one
// row per customer so the page can answer "is this real, is it installed, is
// anybody owed money" in a single line.
//
// Two calls decide everything here (docs/superpowers/specs/2026-09-03-one-book-merge.md):
//   CALL 1 — a carrier order nobody logged is NOT a sale. It renders red in the
//            matched rep's list and feeds "Not logged" only: never count, never
//            value, never pay.
//   CALL 2 — the carrier wins the STATUS, the sale keeps the MONEY. A carrier
//            status can sharpen a row's bucket but can never un-cancel a sale
//            somebody here cancelled.

/**
 * How far back Jacob wants to be SHOWN carrier orders with no matching sale.
 *
 * This is deliberately NOT "the month reps started logging". Every sale in the
 * portal is dated July 2026 or later, so July would be the tidier number — and
 * it would file April, May and June away as history. Jacob's call (2026-09-03):
 * "we had sales that went missing and we would need it to be updated if the
 * email shows otherwise." Some of those Apr-Jun carrier orders ARE real sales
 * that never reached the portal, and the carrier report is the only surviving
 * record of them. Widening the window is how they get found and logged.
 *
 * So "Not logged" is a RECOVERY QUEUE — work to chase — not a count of people
 * owed money today. That is why it is larger than the number of sales in the
 * portal, and why it is meant to shrink as it is worked. At April it lands near
 * 213 (Apr 110, May 43, Jun 24, Jul 12, Aug 24) plus the unassigned orders in
 * the window. That size is intended; nothing here suppresses it.
 *
 * Move this when the recovery window changes, not when the data looks untidy.
 */
export const PORTAL_LOGGING_START = '2026-04-01';

/**
 * A sale's value and the carrier's MRC essentially never agree to the cent —
 * live data showed 108 of 114 joined rows differing, mostly by $10-20. A marker
 * that fires on 95% of rows is not a marker, so only a material gap shows.
 */
export const VALUE_GAP_MIN = 25;

export type MergedRowState =
  | 'cancelled' | 'agreed' | 'waiting' | 'never_logged' | 'unassigned' | 'dismissed' | 'historic';
// 'historic' = an order-only row predating PORTAL_LOGGING_START. Out of every
// figure, still in `rows`: it is carrier history, not an accusation.
// 'dismissed' = an admin pressed "Not a sale" on an order (saleLink.saleId === null).
// It is NOT never_logged: it must leave notLoggedCount, or the one number that means
// "somebody is owed money" can never be cleared and stops being believed.

export interface MergedRow {
  /** Stable key: sale id when there is a sale, else `order:${order.id}`. */
  key: string;
  state: MergedRowState;
  sale: Sale | null;
  order: FiberOrder | null;
  /** Owning rep uid. sale.salesRepId, else order.matchedUserId. null only for 'unassigned'. */
  repId: string | null;
  repName: string;
  /** Display name. sale.customerName, else order.customerName, else null -> render the address. */
  customerName: string | null;
  /** sale.customerAddress, else order.address. Always present. */
  address: string;
  /** Money of record. Sale.totalValue, or 0 when there is no sale (CALL 1). */
  value: number;
  /** Set only when both sides have a number and they differ. Drives the "Check" third line. */
  valueGap: { saleValue: number; carrierMrc: number } | null;
  /** Reuses installBucketForSale for rows with a sale; order-only rows bucket off order.status. */
  bucket: InstallBucket;
  /** Month this row belongs to. Sale rows: saleDate. Order-only rows: orderDate ?? estInstallDate. */
  month: MonthKey | null;
  /** True when this row is joined by an explicit admin link, not the address guess. */
  linkedManually: boolean;
  /** True when saleLink names a sale that is not in the book — deleted, or lost to the
   *  fetch cap. The row must SAY so; a silent fall-back to red accuses a rep wrongly. */
  linkBroken: boolean;
  /** CALL 1: false for 'never_logged' and 'unassigned'; true otherwise (and false for 'cancelled'). */
  counted: boolean;
}

export interface MergedBook {
  rows: MergedRow[];              // every row, all months, already sorted
  reps: MergedRepRollup[];        // counted rows grouped by rep, value desc then count desc
  neverLogged: MergedRow[];       // state 'never_logged'   — drawer 1
  unassigned: MergedRow[];        // state 'unassigned'     — drawer 2
  cancelled: MergedRow[];         // state 'cancelled'      — drawer 3
  dismissed: MergedRow[];         // state 'dismissed'      — quiet, inside drawer 1
  historic: MergedRow[];          // state 'historic'       — carrier rows predating the portal
  counts: InstallCounts;          // counted rows only
  totalValue: number;             // Σ value over counted rows
  notLoggedCount: number;         // neverLogged.length + unassigned.length — NOT dismissed
}

export interface MergedRepRollup {
  repId: string; repName: string;
  rows: MergedRow[];              // counted + never_logged (red rows sit in the rep's list)
  count: number;                  // counted rows only
  value: number;                  // counted rows only
  counts: InstallCounts;
  notLogged: number;              // never_logged rows in this rep's list
}

/** Attention first, then the soonest install, then the most recent one — as the rep rollup already orders. */
const BUCKET_ORDER: Record<InstallBucket, number> = { attention: 0, scheduled: 1, installed: 2 };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Carrier dates arrive as bare yyyy-mm-dd, which `new Date` reads as UTC
 * midnight — west of Greenwich that lands on the previous day, so an order
 * dated the 1st would file itself under the previous month. Read them at local
 * noon instead, the way sale and install dates are already stored.
 */
function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const parts = DATE_ONLY.exec(value.trim());
    if (parts) return new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0);
  }
  const date = new Date(value as Date | string);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKeyOf(value: Date | string | null | undefined): MonthKey | null {
  const date = toDate(value);
  return date ? { year: date.getFullYear(), month: date.getMonth() } : null;
}

function sameMonth(a: MonthKey, b: MonthKey): boolean {
  return a.year === b.year && a.month === b.month;
}

/** Negative when `a` is the earlier month. */
function compareMonths(a: MonthKey, b: MonthKey): number {
  return a.year - b.year || a.month - b.month;
}

/** Dollars, as cents. Float noise on two money figures is not a disagreement worth flagging. */
function cents(value: number): number {
  return Math.round(value * 100);
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function text(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * An order with no sale has no install date of its own to trust, so the carrier
 * status is the whole story: active means it happened, anything the carrier is
 * not actively working (pre-sale, cancelled, churned, breakage) is somebody's
 * job, and a pending install is only 'scheduled' while its date is still ahead —
 * a date that has come and gone with no activation needs chasing.
 */
function bucketForOrder(order: FiberOrder, now: Date): InstallBucket {
  if (order.status === 'active') return 'installed';
  if (order.status !== 'pending_install') return 'attention';
  const estimated = toDate(order.estInstallDate);
  if (!estimated) return 'attention';
  return estimated.getTime() > now.getTime() ? 'scheduled' : 'attention';
}

/** The date a row sorts on inside its bucket: the sale's install, else the carrier's estimate. */
function rowTime(row: MergedRow): number {
  const date = row.sale
    ? toDate(row.sale.installDate)
    : toDate(row.order?.estInstallDate ?? row.order?.orderDate);
  return date ? date.getTime() : 0;
}

function byBucketThenDate(a: MergedRow, b: MergedRow): number {
  const bucketA = BUCKET_ORDER[a.bucket];
  const bucketB = BUCKET_ORDER[b.bucket];
  if (bucketA !== bucketB) return bucketA - bucketB;
  // Within scheduled, soonest first (the next thing to happen). Within
  // installed, most recent first (the money that just landed).
  const ordered = bucketA === 1 ? rowTime(a) - rowTime(b) : rowTime(b) - rowTime(a);
  return ordered || a.key.localeCompare(b.key);
}

function byMonthThenBucket(a: MergedRow, b: MergedRow): number {
  // A row with no month is always on screen, so it leads: it is the row nobody
  // can date and therefore the row most likely to be wrong.
  if (!a.month && b.month) return -1;
  if (a.month && !b.month) return 1;
  if (a.month && b.month && !sameMonth(a.month, b.month)) {
    return b.month.year - a.month.year || b.month.month - a.month.month;
  }
  return byBucketThenDate(a, b);
}

/**
 * The explicit join. `saleLink` is an admin saying "this order IS that sale" or
 * "this order is NOT any sale"; either way it outranks the address guess, which
 * is only ever a guess.
 */
function linkedSaleId(order: FiberOrder): { linked: true; saleId: string | null } | { linked: false } {
  const link = order.saleLink;
  if (!link) return { linked: false };
  const saleId = text(link.saleId);
  return { linked: true, saleId };
}

function saleRow(
  sale: Sale,
  order: FiberOrder | null,
  index: number,
  opts: { linkedManually: boolean; cancelled: boolean; counted: boolean; now: Date }
): MergedRow {
  const saleValue = finite(sale.totalValue) ?? 0;
  const carrierMrc = order ? finite(order.mrc) : null;
  const state: MergedRowState = opts.cancelled ? 'cancelled' : order ? 'agreed' : 'waiting';

  return {
    key: text(sale.id) ?? `sale:${index}`,
    state,
    sale,
    order,
    repId: text(sale.salesRepId) ?? order?.matchedUserId ?? null,
    repName: text(sale.salesRepName) ?? text(order?.repName) ?? 'Unassigned',
    customerName: text(sale.customerName) ?? text(order?.customerName),
    address: text(sale.customerAddress) ?? text(order?.address) ?? '',
    value: saleValue,
    valueGap:
      carrierMrc !== null &&
      finite(sale.totalValue) !== null &&
      Math.abs(cents(carrierMrc) - cents(saleValue)) >= cents(VALUE_GAP_MIN)
        ? { saleValue, carrierMrc }
        : null,
    bucket: installBucketForSale(sale, order, opts.now),
    month: monthKeyOf(sale.saleDate),
    linkedManually: opts.linkedManually,
    // A sale row is the link working, so there is nothing dangling to report.
    linkBroken: false,
    counted: opts.counted,
  };
}

/** How pass 1 left an order that never reached a sale row. */
type OrderVerdict = { dismissed: boolean; linkBroken: boolean };

/**
 * Carrier history from before anyone was logging sales here. An order-only row
 * dated before the cutoff is not evidence that a rep failed to log anything, so
 * it is not counted as one. An order with NO resolvable date is NOT historic:
 * unknown is not old, and guessing "old" is how a real one goes quiet.
 */
function isHistoric(order: FiberOrder): boolean {
  const dated = toDate(order.orderDate) ?? toDate(order.estInstallDate);
  const cutoff = toDate(PORTAL_LOGGING_START);
  if (!dated || !cutoff) return false;
  // Both read at local noon, so this is a day-resolution comparison and the
  // cutoff day itself is inside the window.
  return dated.getTime() < cutoff.getTime();
}

function orderRow(order: FiberOrder, now: Date, verdict: OrderVerdict): MergedRow {
  const matchedUserId = text(order.matchedUserId);
  return {
    key: `order:${order.id}`,
    // "Not a sale" is a decision, not an accusation: it leaves the red list and
    // the Not-logged figure, which is the only way that figure can ever be
    // cleared, and keeps its order so the UI can offer an undo. An admin who
    // pressed it saw the row, so that decision outranks the date cutoff.
    state: verdict.dismissed
      ? 'dismissed'
      : isHistoric(order)
        ? 'historic'
        : matchedUserId
          ? 'never_logged'
          : 'unassigned',
    sale: null,
    order,
    repId: matchedUserId,
    repName: text(order.repName) ?? 'Unassigned',
    customerName: text(order.customerName) ?? text(order.loggedCustomerName),
    address: text(order.address) ?? '',
    // CALL 1: nobody logged it, so it is not money. It is a question.
    value: 0,
    valueGap: null,
    bucket: bucketForOrder(order, now),
    month: monthKeyOf(order.orderDate) ?? monthKeyOf(order.estInstallDate),
    linkedManually: false,
    linkBroken: verdict.linkBroken,
    counted: false,
  };
}

function rollupRows(rows: MergedRow[]): MergedRepRollup[] {
  const byRep = new Map<string, MergedRepRollup>();

  for (const row of rows) {
    // 'unassigned' rows cannot sit in a rep's list, and a cancelled row belongs
    // to the cancelled drawer, not to the rep's working list.
    if (!row.counted && row.state !== 'never_logged') continue;
    // Keyed by uid rather than name: two reps can share a display name, and a
    // renamed rep must not split into two rows mid-month.
    const key = row.repId || row.repName || 'unassigned';
    let rollup = byRep.get(key);
    if (!rollup) {
      rollup = {
        repId: key,
        repName: row.repName,
        rows: [],
        count: 0,
        value: 0,
        counts: emptyInstallCounts(),
        notLogged: 0,
      };
      byRep.set(key, rollup);
    }
    rollup.rows.push(row);
    if (row.counted) {
      rollup.count += 1;
      rollup.value += row.value;
      rollup.counts[row.bucket] += 1;
    } else {
      rollup.notLogged += 1;
    }
  }

  for (const rollup of byRep.values()) rollup.rows.sort(byBucketThenDate);

  return [...byRep.values()].sort((a, b) => b.value - a.value || b.count - a.count);
}

/** Every figure on the board derives from the rows, so a filtered book and a built one agree by construction. */
function assemble(rows: MergedRow[]): MergedBook {
  const counts = emptyInstallCounts();
  let totalValue = 0;
  for (const row of rows) {
    if (!row.counted) continue;
    counts[row.bucket] += 1;
    totalValue += row.value;
  }

  const neverLogged = rows.filter((row) => row.state === 'never_logged');
  const unassigned = rows.filter((row) => row.state === 'unassigned');

  return {
    rows,
    reps: rollupRows(rows),
    neverLogged,
    unassigned,
    cancelled: rows.filter((row) => row.state === 'cancelled'),
    dismissed: rows.filter((row) => row.state === 'dismissed'),
    historic: rows.filter((row) => row.state === 'historic'),
    counts,
    totalValue,
    notLoggedCount: neverLogged.length + unassigned.length,
  };
}

export function buildMergedBook(
  sales: Sale[],
  orders: FiberOrder[],
  opts?: { now?: Date }
): MergedBook {
  const now = opts?.now ?? new Date();

  // countedSales is isPayableSale — the one function that decides money — and
  // cancelledSales is its other half. Both filter the caller's own objects, so
  // identity sets read their verdict back without restating the status rules.
  const payable = new Set<Sale>(countedSales(sales));
  const cancelled = new Set<Sale>(cancelledSales(sales));

  const salesById = new Map<string, Sale>();
  for (const sale of sales) {
    const id = text(sale.id);
    if (id && !salesById.has(id)) salesById.set(id, sale);
  }

  // Pass 1 — explicit links, and only then the guess. An order carrying a
  // saleLink leaves the address pool whichever way the link points: naming a
  // sale claims it, and naming null says "not any sale", which has to suppress
  // the guess or the link would achieve nothing.
  const orderBySale = new Map<Sale, FiberOrder>();
  const claimedOrders = new Set<FiberOrder>();
  const openOrders: FiberOrder[] = [];
  const verdicts = new Map<FiberOrder, OrderVerdict>();

  for (const order of orders) {
    const link = linkedSaleId(order);
    if (!link.linked) {
      openOrders.push(order);
      continue;
    }
    if (!link.saleId) {
      // "Not any sale", said out loud by an admin. Deliberate, so never broken.
      verdicts.set(order, { dismissed: true, linkBroken: false });
      continue;
    }
    const sale = salesById.get(link.saleId);
    // At most one order per sale: a second order pointing at a claimed sale
    // loses the join and stays a row of its own rather than overwriting it.
    // Same for a link naming a sale that is not in this book — the order is out
    // of the address pool either way, but it still has to appear somewhere.
    if (sale && !orderBySale.has(sale)) {
      orderBySale.set(sale, order);
      claimedOrders.add(order);
      continue;
    }
    // The link points at nothing this book can show — the sale was deleted, or
    // it fell off the fetch, or another order already holds it. The row still
    // renders, but it has to say the link is dangling: falling back to a plain
    // red "nobody logged it" accuses a rep who did log it.
    verdicts.set(order, { dismissed: false, linkBroken: true });
  }

  const linkedManually = new Set<Sale>(orderBySale.keys());

  // Pass 2 — the address guess, over what neither side has already spoken for.
  const openSales = sales.filter((sale) => !linkedManually.has(sale));
  const guessed = matchFiberOrdersToSales(openSales, openOrders);
  for (const sale of openSales) {
    const id = text(sale.id);
    const order = id ? guessed.get(id) : undefined;
    // One order is one install. Two sales logged at the same address both match
    // the same order, and letting both keep it would render one install twice;
    // the first sale in input order keeps it and the second reads 'waiting',
    // which is the truer answer — it has no order of its own.
    if (!order || claimedOrders.has(order)) continue;
    orderBySale.set(sale, order);
    claimedOrders.add(order);
  }

  const rows: MergedRow[] = sales.map((sale, index) =>
    saleRow(sale, orderBySale.get(sale) ?? null, index, {
      linkedManually: linkedManually.has(sale),
      cancelled: cancelled.has(sale),
      counted: payable.has(sale),
      now,
    })
  );

  const NO_LINK: OrderVerdict = { dismissed: false, linkBroken: false };
  for (const order of orders) {
    if (claimedOrders.has(order)) continue;
    rows.push(orderRow(order, now, verdicts.get(order) ?? NO_LINK));
  }

  rows.sort(byMonthThenBucket);
  return assemble(rows);
}

/**
 * Rows that sit outside the month axis entirely. Carrier history predating the
 * portal and orders an admin has explicitly dismissed are not work the month
 * picker is hiding — each already has its own drawer — so counting them as
 * "+N older" tells the reader the view is withholding 951 things from them,
 * which is false and is exactly the unbelievable figure the cutoff removed.
 * They stay listed in their drawer in every month instead.
 */
function offTheMonthAxis(row: MergedRow): boolean {
  return row.state === 'historic' || row.state === 'dismissed';
}

/**
 * Filters a built book to one month WITHOUT dropping anything. Returns the
 * month's rows plus BOTH out-of-view counts: newer rows are real, because the
 * picker can sit on August while September rows exist, and a lone "+N older"
 * would hide them with no affordance at all.
 *
 * A row with no resolvable month is in every month and counted in neither —
 * hiding a row because its date is missing is exactly how a sale goes quiet,
 * and the month here is a default view, never a filter that hides. Historic and
 * dismissed rows are treated the same way, per offTheMonthAxis.
 *
 * Every row is therefore either kept or counted exactly once, so
 * `book.rows.length + olderCount + newerCount` always equals the input's.
 */
export function bookForMonth(
  book: MergedBook, month: MonthKey | null
): { book: MergedBook; olderCount: number; newerCount: number } {
  if (!month) return { book, olderCount: 0, newerCount: 0 };

  const kept: MergedRow[] = [];
  let olderCount = 0;
  let newerCount = 0;

  for (const row of book.rows) {
    if (!row.month || offTheMonthAxis(row)) {
      kept.push(row);
      continue;
    }
    const side = compareMonths(row.month, month);
    if (side === 0) kept.push(row);
    else if (side < 0) olderCount += 1;
    else newerCount += 1;
  }

  return { book: assemble(kept), olderCount, newerCount };
}
