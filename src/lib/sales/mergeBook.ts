import type { Sale } from '@/types/sales';
import type { FiberOrder } from '@/types/fiberOrder';
import {
  cancelledSales,
  isCarrierCancelled,
  countedSales,
  emptyInstallCounts,
  installBucketForSale,
  type InstallBucket,
  type InstallCounts,
} from '@/lib/sales/installBucket';
import {
  foldLeftoverOrders,
  linkedSaleId,
  matchFiberOrdersToSalesDetailed,
} from '@/lib/fiberReport/matchSales';
import { carrierReasonLabel } from '@/lib/fiberReport/carrierNotice';
import { installDayKey } from '@/lib/sales/saleDate';
import { displayPersonName, normalizeOrderNumber } from '@/lib/sales/orderNumber';
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
//   CALL 2 — the carrier wins the STATUS. A carrier status can sharpen a row's
//            bucket but can never un-cancel a sale somebody here cancelled.
//            AMENDED 2026-09-10 (Jacob): a carrier 'cancelled' or 'churned'
//            takes the MONEY too. It used to leave value and pay untouched, so
//            a rep's month read "15 installs" with three of them cancelled.

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
  /**
   * Another live sale looks like the same order: both matched one carrier
   * order, or both carry the same order number. A flag for the owner to
   * check, never a verdict — it changes no figure. Always false on order-only
   * and cancelled rows (cancelling the extra one is how the flag clears).
   */
  possibleDuplicate: boolean;
  /**
   * Carrier rows folded under this sale (foldLeftoverOrders): a missed install
   * or a cancelled attempt at the same door as the order it matched. History,
   * not an unlogged sale, so they have no row of their own and never count as
   * not logged. Always empty on order-only rows.
   */
  history: FiberOrder[];
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
  // Same day-key rule as installBucketForSale: the install day itself is
  // still scheduled.
  const estDay = installDayKey(order.estInstallDate);
  const today = installDayKey(now);
  return estDay && today && estDay >= today ? 'scheduled' : 'attention';
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
 * The name a row shows for its rep. A portal rep is titled by the portal: the
 * caller's users-doc names, else the rep's own sales' salesRepName, else the
 * name the status API attached to the order (matchedUserName). The report's
 * repName is the dealer code's owner — under a handoff (Miles sells on
 * Jeremy's code) a different person — so it is only the last resort, and the
 * whole answer for an order no portal user matched.
 */
type PortalNames = (repId: string | null, order: FiberOrder | null) => string | null;

function portalNames(sales: readonly Sale[], repNames?: ReadonlyMap<string, string>): PortalNames {
  const fromSales = new Map<string, string>();
  for (const sale of sales) {
    const uid = text(sale.salesRepId);
    const name = text(sale.salesRepName);
    if (uid && name && !fromSales.has(uid)) fromSales.set(uid, name);
  }
  return (repId, order) => {
    if (repId) {
      const name =
        text(repNames?.get(repId)) ??
        fromSales.get(repId) ??
        (order?.matchedUserId === repId ? text(order.matchedUserName) : null);
      if (name) return displayPersonName(name);
    }
    return text(order?.repName);
  };
}

