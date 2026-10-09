import type { FiberOrder } from '@/types/fiberOrder';
import { installDayKey } from '@/lib/sales/saleDate';
import { normalizeOrderNumber } from '@/lib/sales/orderNumber';

export type LoggedSale = {
  salesRepId: string;
  salesRepName?: string | null;
  customerName?: string | null;
  customerAddress?: string | null;
  createdAt?: Date | null;
};

export type SaleForFiberMatch = {
  id?: string;
  customerAddress?: string | null;
  /** The day the sale was made: orders placed well before it are not this sale's. */
  saleDate?: unknown;
  /** The carrier order number the rep logged. When the report has it, it is the join. */
  orderNumberOrBtn?: unknown;
};

/**
 * An order number as the join compares it: normalizeOrderNumber, with the
 * letters a screenshot reader confuses for digits folded onto them ('TM0…' for
 * 'TMO…'). Both sides fold, so an exact match still matches. '' when there is
 * no number worth comparing.
 */
export function orderMatchKey(value: unknown): string {
  const key = normalizeOrderNumber(value).replace(/O/g, '0').replace(/I/g, '1');
  return key.length >= 6 ? key : '';
}

/** A carrier row's order number (its doc id) as orderMatchKey, '' for a breakage row (no order id). */
export function carrierOrderKey(order: Pick<FiberOrder, 'id'>): string {
  return typeof order.id === 'string' && !order.id.startsWith('brk_') ? orderMatchKey(order.id) : '';
}

