// A dealer-code handoff: someone else sells on a rep's dealer code for a while.
//
// The carrier report credits every order to the dealer code it was placed
// under, and config/fiberRepMap maps a code to ONE portal user. When a rep's own
// code stops working and they sell on someone else's (Miles on Jeremy's
// 4808955 from 2026-10-05), the orders from that day on belong to the person
// actually selling. Stored in config/fiberRepMap.handoffs[code]:
//   { userId, from: 'YYYY-MM-DD', to?: 'YYYY-MM-DD' }
// `from` is inclusive and `to` exclusive. A handoff with no `to` closes itself
// on the first report that shows the borrower selling on any OTHER code (their
// own code works again): `to` becomes that order's date, so the code's later
// orders go back to its owner and the borrower keeps what they sold before.

export interface DealerHandoff {
  userId: string;
  from: string;
  to?: string | null;
}

export type DealerHandoffs = Record<string, DealerHandoff>;

interface DatedOrder {
  repDealerId: string;
  orderDate?: string | null;
  estInstallDate?: string | null;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** config/fiberRepMap.handoffs, keeping only well-formed entries. */
export function readHandoffs(raw: unknown): DealerHandoffs {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const handoffs: DealerHandoffs = {};
  for (const [code, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = value as Partial<DealerHandoff> | null;
    if (!entry || typeof entry.userId !== 'string' || typeof entry.from !== 'string' || !DAY.test(entry.from)) continue;
    handoffs[code] = {
      userId: entry.userId,
      from: entry.from,
      to: typeof entry.to === 'string' && DAY.test(entry.to) ? entry.to : null,
    };
  }
  return handoffs;
}

/**
 * The order's day: when it was placed, or for a breakage row (the carrier's
 * sheet has no order date) the install day it is about.
 */
function orderDay(order: DatedOrder): string | null {
  return order.orderDate ?? order.estInstallDate ?? null;
}

/** Who a handoff gives this order to, or null when no handoff covers it. */
export function handoffOwner(order: DatedOrder, handoffs: DealerHandoffs): string | null {
  const handoff = handoffs[order.repDealerId.trim()];
  const day = orderDay(order);
  if (!handoff || !day) return null;
  return day >= handoff.from && (!handoff.to || day < handoff.to) ? handoff.userId : null;
}

/**
 * Closes every open handoff whose borrower shows up in `orders` selling on a
 * different code, from the handoff's start on. Returns the updated handoffs
 * and the codes that closed (empty when nothing changed).
 */
export function closeHandoffs(
  handoffs: DealerHandoffs,
  orders: Array<DatedOrder & { matchedUserId: string | null }>,
): { handoffs: DealerHandoffs; closed: string[] } {
  const next: DealerHandoffs = { ...handoffs };
  const closed: string[] = [];
  for (const [code, handoff] of Object.entries(handoffs)) {
    if (handoff.to) continue;
    let firstOwnDay: string | null = null;
    for (const order of orders) {
      const day = orderDay(order);
      if (order.matchedUserId !== handoff.userId || order.repDealerId.trim() === code || !day || day < handoff.from) continue;
      if (!firstOwnDay || day < firstOwnDay) firstOwnDay = day;
    }
    if (firstOwnDay) {
      next[code] = { ...handoff, to: firstOwnDay };
      closed.push(code);
    }
  }
  return { handoffs: next, closed };
}
