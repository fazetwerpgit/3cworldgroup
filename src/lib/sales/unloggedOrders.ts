import { customerLabel } from '@/lib/fiberReport/carrierNotice';
import { BULK_LOG_LINK, LOG_SALE_LINK } from '@/lib/sales/calloutNudge';
import type { MergedRow } from '@/lib/sales/mergeBook';
import { addDays, type DayKey } from '@/lib/weeklyInstalls/week';
import type { FiberOrderStatus } from '@/types/fiberOrder';

// Carrier orders nobody logged, as the reps' backstop push and the owner's
// "Orders not in the portal" count both read them. Pure.
//
// Which orders: the board's "Not in the portal" rows (buildMergedBook,
// state 'never_logged') with status pending_install, pre_sale or active (never
// cancelled, churned or breakage), ordered in the last UNLOGGED_WINDOW_DAYS
// Chicago days. A row whose admin link points at a missing sale (linkBroken)
// is left out: the rep may well have logged it.

export const UNLOGGED_WINDOW_DAYS = 30;
const LIVE: ReadonlySet<FiberOrderStatus> = new Set(['pending_install', 'pre_sale', 'active']);

export const UNLOGGED_ORDERS_TITLE = 'Orders not in the portal';

export interface UnloggedOrder {
  orderId: string;
  repId: string;
  repName: string;
  /** "1205 Southwood Dr": the street, the way the rep would know the door. */
  street: string;
  orderDate: string;
  status: FiberOrderStatus;
}

/** The board's "Not in the portal" rows that are live, recent and a rep's. */
export function unloggedOrders(rows: readonly MergedRow[], today: DayKey): UnloggedOrder[] {
  const since = addDays(today, -UNLOGGED_WINDOW_DAYS);
  const out: UnloggedOrder[] = [];
  for (const row of rows) {
    const order = row.order;
    if (row.state !== 'never_logged' || row.linkBroken || !order || !row.repId) continue;
    if (!LIVE.has(order.status)) continue;
    const day = typeof order.orderDate === 'string' ? order.orderDate.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || day < since || day > today) continue;
    out.push({
      orderId: order.id,
      repId: row.repId,
      repName: row.repName,
      street: customerLabel({ customerName: null, address: order.address ?? '' }, null),
      orderDate: day,
      status: order.status,
    });
  }
  // Oldest order first, so a push and its metadata read in the order they were sold.
  return out.sort((a, b) => a.orderDate.localeCompare(b.orderDate) || a.orderId.localeCompare(b.orderId));
}

/** One rep's push for the orders told this report. */
export function unloggedOrdersPush(orders: readonly UnloggedOrder[]): { title: string; message: string; link: string } {
  if (orders.length === 1) {
    return {
      title: UNLOGGED_ORDERS_TITLE,
      message: `T-Fiber has an order of yours that isn't logged yet (${orders[0].street}). Log it so it counts on the board and in your pay estimate.`,
      link: LOG_SALE_LINK,
    };
  }
  return {
    title: UNLOGGED_ORDERS_TITLE,
    message: `T-Fiber has ${orders.length} of your orders that aren't logged yet. Log them so they count on the board and in your pay estimate.`,
    link: BULK_LOG_LINK,
  };
}
