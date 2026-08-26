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

function isAddressPrefixPair(a: string, b: string): boolean {
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 6 && longer.startsWith(shorter);
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

    let selectedOrder: FiberOrder | undefined;
    for (const order of orders) {
      const orderAddress = normalizeAddress(order.address);
      if (!isAddressPrefixPair(saleAddress, orderAddress)) continue;

      if (!selectedOrder) {
        selectedOrder = order;
        continue;
      }

      if (order.status === 'breakage' && selectedOrder.status !== 'breakage') {
        selectedOrder = order;
        continue;
      }

      if (selectedOrder.status !== 'breakage' && order.status !== 'breakage') {
        const selectedDate = selectedOrder.orderDate ?? selectedOrder.estInstallDate ?? '';
        const orderDate = order.orderDate ?? order.estInstallDate ?? '';
        if (orderDate > selectedDate) selectedOrder = order;
      }
    }

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
