import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import {
  carrierNumber,
  latestDay,
  linkedSaleId,
  normalizeAddress,
  joinByOrderNumber,
  type NumberJoin,
  orderExactKey,
  orderMatchKey,
  pickCurrentOrder,
  resolveUnlinkedSale,
  sameRep,
} from '@/lib/fiberReport/matchSales';
import { isLiveSale, normalizeOrderNumber } from '@/lib/sales/orderNumber';
import { formatInstallDay, installDayKey, parseInstallDateInput } from '@/lib/sales/saleDate';
import type { FiberOrder, InstallDateSyncCounts } from '@/types/fiberOrder';

// The carrier moves install dates and tells nobody. Until now the report only
// ever landed in `fiberOrders`, so a rep's own sale kept the day they typed and
// the first they heard of a change was a customer ringing them. This is the one
// place the report is allowed to WRITE a sale.
//
// It writes only where it is certain. A sale's install date drives the pipeline
// bucket and expected pay, so a wrong auto-edit is worse than no edit: every
// join here has to be unambiguous in BOTH directions (one sale for the order,
// one current order for the sale) or the row is left alone for a human. The
// matching itself is the same question matchFiberOrdersToSales asks at read
// time — same normalisation, same prefix predicate, same door and same
// current-row pick (matchSales.ts), same saleLink override — so the page and
// the writer can never disagree about which order a sale is.
//
// The same certain join also hands a sale logged with NO order number the
// carrier's number (numberFillsFor), so the next report joins it by number and
// the Log Sale duplicate guard sees it. Never over a number a person typed,
// never one another live sale already carries, never another rep's row.

export interface InstallDateChange {
  saleId: string;
  salesRepId: string;
  /** The day the sale carried before this run. null when it had none. */
  previous: Date | null;
  next: Date;
}

/**
 * The sale a report order stands for: the one sale whose current carrier row
 * it is (same join as the date writes, same saleLink override). The carrier
 * notices (lib/fiberReport/carrierNotices) read it rather than joining again.
 */
export interface OrderSale {
  saleId: string;
  salesRepId: string;
  customerName: string | null;
  customerAddress: string | null;
  status: string | null;
}

export interface InstallDateSyncResult extends InstallDateSyncCounts {
  changes: InstallDateChange[];
  /** Order id → its sale. Orders that are no single sale's current row are absent. */
  orderSales: Map<string, OrderSale>;
}

export interface SyncInstallDatesInput {
  /** The orders just written by the report. Only these are considered. */
  orders: FiberOrder[];
  now?: Date;
}

/** The slice of a sale this module reads. */
interface SyncSale {
  id: string;
  salesRepId: string;
  customerName: string | null;
  customerAddress: string | null;
  normalizedAddress: string;
  /** The logged order number, as stored (the join normalizes it). */
  orderNumberOrBtn: string | null;
  /** The stored duplicate-guard key (normalizeOrderNumber), when written. */
  orderNumberKey: string | null;
  /** Not cancelled, rejected or soft-deleted: the duplicate guard's isLiveSale. */
  live: boolean;
  saleDate: unknown;
  installDate: unknown;
  status: string | null;
  /** Who set the date last: 'rep' | 'admin' | 'report', or null on older rows. */
  installDateSource: string | null;
  /** The carrier's row and its est install day when a person last set the date (see carrierOrderForSale). */
  repEditOrderId: string | null;
  repEditCarrierDate: string | null;
  /** The snapshot's update time: the write is refused if the sale changed since. */
  updateTime: FirebaseFirestore.Timestamp | null;
}

/** The carrier row a person's install-date edit was made against. */
export interface CarrierSnapshot {
  orderId: string;
  estInstallDate: string | null;
}

