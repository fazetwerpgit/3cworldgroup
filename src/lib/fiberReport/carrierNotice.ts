import type { OrderSale } from '@/lib/sales/installDateSync';
import type { FiberOrder } from '@/types/fiberOrder';

// Which carrier-report changes a rep hears about, and in what words. Pure: the
// reads, the once-only claim and the sending live in carrierNotices.ts.
//
// A rep is told when one of their orders newly lands in a missed install, a
// carrier cancel or a disconnect. "Newly" is the whole game: the report is a
// full snapshot re-sent every morning, so everything here compares against the
// order as it was stored before this report was written.

export type CarrierIssueStatus = 'breakage' | 'cancelled' | 'churned';

/** More than this many notices for one rep from one report become one summary. */
export const NOTICE_CAP = 5;

/** The order as stored before this report's upsert. */
export interface StoredOrder {
  status: string | null;
  /** carrierNotice.status: the issue the rep was already told about. */
  noticeStatus: string | null;
}

export interface CarrierNotice {
  orderId: string;
  status: CarrierIssueStatus;
  userId: string;
  saleId: string | null;
  title: string;
  message: string;
  link: string;
}

/** One bell + push to send: a single notice, or a capped rep's summary. */
export interface CarrierDispatch {
  userId: string;
  title: string;
  message: string;
  link: string;
  orderIds: string[];
  summary: boolean;
}

export interface PlanInput {
  /** The report's orders, as upserted. */
  orders: readonly FiberOrder[];
  /** Stored state before the upsert. Absent id = the report brings a new row. */
  stored: ReadonlyMap<string, StoredOrder>;
  /** The sale each order is (installDateSync's join). */
  orderSales: ReadonlyMap<string, OrderSale>;
}

const SALES_LINK = '/portal/sales';

function isIssue(status: string | null | undefined): status is CarrierIssueStatus {
  return status === 'breakage' || status === 'cancelled' || status === 'churned';
}

/**
 * The notices one report earns, before the once-only claim:
 *   - the order's status is breakage, cancelled or churned;
 *   - the rep was not already told about that status on that order;
 *   - it is a TRANSITION: the stored order had a different status. A row the
 *     report brings for the first time (every missed install is one: those
 *     rows are keyed by address + missed day) counts only when it is the
 *     current row of a sale the rep logged, so a first import or a re-import
 *     never replays the carrier's old history at anyone;
 *   - its sale, if any, is still open (not cancelled or rejected);
 *   - someone to tell: the sale's rep, else the rep the report names.
 */
export function planCarrierNotices({ orders, stored, orderSales }: PlanInput): CarrierNotice[] {
  const notices: CarrierNotice[] = [];
  for (const order of orders) {
    if (!isIssue(order.status)) continue;
    const before = stored.get(order.id);
    if (before?.noticeStatus === order.status) continue;
    if (before?.status === order.status) continue;
    const sale = orderSales.get(order.id) ?? null;
    // A sale nobody is working any more: the carrier's news about it is not news.
    if (sale && (sale.status === 'cancelled' || sale.status === 'rejected')) continue;
    const transition = Boolean(before?.status);
    if (!transition && !sale) continue;

    const userId = sale?.salesRepId || order.matchedUserId;
    if (!userId) continue;
    notices.push({
      orderId: order.id,
      status: order.status,
      userId,
      saleId: sale?.saleId ?? null,
      ...noticeCopy(order.status, order, sale),
      link: sale ? `${SALES_LINK}/${sale.saleId}` : SALES_LINK,
    });
  }
  return notices;
}

/** One dispatch per notice, except a rep with more than `cap` gets one summary. */
export function groupCarrierNotices(
  notices: readonly CarrierNotice[],
  cap: number = NOTICE_CAP
): CarrierDispatch[] {
  const byUser = new Map<string, CarrierNotice[]>();
  for (const notice of notices) {
    byUser.set(notice.userId, [...(byUser.get(notice.userId) ?? []), notice]);
  }

  const out: CarrierDispatch[] = [];
  for (const [userId, own] of byUser) {
    if (own.length > cap) {
      out.push({
        userId,
        title: 'Carrier report',
        message: `${own.length} orders need attention · Open Sales`,
        link: SALES_LINK,
        orderIds: own.map((notice) => notice.orderId),
        summary: true,
      });
      continue;
    }
    for (const notice of own) {
      out.push({
        userId,
        title: notice.title,
        message: notice.message,
        link: notice.link,
        orderIds: [notice.orderId],
        summary: false,
      });
    }
  }
  return out;
}

function noticeCopy(
  status: CarrierIssueStatus,
  order: FiberOrder,
  sale: OrderSale | null
): { title: string; message: string } {
  const who = customerLabel(order, sale);
  const reason = carrierReasonLabel(order.breakageReason);
  const withReason = reason ? `${who} · ${reason}` : who;
  switch (status) {
    case 'breakage':
      return { title: 'Install missed', message: `${withReason}. Pick a new date.` };
    case 'cancelled':
      return { title: 'Carrier cancelled an order', message: withReason };
    case 'churned':
      return { title: 'Customer disconnected', message: who };
  }
}

/** 'MAIN ST' reads as 'Main St'; anything already mixed-case is left as typed. */
export function unshout(value: string): string {
  if (/[a-z]/.test(value)) return value;
  return value.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

/**
 * Who the order is, in a lock-screen-sized line: the customer's first name and
 * last initial (the rep's logged name first, then the breakage sheet's), else
 * the street, else a plain fallback.
 */
export function customerLabel(
  order: Pick<FiberOrder, 'customerName' | 'address'>,
  sale: Pick<OrderSale, 'customerName' | 'customerAddress'> | null
): string {
  const name = (sale?.customerName ?? order.customerName ?? '').trim();
  if (name) {
    const [first, ...rest] = unshout(name).split(/\s+/);
    const last = rest.at(-1);
    return last ? `${first} ${last[0].toUpperCase()}.` : first;
  }
  const street = (sale?.customerAddress ?? order.address ?? '').split(',')[0].trim();
  return street ? unshout(street) : 'A customer';
}

/**
 * The carrier's missed-install reason in plain words. The report stores
 * 'TMO_REASON — REASON_CODE' (either half may be blank); the code is the
 * specific half, so it wins. Sentence case, keeping short acronyms (CX, TV)
 * unless the whole thing is shouted: 'CX Missed — Customer Not Home' is
 * 'Customer not home', 'CX Missed — ' is 'CX missed'.
 */
export function carrierReasonLabel(reason: string | null | undefined): string | null {
  if (!reason) return null;
  const halves = reason
    .split('—')
    .map((half) => half.trim())
    .filter(Boolean);
  const chosen = halves.length > 1 ? halves[halves.length - 1] : halves[0];
  if (!chosen) return null;

  const shouted = !/[a-z]/.test(chosen);
  return chosen
    .split(/\s+/)
    .map((word, index) => {
      if (!shouted && /^[A-Z0-9]{2,}$/.test(word) && /[A-Z]/.test(word)) return word;
      const lower = word.toLowerCase();
      return index === 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}
