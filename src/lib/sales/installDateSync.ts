import { adminDb } from '@/lib/firebase/admin';
import { dispatchToUser } from '@/lib/alerts/dispatch';
import { isAddressPrefixPair, normalizeAddress } from '@/lib/fiberReport/matchSales';
import { formatInstallDay, installDayKey, parseInstallDateInput } from '@/lib/sales/saleDate';
import type { FiberOrder, InstallDateSyncCounts } from '@/types/fiberOrder';
import type { Sale } from '@/types/sales';

// The carrier moves install dates and tells nobody. Until now the report only
// ever landed in `fiberOrders`, so a rep's own sale kept the day they typed and
// the first they heard of a change was a customer ringing them. This is the one
// place the report is allowed to WRITE a sale.
//
// It writes only where it is certain. A sale's install date drives the pipeline
// bucket and expected pay, so a wrong auto-edit is worse than no edit: every
// join here has to be unambiguous in BOTH directions (one sale for the order,
// one dated order for the sale) or the row is left alone for a human. The
// matching itself is the same question matchFiberOrdersToSales asks at read
// time — same normalisation, same prefix predicate, same saleLink override —
// so the page and the writer can never disagree about which sale an order is.

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
  installDate: unknown;
  status: string | null;
  /** Who set the date last: 'rep' | 'admin' | 'report', or null on older rows. */
  installDateSource: string | null;
  /** The carrier's est install day when the rep last set the date (see carrierDateForSale). */
  repEditCarrierDate: string | null;
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