function saleRow(
  sale: Sale,
  order: FiberOrder | null,
  index: number,
  opts: {
    linkedManually: boolean; cancelled: boolean; counted: boolean; possibleDuplicate: boolean; now: Date;
    names: PortalNames;
    history: FiberOrder[];
  }
): MergedRow {
  const repId = text(sale.salesRepId) ?? order?.matchedUserId ?? null;
  const ownName = text(sale.salesRepName);
  const saleValue = finite(sale.totalValue) ?? 0;
  const carrierMrc = order ? finite(order.mrc) : null;
  const state: MergedRowState = opts.cancelled ? 'cancelled' : order ? 'agreed' : 'waiting';

  return {
    key: text(sale.id) ?? `sale:${index}`,
    state,
    sale,
    order,
    repId,
    repName: ownName ? displayPersonName(ownName) : opts.names(repId, order) ?? 'Unassigned',
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
    possibleDuplicate: opts.possibleDuplicate && !opts.cancelled,
    history: opts.history,
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

function orderRow(order: FiberOrder, now: Date, verdict: OrderVerdict, names: PortalNames): MergedRow {
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
    repName: names(matchedUserId, order) ?? 'Unassigned',
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
    possibleDuplicate: false,
    history: [],
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A carrier yyyy-mm-dd as "Oct 7", read as the calendar day it is (no time zone). */
function carrierDay(value: string | null | undefined): string | null {
  const parts = typeof value === 'string' ? DATE_ONLY.exec(value.trim()) : null;
  const month = parts ? MONTHS[Number(parts[2]) - 1] : undefined;
  return parts && month ? `${month} ${Number(parts[3])}` : null;
}

/**
 * The note a folded row leaves under its sale: "Earlier order: Customer not
 * home Oct 7", "Earlier order: Cancelled Oct 8".
 */
export function earlierOrderNote(order: FiberOrder): string {
  const what =
    order.status === 'breakage'
      ? carrierReasonLabel(order.breakageReason) ?? 'Missed install'
      : order.status === 'churned'
        ? 'Churned'
        : 'Cancelled';
  const day = carrierDay(
    order.status === 'breakage'
      ? order.estInstallDate
      : order.status === 'churned'
        ? order.deactivationDate ?? order.cancellationDate ?? order.orderDate
        : order.cancellationDate ?? order.orderDate
  );
  return `Earlier order: ${what}${day ? ` ${day}` : ''}`;
}

/**
 * Live sales that look like one order logged twice: 2+ that the address guess
 * put on the SAME carrier order (only the first keeps the join; the rest read
 * 'waiting', so without this they look like separate sales still on their way),
 * or 2+ with the same normalized order number whether or not any order matched.
 * Cancelled sales are left out, so cancelling the extra one clears the flag.
 */
export function possibleDuplicateSales(
  sales: readonly Sale[],
  guessed: ReadonlyMap<string, FiberOrder>,
  isCancelled: (sale: Sale) => boolean
): Set<Sale> {
  const byOrder = new Map<FiberOrder, Sale[]>();
  const byOrderNumber = new Map<string, Sale[]>();
  for (const sale of sales) {
    if (isCancelled(sale)) continue;
    const id = text(sale.id);
    const order = id ? guessed.get(id) : undefined;
    if (order) byOrder.set(order, [...(byOrder.get(order) ?? []), sale]);
    const key = normalizeOrderNumber(sale.orderNumberOrBtn);
    if (key) byOrderNumber.set(key, [...(byOrderNumber.get(key) ?? []), sale]);
  }
  const flagged = new Set<Sale>();
  for (const group of [...byOrder.values(), ...byOrderNumber.values()]) {
    if (group.length > 1) for (const sale of group) flagged.add(sale);
  }
  return flagged;
}

function rollupRows(rows: MergedRow[]): MergedRepRollup[] {
  const byRep = new Map<string, MergedRepRollup>();
  const namedBySale = new Set<string>();

  for (const row of rows) {
    // 'unassigned' rows cannot sit in a rep's list, and a cancelled row belongs
    // to the cancelled drawer, not to the rep's working list.
    if (!row.counted && row.state !== 'never_logged') continue;
    // Keyed by uid rather than name: two reps can share a display name, and a
    // renamed rep must not split into two rows mid-month.
    const key = row.repId || row.repName || 'unassigned';
    let rollup = byRep.get(key);
    // The label is the rep's own: a row with a sale names them as the portal
    // does, so it outranks an order-only row that happened to come first.
    if (rollup && row.sale && !namedBySale.has(key)) {
      rollup.repName = row.repName;
      namedBySale.add(key);
    }
    if (!rollup) {
      if (row.sale) namedBySale.add(key);
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
  opts?: {
    now?: Date;
    /** users/{uid} display names, when the caller has them. Outranks every other source. */
    repNames?: ReadonlyMap<string, string>;
  }
): MergedBook {
  const now = opts?.now ?? new Date();
  const names = portalNames(sales, opts?.repNames);

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

  // Pass 2 — the order number, then the address guess, over what neither side
  // has already spoken for (matchFiberOrdersToSalesDetailed).
  const openSales = sales.filter((sale) => !linkedManually.has(sale));
  const { matches: guessed, contested, superseded } = matchFiberOrdersToSalesDetailed(openSales, openOrders);
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

  // A sale the address put at a door whose row another sale holds by order
  // number reads as on that row for the duplicate check, as it did before the
  // number join: two sales at one door is still one customer logged twice.
  const doorOrder = new Map(guessed);
  for (const [saleId, order] of contested) doorOrder.set(saleId, order);
  const duplicates = possibleDuplicateSales(sales, doorOrder, (sale) => cancelled.has(sale));

  // History folds under the sale it belongs to, with no row of its own:
  //   - the sale's own numbered row the carrier cancelled and replaced (the
  //     sale now stands on the replacement);
  //   - leftover rows at the door of an order a sale holds (foldLeftoverOrders).
  // Rows an admin dealt with (a verdict) and carrier history from before the
  // portal keep their own drawers.
  const historyBySale = new Map<Sale, FiberOrder[]>();
  const folded = new Set<FiberOrder>();
  const addHistory = (sale: Sale, order: FiberOrder) => {
    historyBySale.set(sale, [...(historyBySale.get(sale) ?? []), order]);
    folded.add(order);
  };
  for (const sale of openSales) {
    const id = text(sale.id);
    const own = id ? superseded.get(id) : undefined;
    if (own && !claimedOrders.has(own)) addHistory(sale, own);
  }
  const saleByOrder = new Map<FiberOrder, Sale>();
  for (const [sale, order] of orderBySale) saleByOrder.set(order, sale);
  const leftovers = foldLeftoverOrders(
    orders.filter(
      (order) => !claimedOrders.has(order) && !folded.has(order) && !verdicts.has(order) && !isHistoric(order)
    ),
    claimedOrders,
    (order) => saleByOrder.get(order)
  );
  for (const [leftover, beside] of leftovers) {
    const owner = saleByOrder.get(beside);
    if (owner) addHistory(owner, leftover);
  }

  // The carrier half of the verdict can only be read once the join is done, so
  // it lands here rather than in the sets above: a carrier cancellation settles
  // the row like a cancellation typed in, and never the other way round.

  const rows: MergedRow[] = sales.map((sale, index) => {
    const order = orderBySale.get(sale) ?? null;
    const carrierCancelled = isCarrierCancelled(order);
    return saleRow(sale, order, index, {
      linkedManually: linkedManually.has(sale),
      cancelled: cancelled.has(sale) || carrierCancelled,
      counted: payable.has(sale) && !carrierCancelled,
      possibleDuplicate: duplicates.has(sale),
      now,
      names,
      history: historyBySale.get(sale) ?? [],
    });
  });

  const NO_LINK: OrderVerdict = { dismissed: false, linkBroken: false };
  for (const order of orders) {
    if (claimedOrders.has(order) || folded.has(order)) continue;
    rows.push(orderRow(order, now, verdicts.get(order) ?? NO_LINK, names));
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