function emptyResult(): InstallDateSyncResult {
  return {
    checked: 0,
    updated: 0,
    skippedAmbiguous: 0,
    skippedCancelled: 0,
    unchanged: 0,
    errors: 0,
    orderNumbersFilled: 0,
    orderNumberSkippedConflict: 0,
    changes: [],
    orderSales: new Map(),
  };
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function isDated(order: FiberOrder): boolean {
  return text(order.estInstallDate) !== null;
}

function toSyncSale(
  id: string,
  data: FirebaseFirestore.DocumentData,
  updateTime: FirebaseFirestore.Timestamp | null = null
): SyncSale {
  const customerAddress = text(data.customerAddress);
  return {
    id,
    salesRepId: text(data.salesRepId) ?? '',
    customerName: text(data.customerName),
    customerAddress,
    normalizedAddress: normalizeAddress(customerAddress),
    orderNumberOrBtn: text(data.orderNumberOrBtn),
    orderNumberKey: text(data.orderNumberKey),
    live: isLiveSale(data),
    saleDate: data.saleDate ?? null,
    installDate: data.installDate ?? null,
    status: text(data.status),
    installDateSource: text(data.installDateSource),
    repEditOrderId: text(data.repEditOrderId),
    repEditCarrierDate: text(data.repEditCarrierDate),
    updateTime,
  };
}

/** The name a rep will recognise, falling back to the address they logged. */
function saleLabel(sale: SyncSale): string {
  return sale.customerName ?? sale.customerAddress ?? 'this customer';
}

function notificationMessage(sale: SyncSale, previous: Date | null, next: Date): string {
  const nextDay = formatInstallDay(next);
  const previousDay = previous ? formatInstallDay(previous) : null;
  const was = previousDay ? ` (was ${previousDay})` : '';
  return `The carrier moved ${saleLabel(sale)}'s install to ${nextDay}.${was}`;
}

type Current =
  | { kind: 'order'; order: FiberOrder; via: 'link' | 'number' | 'address' | 'superseded' }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

/**
 * The carrier row that stands for one sale, from `orders`.
 *
 * `saleLink` outranks everything — it is an admin saying out loud which sale an
 * order is (or that it is none) — and a linked order leaves the address pool
 * entirely, exactly as buildMergedBook does it. A sale named by two links is a
 * contradiction an admin has to settle. The rest is resolveUnlinkedSale, the
 * same resolution every page runs, with the sync's stricter address pick. The order number: a sale whose
 * logged number is in `orders` is that row, as the page joins it
 * (joinByOrderNumber: the sale's own rep, exact before loose, a cancelled row
 * replaced by a live one at the door set aside). Otherwise, leaving out rows
 * any sale's number names (`join.reserved`), the orders placed too long
 * before the sale are set aside (ordersPlacedForSale), the sale's door is read
 * off the address (doorOrders) and its current row picked (pickCurrentOrder),
 * the same steps the page takes. A door that can't be told apart, or a pick
 * that flips when the rows come in reverse (a tie the page settles by input
 * order), is ambiguous: a writer needs a real answer.
 */
function currentOrderForSale(sale: SyncSale, orders: FiberOrder[], join: NumberJoin): Current {
  const links = orders.filter((order) => {
    const link = linkedSaleId(order);
    return link.linked && link.saleId === sale.id;
  });
  if (links.length > 1) return { kind: 'ambiguous' };
  if (links.length === 1) return { kind: 'order', order: links[0], via: 'link' };

  const open = orders.filter((order) => !linkedSaleId(order).linked);
  return resolveUnlinkedSale(sale, open, join, strictPick);
}

/** The sync's address rule: a door it can tell apart, and a pick that holds when the rows come in reverse. */
function strictPick(door: { orders: FiberOrder[]; certain: boolean }): FiberOrder | 'ambiguous' | undefined {
  if (!door.certain) return 'ambiguous';
  const current = pickCurrentOrder(door.orders);
  if (!current) return undefined;
  if (pickCurrentOrder([...door.orders].reverse()) !== current) return 'ambiguous';
  return current;
}

/** joinByOrderNumber over the unlinked rows, for the sales no link already names: as the page runs it. */
function numberJoinFor(sales: SyncSale[], orders: FiberOrder[]): NumberJoin {
  const linkedSales = new Set<string>();
  const open: FiberOrder[] = [];
  for (const order of orders) {
    const link = linkedSaleId(order);
    if (!link.linked) open.push(order);
    else if (link.saleId) linkedSales.add(link.saleId);
  }
  return joinByOrderNumber(sales.filter((sale) => !linkedSales.has(sale.id)), open);
}

type Resolved =
  | { kind: 'match'; order: FiberOrder; sale: SyncSale }
  | { kind: 'ambiguous' };

/** Each sale with the carrier row that stands for it in this batch. */
type SaleCurrent = { sale: SyncSale; current: Current };

/**
 * The sales an order is the current row of, less any cancelled (or rejected)
 * duplicate logged at the same door: a dead sale never makes a live one's order
 * ambiguous. All of them when none is live, so a dead sale alone still reaches
 * decide() and is counted skippedCancelled.
 */
function liveClaimants(claimed: SyncSale[]): SyncSale[] {
  const live = claimed.filter((sale) => sale.status !== 'cancelled' && sale.status !== 'rejected');
  return live.length ? live : claimed;
}

/**
 * The join, resolved for one batch of orders: each sale the batch touches,
 * paired with its current row when that row can move a day.
 *
 * It writes only from a live, dated row. An active row's est day is history:
 * the page already reads the activation date for an installed order, and an
 * old install at the door must never be pushed onto a newer sale there. A row
 * with no est day cannot move one. And an order that is the current row of two
 * live sales (two logs of one customer, say) writes neither.
 */
function resolveMatches(currents: SaleCurrent[]): Resolved[] {
  const claimants = new Map<FiberOrder, SyncSale[]>();
  const out: Resolved[] = [];

  for (const { sale, current } of currents) {
    if (current.kind === 'none') continue;
    if (current.kind === 'ambiguous') {
      out.push({ kind: 'ambiguous' });
      continue;
    }
    const { order } = current;
    if (order.status === 'active' || !isDated(order)) continue;
    claimants.set(order, [...(claimants.get(order) ?? []), sale]);
  }

  for (const [order, all] of claimants) {
    const claimed = liveClaimants(all);
    if (claimed.length > 1) out.push({ kind: 'ambiguous' });
    else out.push({ kind: 'match', order, sale: claimed[0] });
  }
  return out;
}

/** Every batch order that is exactly one sale's current row, whatever its status. */
function orderSalesFor(currents: SaleCurrent[]): Map<string, OrderSale> {
  const claimed = new Map<string, SyncSale[]>();
  for (const { sale, current } of currents) {
    if (current.kind !== 'order') continue;
    const id = current.order.id;
    claimed.set(id, [...(claimed.get(id) ?? []), sale]);
  }
  const out = new Map<string, OrderSale>();
  for (const [orderId, all] of claimed) {
    const sales = liveClaimants(all);
    if (sales.length !== 1) continue;
    const [sale] = sales;
    out.set(orderId, {
      saleId: sale.id,
      salesRepId: sale.salesRepId,
      customerName: sale.customerName,
      customerAddress: sale.customerAddress,
      status: sale.status,
    });
  }
  return out;
}

/** A number-less sale's certain carrier row, and the number it takes from it. */
interface NumberFill {
  order: FiberOrder;
  /** As the carrier prints it (the row's doc id). */
  number: string;
  /** normalizeOrderNumber(number): the duplicate guard's orderNumberKey. */
  key: string;
}

/** The sale may take the fill: still live, still number-less, and the row is its rep's. */
function canFill(sale: SyncSale, fill: NumberFill): boolean {
  return sale.live && !sale.orderNumberOrBtn && sameRep(sale, fill.order);
}

/**
 * The carrier's order number for each sale logged without one, where the join
 * is certain: the sale's current row by address (the strict pick: a door told
 * apart, a pick that holds in reverse) or by an admin's single saleLink, and
 * that row the current row of no other live sale. Any status but cancelled (an
 * active row is the usual case: the install happened), and only a row with a
 * real order number (a breakage row has none).
 *
 * Left empty, and counted as a conflict: the row is matched to another rep
 * (sameRep, the join's own rule), or any other live sale, any rep, already
 * carries the number, exact or with the O/0 I/1 slips the join forgives.
 */
function numberFillsFor(
  currents: SaleCurrent[],
  sales: SyncSale[]
): { fills: Map<string, NumberFill>; conflicts: number } {
  // Every live sale's number, exact (the duplicate guard's key) and loose.
  const taken = new Map<string, Set<string>>();
  const hold = (value: unknown, saleId: string) => {
    const loose = orderMatchKey(value);
    for (const key of [normalizeOrderNumber(value), loose && `~${loose}`]) {
      if (key) taken.set(key, new Set([...(taken.get(key) ?? []), saleId]));
    }
  };
  for (const sale of sales) {
    if (!sale.live) continue;
    hold(sale.orderNumberOrBtn, sale.id);
    hold(sale.orderNumberKey, sale.id);
  }
  const heldByOther = (number: string, saleId: string) =>
    [normalizeOrderNumber(number), `~${orderMatchKey(number)}`].flatMap((key) =>
      [...(taken.get(key) ?? [])].filter((id) => id !== saleId)
    );

  const claimants = new Map<FiberOrder, SaleCurrent[]>();
  for (const entry of currents) {
    if (entry.current.kind !== 'order') continue;
    const { order } = entry.current;
    claimants.set(order, [...(claimants.get(order) ?? []), entry]);
  }

  const fills = new Map<string, NumberFill>();
  let conflicts = 0;
  for (const [order, all] of claimants) {
    const live = liveClaimants(all.map((entry) => entry.sale));
    if (live.length !== 1) continue;
    const [sale] = live;
    const current = all.find((entry) => entry.sale === sale)!.current;
    if (current.kind !== 'order' || (current.via !== 'address' && current.via !== 'link')) continue;
    if (!sale.live || sale.orderNumberOrBtn || order.status === 'cancelled') continue;
    const number = carrierNumber(order);
    if (!orderExactKey(number)) continue;

    const fill = { order, number, key: normalizeOrderNumber(number) };
    const holders = [...new Set(heldByOther(number, sale.id))];
    if (!sameRep(sale, order) || holders.length) {
      conflicts += 1;
      const why = holders.length ? `already on live sale(s) ${holders.join(', ')}` : `matched to another rep (${order.matchedUserId})`;
      console.warn(`[installDateSync] left sale ${sale.id} without order ${order.id}: ${why}`);
      continue;
    }
    fills.set(sale.id, fill);
    hold(number, sale.id);
  }
  return { fills, conflicts };
}

/**
 * The carrier's current row for one sale, as this sync would read it from
 * `orders` (every stored order, at edit time). A rep's or admin's install-date
 * edit stores it, so a later report can tell the carrier's news from the same
 * old row the person already corrected. null when no single row is the sale.
 */
export function carrierOrderForSale(
  sale: { id: string; data: FirebaseFirestore.DocumentData },
  orders: FiberOrder[],
  /** The rep's other sales, so a row another sale's number names is not this one's (as the sync reads it). */
  siblings: { id: string; data: FirebaseFirestore.DocumentData }[] = []
): CarrierSnapshot | null {
  const own = toSyncSale(sale.id, sale.data);
  const all = [own, ...siblings.filter((other) => other.id !== sale.id).map((other) => toSyncSale(other.id, other.data))];
  const current = currentOrderForSale(own, orders, numberJoinFor(all, orders));
  if (current.kind !== 'order') return null;
  return { orderId: current.order.id, estInstallDate: text(current.order.estInstallDate) };
}

/**
 * A person set this sale's date after seeing the carrier's (see
 * carrierOrderForSale). The report overrides them only with news:
 *   - the same carrier row, with an est day that differs from the one on record;
 *   - a different row standing for the sale now, dated after the one on record
 *     (a reschedule, or a new order). A different row saying nothing newer is
 *     the same old news reached another way: the batch may carry the stale
 *     order row where the edit saw the missed-install row, say.
 * A date set with no row on record takes any carrier date that differs from
 * the one recorded (none, for a date set before the report knew the sale).
 */
function isCarrierNews(sale: SyncSale, order: FiberOrder): boolean {
  const day = text(order.estInstallDate);
  if (!sale.repEditOrderId || order.id === sale.repEditOrderId) {
    return day !== sale.repEditCarrierDate;
  }
  return !sale.repEditCarrierDate || latestDay(order) > sale.repEditCarrierDate;
}

type Decision =
  | { write: true; next: Date; previous: Date | null; previousDay: string | null }
  | { write: false; count: 'skippedCancelled' | 'unchanged' };

function decide(sale: SyncSale, order: FiberOrder): Decision {
  // A cancelled sale is history. Moving its date would put a dead row back
  // into the pipeline and ping a rep about a customer who backed out.
  if (sale.status === 'cancelled') return { write: false, count: 'skippedCancelled' };

  const parsed = parseInstallDateInput(order.estInstallDate);
  if (!parsed.ok) {
    // An unreadable or absurd carrier date is not a change worth making.
    console.error(
      `[installDateSync] order ${order.id} has an unusable est install date`,
      order.estInstallDate
    );
    return { write: false, count: 'unchanged' };
  }

  // A rep or an admin set this date themselves. Writing the same old carrier
  // date back would undo their fix every morning.
  const personSet = sale.installDateSource === 'rep' || sale.installDateSource === 'admin';
  if (personSet && !isCarrierNews(sale, order)) return { write: false, count: 'unchanged' };

  const previousDay = installDayKey(sale.installDate);
  if (previousDay && previousDay === installDayKey(parsed.date)) {
    return { write: false, count: 'unchanged' };
  }
  return { write: true, next: parsed.date, previous: toDate(sale.installDate), previousDay };
}

/** Firestore's FAILED_PRECONDITION: the sale changed after it was read. */
function isStaleWrite(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 9 || code === 'failed-precondition';
}

/**
 * The orders as stored, with the admin's saleLink. The report's parsed rows
 * never carry one (it lives only on the stored doc, kept by the merge upsert),
 * so without this an admin's "this order is that sale" or "not any sale" would
 * be ignored by the one writer it matters most to.
 */
async function withStoredSaleLinks(orders: FiberOrder[]): Promise<FiberOrder[]> {
  if (!adminDb) return orders;
  const collection = adminDb.collection('fiberOrders');
  const links = new Map<string, FiberOrder['saleLink']>();
  for (let offset = 0; offset < orders.length; offset += 300) {
    const refs = orders.slice(offset, offset + 300).map((order) => collection.doc(order.id));
    const snapshots = await adminDb.getAll(...refs);
    for (const snapshot of snapshots) {
      const saleLink = snapshot.exists ? snapshot.data()?.saleLink : undefined;
      if (saleLink !== undefined) links.set(snapshot.id, saleLink);
    }
  }
  return orders.map((order) =>
    order.saleLink === undefined && links.has(order.id)
      ? { ...order, saleLink: links.get(order.id) }
      : order
  );
}

/**
 * Moves a sale's install date to the day the carrier's report gives, and tells
 * the rep it moved. Per-sale failures never throw: a report that already landed
 * must not be failed by a follow-up write, so each is logged and counted.
 */
export async function syncInstallDatesFromOrders(
  input: SyncInstallDatesInput
): Promise<InstallDateSyncResult> {
  const result = emptyResult();
  const now = input.now ?? new Date();
  if (!input.orders?.length) return result;
  if (!adminDb) {
    console.error('[installDateSync] database not configured');
    return result;
  }

  const orders = await withStoredSaleLinks(input.orders);
  const snapshot = await adminDb.collection('sales').get();
  const sales = snapshot.docs.map((doc) =>
    toSyncSale(doc.id, doc.data() ?? {}, doc.updateTime ?? null)
  );
  // Rows a sale holds by order number are that sale's; no other sale may reach
  // them by street (the same rule matchFiberOrdersToSales applies).
  const join = numberJoinFor(sales, orders);
  const currents = sales.map((sale) => ({
    sale,
    current: currentOrderForSale(sale, orders, join),
  }));
  const resolved = resolveMatches(currents);
  const numbers = numberFillsFor(currents, sales);
  result.orderNumberSkippedConflict = numbers.conflicts;
  result.orderSales = orderSalesFor(currents);
  result.checked = orders.filter(isDated).length;

  // One write per sale: the date (when its row is dated) and the number (when
  // the sale has none) go in the same update. A sale only the number touches
  // (an active row, say) is written for the number alone.
  const work: { sale: SyncSale; order: FiberOrder; dated: boolean }[] = [];
  for (const entry of resolved) {
    if (entry.kind === 'ambiguous') result.skippedAmbiguous += 1;
    else work.push({ sale: entry.sale, order: entry.order, dated: true });
  }
  const datedSales = new Set(work.map((item) => item.sale.id));
  for (const { sale } of currents) {
    const fill = numbers.fills.get(sale.id);
    if (fill && !datedSales.has(sale.id)) work.push({ sale, order: fill.order, dated: false });
  }

  for (const item of work) {
    const { order, dated } = item;
    let sale = item.sale;
    const planned = numbers.fills.get(sale.id);
    const fill = planned && planned.order === order ? planned : null;
    let decision: Decision | null = dated ? decide(sale, order) : null;
    let filling = fill !== null && canFill(sale, fill);
    const ref = adminDb.collection('sales').doc(sale.id);
    let written = false;

    // The sales were read once for the whole batch; a rep or admin may have set
    // the date (or typed a number) since. The write is conditional on the sale
    // being unchanged, and a refused write is decided again, once, on a fresh read.
    for (let attempt = 0; (decision?.write || filling) && !written; attempt += 1) {
      const update: Record<string, unknown> = { updatedAt: now };
      if (decision?.write) {
        Object.assign(update, {
          installDate: decision.next,
          installDateSource: 'report',
          installDatePreviousDate: decision.previous,
          installDateChangedAt: now,
        });
      }
      if (filling && fill) {
        Object.assign(update, {
          orderNumberOrBtn: fill.number,
          orderNumberKey: fill.key,
          orderNumberSource: 'report',
          orderNumberFilledAt: now,
        });
      }
      try {
        if (sale.updateTime) await ref.update(update, { lastUpdateTime: sale.updateTime });
        else await ref.update(update);
        written = true;
      } catch (error) {
        let failure = error;
        if (attempt === 0 && isStaleWrite(error)) {
          try {
            const fresh = await ref.get();
            if (!fresh.exists) {
              decision = dated ? { write: false, count: 'unchanged' } : null;
              filling = false;
              break;
            }
            sale = toSyncSale(fresh.id, fresh.data() ?? {}, fresh.updateTime ?? null);
            decision = dated ? decide(sale, order) : null;
            filling = fill !== null && canFill(sale, fill);
            continue;
          } catch (readError) {
            failure = readError;
          }
        }
        console.error(`[installDateSync] failed to update sale ${sale.id}`, failure);
        result.errors += 1;
        break;
      }
    }

    if (decision && !decision.write) result[decision.count] += 1;
    if (!written) continue;
    if (filling) result.orderNumbersFilled += 1;
    if (!decision?.write) continue;

    const { next, previous, previousDay } = decision;
    result.updated += 1;
    result.changes.push({ saleId: sale.id, salesRepId: sale.salesRepId, previous, next });

    if (!sale.salesRepId) continue;
    try {
      // In-app + push only, matching the other sale notifications: the carrier
      // report is peace-of-mind data and does not earn an email.
      await dispatchToUser({
        userId: sale.salesRepId,
        type: 'install_date_changed',
        title: 'Install date changed',
        message: notificationMessage(sale, previous, next),
        link: `/portal/sales/${sale.id}`,
        metadata: {
          saleId: sale.id,
          orderId: order.id,
          previousInstallDate: previousDay,
          installDate: installDayKey(next),
        },
      });
    } catch (error) {
      // The date IS moved; only the telling failed. Counted so the import log
      // says a rep may not know, without pretending the write did not happen.
      console.error(`[installDateSync] failed to notify rep for sale ${sale.id}`, error);
      result.errors += 1;
    }
  }

  return result;
}

/** Firestore hands back a Timestamp; tests and older rows hand back a Date. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const maybe = value as { toDate?: () => Date } | null | undefined;
  if (maybe && typeof maybe.toDate === 'function') {
    const date = maybe.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
