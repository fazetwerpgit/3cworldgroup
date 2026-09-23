import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import {
  doorOrders,
  isAddressPrefixPair,
  latestDay,
  normalizeAddress,
  ordersPlacedForSale,
  pickCurrentOrder,
} from '@/lib/fiberReport/matchSales';
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

export interface InstallDateChange {
  saleId: string;
  salesRepId: string;
  /** The day the sale carried before this run. null when it had none. */
  previous: Date | null;
  next: Date;
}

export interface InstallDateSyncResult extends InstallDateSyncCounts {
  changes: InstallDateChange[];
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
    changes: [],
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
  | { kind: 'order'; order: FiberOrder }
  | { kind: 'ambiguous' }
  | { kind: 'none' };

/**
 * The carrier row that stands for one sale, from `orders`.
 *
 * `saleLink` outranks everything — it is an admin saying out loud which sale an
 * order is (or that it is none) — and a linked order leaves the address pool
 * entirely, exactly as buildMergedBook does it. A sale named by two links is a
 * contradiction an admin has to settle. Otherwise the orders placed too long
 * before the sale are set aside (ordersPlacedForSale), the sale's door is read
 * off the address (doorOrders) and its current row picked (pickCurrentOrder),
 * the same steps the page takes. A door that can't be told apart, or a pick
 * that flips when the rows come in reverse (a tie the page settles by input
 * order), is ambiguous: a writer needs a real answer.
 */
function currentOrderForSale(sale: SyncSale, orders: FiberOrder[]): Current {
  const links = orders.filter((order) => text(order.saleLink?.saleId) === sale.id);
  if (links.length > 1) return { kind: 'ambiguous' };
  if (links.length === 1) return { kind: 'order', order: links[0] };

  if (sale.normalizedAddress.length < 6) return { kind: 'none' };
  const candidates = ordersPlacedForSale(sale.saleDate, orders).filter((order) => {
    if (order.saleLink) return false;
    const orderAddress = normalizeAddress(order.address);
    return orderAddress.length >= 6 && isAddressPrefixPair(sale.normalizedAddress, orderAddress);
  });
  if (!candidates.length) return { kind: 'none' };

  const door = doorOrders(sale.customerAddress, candidates);
  if (!door.certain) return { kind: 'ambiguous' };
  const current = pickCurrentOrder(door.orders);
  if (!current) return { kind: 'none' };
  if (pickCurrentOrder([...door.orders].reverse()) !== current) return { kind: 'ambiguous' };
  return { kind: 'order', order: current };
}

type Resolved =
  | { kind: 'match'; order: FiberOrder; sale: SyncSale }
  | { kind: 'ambiguous' };

/**
 * The join, resolved for one batch of orders: each sale the batch touches,
 * paired with its current row when that row can move a day.
 *
 * It writes only from a live, dated row. An active row's est day is history:
 * the page already reads the activation date for an installed order, and an
 * old install at the door must never be pushed onto a newer sale there. A row
 * with no est day cannot move one. And an order that is the current row of two
 * sales (two logs of one customer, say) writes neither.
 */
function resolveMatches(orders: FiberOrder[], sales: SyncSale[]): Resolved[] {
  const claimants = new Map<FiberOrder, SyncSale[]>();
  const out: Resolved[] = [];

  for (const sale of sales) {
    const current = currentOrderForSale(sale, orders);
    if (current.kind === 'none') continue;
    if (current.kind === 'ambiguous') {
      out.push({ kind: 'ambiguous' });
      continue;
    }
    const { order } = current;
    if (order.status === 'active' || !isDated(order)) continue;
    claimants.set(order, [...(claimants.get(order) ?? []), sale]);
  }

  for (const [order, claimed] of claimants) {
    if (claimed.length > 1) out.push({ kind: 'ambiguous' });
    else out.push({ kind: 'match', order, sale: claimed[0] });
  }
  return out;
}

/**
 * The carrier's current row for one sale, as this sync would read it from
 * `orders` (every stored order, at edit time). A rep's or admin's install-date
 * edit stores it, so a later report can tell the carrier's news from the same
 * old row the person already corrected. null when no single row is the sale.
 */
export function carrierOrderForSale(
  sale: { id: string; data: FirebaseFirestore.DocumentData },
  orders: FiberOrder[]
): CarrierSnapshot | null {
  const current = currentOrderForSale(toSyncSale(sale.id, sale.data), orders);
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
  const resolved = resolveMatches(orders, sales);
  result.checked = orders.filter(isDated).length;

  for (const entry of resolved) {
    if (entry.kind === 'ambiguous') {
      result.skippedAmbiguous += 1;
      continue;
    }

    const { order } = entry;
    let sale = entry.sale;
    let decision = decide(sale, order);
    const ref = adminDb.collection('sales').doc(sale.id);
    let written = false;

    // The sales were read once for the whole batch; a rep or admin may have set
    // the date since. The write is conditional on the sale being unchanged, and
    // a refused write is decided again, once, on a fresh read.
    for (let attempt = 0; decision.write && !written; attempt += 1) {
      const update = {
        installDate: decision.next,
        installDateSource: 'report',
        installDatePreviousDate: decision.previous,
        installDateChangedAt: now,
        updatedAt: now,
      };
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
              decision = { write: false, count: 'unchanged' };
              break;
            }
            sale = toSyncSale(fresh.id, fresh.data() ?? {}, fresh.updateTime ?? null);
            decision = decide(sale, order);
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

    if (!decision.write) {
      result[decision.count] += 1;
      continue;
    }
    if (!written) continue;

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