function toSyncSale(id: string, data: FirebaseFirestore.DocumentData): SyncSale {
  const customerAddress = text(data.customerAddress);
  return {
    id,
    salesRepId: text(data.salesRepId) ?? '',
    customerName: text(data.customerName),
    customerAddress,
    normalizedAddress: normalizeAddress(customerAddress),
    installDate: data.installDate ?? null,
    status: text(data.status),
    installDateSource: text(data.installDateSource),
    repEditCarrierDate: text(data.repEditCarrierDate),
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

/**
 * The join, resolved for one batch of orders.
 *
 * `saleLink` outranks everything — it is an admin saying out loud which sale an
 * order is (or that it is none) — and a sale it names leaves the address pool
 * entirely, exactly as buildMergedBook does it. What survives into the address
 * pass is then matched BOTH ways: an order claiming two sales, or a sale
 * claimed by two dated orders, is ambiguous and nothing is written for it.
 *
 * Only DATED orders compete for a sale. An order with no est install date
 * cannot move a day, so letting it block one would mean a second carrier row at
 * the same address (a pre-sale row, say) silently switched the feature off.
 */
type Resolved =
  | { kind: 'match'; order: FiberOrder; sale: SyncSale }
  | { kind: 'ambiguous'; order: FiberOrder }
  | { kind: 'none'; order: FiberOrder };

function resolveMatches(orders: FiberOrder[], sales: SyncSale[]): Resolved[] {
  const salesById = new Map<string, SyncSale>();
  for (const sale of sales) {
    if (!salesById.has(sale.id)) salesById.set(sale.id, sale);
  }

  // Pass 1 — explicit links. A sale named by ANY link is out of the address
  // pool whichever order named it, and a sale named by two orders is a
  // contradiction an admin has to settle, not a date to write.
  const linkedSaleIds = new Map<string, number>();
  for (const order of orders) {
    const saleId = text(order.saleLink?.saleId);
    if (!saleId) continue;
    linkedSaleIds.set(saleId, (linkedSaleIds.get(saleId) ?? 0) + 1);
  }

  const dated = orders.filter((order) => text(order.estInstallDate) !== null);
  const openSales = sales.filter((sale) => !linkedSaleIds.has(sale.id));
  const openDatedOrders = dated.filter((order) => !order.saleLink);

  // How many dated orders in this batch the address guess would hand a sale.
  const claimsPerSale = new Map<string, number>();
  const candidatesByOrder = new Map<FiberOrder, SyncSale[]>();
  for (const order of openDatedOrders) {
    const orderAddress = normalizeAddress(order.address);
    const candidates =
      orderAddress.length >= 6
        ? openSales.filter(
            (sale) =>
              sale.normalizedAddress.length >= 6 &&
              isAddressPrefixPair(sale.normalizedAddress, orderAddress)
          )
        : [];
    candidatesByOrder.set(order, candidates);
    for (const sale of candidates) {
      claimsPerSale.set(sale.id, (claimsPerSale.get(sale.id) ?? 0) + 1);
    }
  }

  return dated.map((order): Resolved => {
    if (order.saleLink) {
      const saleId = text(order.saleLink.saleId);
      // saleId null is an admin's "this is not any sale" — deliberate, not a miss.
      if (!saleId) return { kind: 'none', order };
      if ((linkedSaleIds.get(saleId) ?? 0) > 1) return { kind: 'ambiguous', order };
      const sale = salesById.get(saleId);
      // A link pointing at a deleted sale: the board already renders that as a
      // broken link for a human to fix. Nothing to write here.
      return sale ? { kind: 'match', order, sale } : { kind: 'none', order };
    }

    const candidates = candidatesByOrder.get(order) ?? [];
    if (candidates.length === 0) return { kind: 'none', order };
    if (candidates.length > 1) return { kind: 'ambiguous', order };
    const sale = candidates[0];
    if ((claimsPerSale.get(sale.id) ?? 0) > 1) return { kind: 'ambiguous', order };
    return { kind: 'match', order, sale };
  });
}

/**
 * The carrier's est install day for one sale as this sync would read it: the
 * single dated order that is this sale (by saleLink, or by address when no
 * other dated order claims it too), else null. The rep's install-date edit
 * stores it, so a later report can tell the carrier's news from the same old
 * date the rep already corrected.
 */
export function carrierDateForSale(
  sale: { id: string; data: FirebaseFirestore.DocumentData },
  orders: FiberOrder[]
): string | null {
  const matches = resolveMatches(orders, [toSyncSale(sale.id, sale.data)]).filter(
    (entry): entry is Extract<Resolved, { kind: 'match' }> => entry.kind === 'match'
  );
  if (matches.length !== 1) return null;
  return text(matches[0].order.estInstallDate);
}

/**
 * Moves a sale's install date to the day the carrier's report gives, and tells
 * the rep it moved. Never throws: a report that already landed must not be
 * failed by a follow-up write, so every per-sale failure is logged and counted.
 */
export async function syncInstallDatesFromOrders(
  input: SyncInstallDatesInput
): Promise<InstallDateSyncResult> {
  const result = emptyResult();
  const now = input.now ?? new Date();
  const orders = input.orders ?? [];
  if (!orders.length) return result;
  if (!adminDb) {
    console.error('[installDateSync] database not configured');
    return result;
  }

  const snapshot = await adminDb.collection('sales').get();
  const sales = snapshot.docs.map((doc) => toSyncSale(doc.id, doc.data() ?? {}));
  const resolved = resolveMatches(orders, sales);
  result.checked = resolved.length;

  for (const entry of resolved) {
    if (entry.kind === 'none') continue;
    if (entry.kind === 'ambiguous') {
      result.skippedAmbiguous += 1;
      continue;
    }

    const { order, sale } = entry;
    // A cancelled sale is history. Moving its date would put a dead row back
    // into the pipeline and ping a rep about a customer who backed out.
    if (sale.status === 'cancelled') {
      result.skippedCancelled += 1;
      continue;
    }

    const parsed = parseInstallDateInput(order.estInstallDate);
    if (!parsed.ok) {
      // An unreadable or absurd carrier date is not a change worth making.
      console.error(
        `[installDateSync] order ${order.id} has an unusable est install date`,
        order.estInstallDate
      );
      result.unchanged += 1;
      continue;
    }

    // The rep set this date themselves after seeing the carrier's. The report
    // only overrides them with news: a carrier date that differs from the one
    // on record when they edited. The same old date again is not news, and
    // writing it back would undo the rep's fix every morning.
    if (
      sale.installDateSource === 'rep' &&
      text(order.estInstallDate) === sale.repEditCarrierDate
    ) {
      result.unchanged += 1;
      continue;
    }

    const next = parsed.date;
    const previousDay = installDayKey(sale.installDate);
    if (previousDay && previousDay === installDayKey(next)) {
      result.unchanged += 1;
      continue;
    }

    const previous = toDate(sale.installDate);

    try {
      await adminDb.collection('sales').doc(sale.id).update({
        installDate: next,
        installDateSource: 'report',
        installDatePreviousDate: previous,
        installDateChangedAt: now,
        updatedAt: now,
      });
    } catch (error) {
      console.error(`[installDateSync] failed to update sale ${sale.id}`, error);
      result.errors += 1;
      continue;
    }

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
