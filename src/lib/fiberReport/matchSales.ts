import type { FiberOrder } from '@/types/fiberOrder';

export type LoggedSale = {
  salesRepId: string;
  customerName?: string | null;
  customerAddress?: string | null;
  createdAt?: Date | null;
};

export type SaleForFiberMatch = {
  id?: string;
  customerAddress?: string | null;
};

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

/** The last day the report says anything happened on this order. */
function latestDay(order: FiberOrder): string {
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

/** Match sales to the rep's own-scope API response in memory; callers own matchedUserId filtering. */
export function matchFiberOrdersToSales(
  sales: SaleForFiberMatch[],
  orders: FiberOrder[],
): Map<string, FiberOrder> {
  const matches = new Map<string, FiberOrder>();

  for (const sale of sales) {
    const saleId = sale.id;
    const saleAddress = normalizeAddress(sale.customerAddress);
    if (!saleId?.trim() || saleAddress.length < 6) continue;

    const atAddress = orders.filter((order) =>
      isAddressPrefixPair(saleAddress, normalizeAddress(order.address))
    );
    const selectedOrder = pickCurrentOrder(atAddress);
    if (selectedOrder) matches.set(saleId, selectedOrder);
  }

  return matches;
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