/** Normalize a free-text address for conservative street-prefix matching. */
export function normalizeAddress(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isDead(order: FiberOrder): boolean {
  return order.status === 'cancelled' || order.status === 'churned';
}

/**
 * The address predicate behind every carrier↔sale join. Exported so a writer
 * (installDateSync) can ask the SAME question the read-time join asks, rather
 * than growing a second, subtly different idea of what "same address" means.
 */
export function isAddressPrefixPair(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 6 && longer.startsWith(shorter);
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A report day as a sortable 'YYYY-MM-DD', or '' when it is missing or unreadable. */
function isoDay(value: string | null | undefined): string {
  return typeof value === 'string' && ISO_DAY.test(value) ? value : '';
}

/** The last day the report says anything happened on this order ('' when none). */
export function latestDay(order: FiberOrder): string {
  let latest = '';
  for (const value of [
    order.orderDate,
    order.estInstallDate,
    order.activationDate,
    order.cancellationDate,
    order.deactivationDate,
  ]) {
    const day = isoDay(value);
    if (day > latest) latest = day;
  }
  return latest;
}

/**
 * Of several carrier rows at one address, the one that says where the customer
 * stands now. The read-time join and the install-date sync both ask this, so a
 * rep's page and the sale the report writes can never follow different rows.
 *
 *   1. Active. The install happened; nothing older or later at the door beats it.
 *   2. Otherwise the newest order row (by order day, else install day; on a tie
 *      a live order beats a cancelled one).
 *   3. A breakage row (a missed install) beats that order row only while the
 *      order has no news after the missed day. An order the carrier moved past
 *      the miss, or placed or cancelled after it, is the current state; one
 *      still showing the old day is the stale row the miss replaced.
 */
export function pickCurrentOrder(orders: readonly FiberOrder[]): FiberOrder | undefined {
  let active: FiberOrder | undefined;
  let latestOrder: FiberOrder | undefined;
  let breakage: FiberOrder | undefined;

  for (const order of orders) {
    if (order.status === 'active') {
      const day = isoDay(order.activationDate ?? order.orderDate ?? order.estInstallDate);
      const activeDay = active
        ? isoDay(active.activationDate ?? active.orderDate ?? active.estInstallDate)
        : '';
      if (!active || day > activeDay) active = order;
    } else if (order.status === 'breakage') {
      // Two misses at one door: the later one is the latest news.
      if (!breakage || isoDay(order.estInstallDate) > isoDay(breakage.estInstallDate)) {
        breakage = order;
      }
    } else if (!latestOrder) {
      latestOrder = order;
    } else {
      const selectedDate = latestOrder.orderDate ?? latestOrder.estInstallDate ?? '';
      const orderDate = order.orderDate ?? order.estInstallDate ?? '';
      if (orderDate > selectedDate) latestOrder = order;
      // Same day, one live and one dead: the carrier re-ordered at the same
      // address and cancelled the first. The live one is the customer's
      // order; picking the dead one by input order would cancel a real sale.
      else if (orderDate === selectedDate && isDead(latestOrder) && !isDead(order)) latestOrder = order;
    }
  }

  if (active) return active;
  if (latestOrder && breakage) {
    const missedDay = isoDay(breakage.estInstallDate);
    // An unreadable missed day keeps the miss showing: hiding a real missed
    // install costs the rep more than showing a resolved one a day longer.
    return missedDay && latestDay(latestOrder) > missedDay ? latestOrder : breakage;
  }
  return latestOrder ?? breakage;
}

const UNIT_WORD = /^(?:apartment|apt|unit|suite|ste|lot|room|rm|building|bldg|no|number)\b\.?\s*/;

/** A unit as one comparable token: 'Apt 4B', '#4b' and '4B' are all '4b'. '' when none. */
export function unitId(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  let unit = value.toLowerCase().trim().replace(/^#\s*/, '');
  for (let previous = ''; previous !== unit; ) {
    previous = unit;
    unit = unit.replace(UNIT_WORD, '').replace(/^#\s*/, '');
  }
  return unit.replace(/[^a-z0-9]/g, '');
}

const SALE_UNIT =
  /(?:\b(?:apartment|apt|unit|suite|ste|lot|room|rm)\b\.?|#)\s*#?\s*([a-z0-9][a-z0-9-]*)/i;

/** The unit a rep typed into a sale's address ('123 Main St Apt 4B' is '4b'), or ''. */
export function saleUnitId(address: string | null | undefined): string {
  if (typeof address !== 'string') return '';
  const match = SALE_UNIT.exec(address);
  return match ? unitId(match[1]) : '';
}

/**
 * The carrier rows at a sale's own door. The join matches on the street alone
 * (the rep's typed address rarely lines up with the carrier's unit column), so
 * in an apartment building the street brings in every neighbour's rows too.
 *
 * When the sale's address names a unit, rows printed with a DIFFERENT unit are
 * a neighbour's and never count. Rows with no unit printed (the cancelled sheet
 * never prints one) may be anyone's: they stay in, but only when the sale's own
 * unit is on the report too, or no row prints a unit at all; otherwise only the
 * ones that are not active, and the answer is not certain.
 *
 * With no unit on the sale, rows of one unit (or none) are one door, as before.
 * Rows of several units cannot be told apart: every row stays except the
 * active ones with a unit, so a neighbour's install never reads as this sale's.
 *
 * Not certain means the page shows its best guess and the install-date sync
 * writes nothing.
 */
export function doorOrders(
  saleAddress: string | null | undefined,
  candidates: readonly FiberOrder[]
): { orders: FiberOrder[]; certain: boolean } {
  const units = new Set(candidates.map((order) => unitId(order.unit)).filter(Boolean));
  const saleUnit = saleUnitId(saleAddress);

  if (saleUnit) {
    if (units.size === 0) return { orders: [...candidates], certain: true };
    const own = candidates.filter((order) => unitId(order.unit) === saleUnit);
    const unprinted = candidates.filter((order) => !unitId(order.unit));
    if (own.length) return { orders: [...own, ...unprinted], certain: true };
    return { orders: unprinted.filter((order) => order.status !== 'active'), certain: false };
  }

  if (units.size <= 1) return { orders: [...candidates], certain: true };
  return {
    orders: candidates.filter((order) => order.status !== 'active' || !unitId(order.unit)),
    certain: false,
  };
}

/** How long before the sale day an order may have been placed and still be this sale's. */
export const ORDER_BEFORE_SALE_DAYS = 7;

/**
 * The orders that can be a sale's, by date. An order placed well before the
 * sale was made is an earlier customer's, or this customer's earlier install:
 * at a door with an old active install, a re-order sale must not read as
 * installed. Orders with no order day (breakage rows) are kept, and so is
 * everything when the sale's day can't be read.
 */
export function ordersPlacedForSale(saleDate: unknown, orders: readonly FiberOrder[]): FiberOrder[] {
  const soldDay = installDayKey(saleDate);
  if (!soldDay) return [...orders];
  const cutoff = new Date(`${soldDay}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - ORDER_BEFORE_SALE_DAYS);
  const earliest = cutoff.toISOString().slice(0, 10);
  return orders.filter((order) => {
    const placed = isoDay(order.orderDate);
    return !placed || placed >= earliest;
  });
}

/**
 * The explicit join. `saleLink` is an admin saying "this order IS that sale" or
 * "this order is NOT any sale" (saleId null); either way it outranks the
 * address guess, which is only ever a guess.
 */
export function linkedSaleId(
  order: Pick<FiberOrder, 'saleLink'>
): { linked: true; saleId: string | null } | { linked: false } {
  const link = order.saleLink;
  if (!link) return { linked: false };
  const saleId = typeof link.saleId === 'string' && link.saleId.trim() ? link.saleId.trim() : null;
  return { linked: true, saleId };
}

/**
 * The open (unlinked) carrier rows by order number. A sale whose logged order
 * number is here IS that row: no address guess, no door, no date window.
 */
export function ordersByNumber(orders: readonly FiberOrder[]): Map<string, FiberOrder> {
  const byNumber = new Map<string, FiberOrder>();
  for (const order of orders) {
    const key = carrierOrderKey(order);
    if (key && !byNumber.has(key)) byNumber.set(key, order);
  }
  return byNumber;
}

export interface FiberMatchResult {
  matches: Map<string, FiberOrder>;
  /**
   * Address-matched sales (no order number of their own on the report) whose
   * door holds a row another sale claimed by order number. The address guess
   * may not take that row, but it is still the evidence that both sales are
   * one customer, so the possible-duplicate flag reads it from here.
   */
  contested: Map<string, FiberOrder>;
}

/**
 * Match sales to carrier rows in memory; callers own matchedUserId filtering.
 *
 *   1. saleLink. A linked order leaves the pool whichever way its link points,
 *      and a sale it names takes it over everything else.
 *   2. Order number. A sale whose logged number is on the report is that row,
 *      even at a door with a missed-install or cancelled row beside it.
 *   3. Address, for a sale with no number or a number the report does not
 *      have. Rows claimed in step 2 are out of this pool: one carrier row is
 *      one sale's, and a second sale at the door must not take it by street.
 */
export function matchFiberOrdersToSalesDetailed(
  sales: SaleForFiberMatch[],
  orders: FiberOrder[],
): FiberMatchResult {
  const matches = new Map<string, FiberOrder>();
  const contested = new Map<string, FiberOrder>();
  const saleIds = new Set(sales.map((sale) => sale.id).filter((id): id is string => !!id?.trim()));
  const openOrders: FiberOrder[] = [];

  for (const order of orders) {
    const link = linkedSaleId(order);
    if (!link.linked) {
      openOrders.push(order);
      continue;
    }
    // At most one order per sale: the first link to name it keeps it.
    if (link.saleId && saleIds.has(link.saleId) && !matches.has(link.saleId)) {
      matches.set(link.saleId, order);
    }
  }

  const byNumber = ordersByNumber(openOrders);
  const claimedByNumber = new Set<FiberOrder>();
  for (const sale of sales) {
    const saleId = sale.id;
    if (!saleId?.trim() || matches.has(saleId)) continue;
    const order = byNumber.get(orderMatchKey(sale.orderNumberOrBtn));
    if (!order) continue;
    matches.set(saleId, order);
    claimedByNumber.add(order);
  }

  for (const sale of sales) {
    const saleId = sale.id;
    const saleAddress = normalizeAddress(sale.customerAddress);
    if (!saleId?.trim() || matches.has(saleId) || saleAddress.length < 6) continue;

    const atAddress = ordersPlacedForSale(sale.saleDate, openOrders).filter((order) =>
      isAddressPrefixPair(saleAddress, normalizeAddress(order.address))
    );
    const door = doorOrders(sale.customerAddress, atAddress).orders;
    const taken = door.find((order) => claimedByNumber.has(order));
    if (taken) contested.set(saleId, taken);
    const selectedOrder = pickCurrentOrder(door.filter((order) => !claimedByNumber.has(order)));
    if (selectedOrder) matches.set(saleId, selectedOrder);
  }

  return { matches, contested };
}

/** matchFiberOrdersToSalesDetailed, the matches alone: what every page and digest reads. */
export function matchFiberOrdersToSales(
  sales: SaleForFiberMatch[],
  orders: FiberOrder[],
): Map<string, FiberOrder> {
  return matchFiberOrdersToSalesDetailed(sales, orders).matches;
}

function timestamp(sale: LoggedSale): number {
  const time = sale.createdAt?.getTime();
  return typeof time === 'number' && Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

/** Attach names from sales logged by the same representative, in memory only. */
export function attachLoggedCustomerNames(
  orders: FiberOrder[],
  sales: LoggedSale[],
): FiberOrder[] {
  return orders.map((order) => {
    const orderAddress = normalizeAddress(order.address);
    if (order.matchedUserId === null || orderAddress.length < 6) {
      return { ...order, loggedCustomerName: null };
    }

    let latestMatch: LoggedSale | undefined;
    for (const sale of sales) {
      const customerName = sale.customerName?.trim();
      if (
        sale.salesRepId !== order.matchedUserId ||
        !customerName
      ) continue;

      const saleAddress = normalizeAddress(sale.customerAddress);
      if (!isAddressPrefixPair(orderAddress, saleAddress)) continue;

      if (!latestMatch || timestamp(sale) > timestamp(latestMatch)) {
        latestMatch = sale;
      }
    }

    return {
      ...order,
      loggedCustomerName: latestMatch?.customerName?.trim() ?? null,
    };
  });
}

/**
 * The portal's name for each order's matched rep, from the rep's own logged
 * sales (the newest one's salesRepName), in memory only. The report prints the
 * dealer code's owner, which under a handoff is another rep entirely (Miles
 * sells on Jeremy's code), so a page must never title a portal rep with it.
 * null when the matched rep has logged nothing to take a name from.
 */
export function attachMatchedUserNames(orders: FiberOrder[], sales: LoggedSale[]): FiberOrder[] {
  const latest = new Map<string, LoggedSale>();
  for (const sale of sales) {
    if (!sale.salesRepId || !sale.salesRepName?.trim()) continue;
    const seen = latest.get(sale.salesRepId);
    if (!seen || timestamp(sale) > timestamp(seen)) latest.set(sale.salesRepId, sale);
  }
  return orders.map((order) => ({
    ...order,
    matchedUserName: (order.matchedUserId && latest.get(order.matchedUserId)?.salesRepName?.trim()) || null,
  }));
}

/** Statuses a leftover row may fold under a sale with: history, never a live order. */
const FOLDABLE = new Set<FiberOrder['status']>(['breakage', 'cancelled', 'churned']);

function doorKey(order: FiberOrder): string {
  const street = normalizeAddress(order.address);
  return street.length >= 6 ? `${street}|${unitId(order.unit)}|${order.matchedUserId ?? ''}` : '';
}

/**
 * Carrier rows nobody's sale holds that sit at the door of a row a sale does
 * hold: a missed install, a cancelled first attempt, beside the order the sale
 * matched. They are that customer's history, not a sale nobody logged, so a
 * page folds them under the sale instead of showing them red.
 *
 * Same door means the same normalized street, the same unit (none = none) and
 * the same matched rep. Only dead and missed rows fold: a live leftover (pending,
 * active, pre-sale) may be a second, real sale and stays as it was. Linked rows
 * never fold; an admin already said what they are.
 *
 * Returns each folded row → the held row it sits beside.
 */
export function foldLeftoverOrders(
  orders: readonly FiberOrder[],
  held: Iterable<FiberOrder>
): Map<FiberOrder, FiberOrder> {
  const heldSet = new Set(held);
  const byDoor = new Map<string, FiberOrder>();
  for (const order of heldSet) {
    const key = doorKey(order);
    if (key && !byDoor.has(key)) byDoor.set(key, order);
  }
  const folded = new Map<FiberOrder, FiberOrder>();
  for (const order of orders) {
    if (heldSet.has(order) || !FOLDABLE.has(order.status) || linkedSaleId(order).linked) continue;
    const beside = byDoor.get(doorKey(order));
    if (beside) folded.set(order, beside);
  }
  return folded;
}
