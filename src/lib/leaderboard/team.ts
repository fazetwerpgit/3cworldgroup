// The rest of the leaderboard page below the podium: the team at 0 for the
// period, and a short feed of the latest sales. Both come from the leaderboard
// API (opt-in, ?include=team), so a rep's browser never reads another rep's
// user or sale doc. Names, plan labels and times only: no customer data, no
// money, no role or tier.

import { resolveRoles } from '@/types/auth';
import { planWithoutCarrier } from '@/lib/sales/carrierMark';
import { installDayKey } from '@/lib/sales/saleDate';

export interface UnrankedRep {
  salesRepId: string;
  salesRepName: string;
}

export interface RecentSale {
  repName: string;
  /** Short plan label, carrier dropped: "1 Gig". */
  plan: string;
  /** ISO time. With `dayOnly` it is only the day the sale happened. */
  at: string;
  /** True when the sale was logged on another day than it happened, so the
   *  logged time would misstate when it happened; show the day, not "12m ago". */
  dayOnly?: boolean;
}

type Data = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// Firestore hands back a Timestamp; a locally-written doc (or a test) can hold
// a plain Date or an ISO string.
function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    const date = (value as { toDate: () => Date }).toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
  }
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

/**
 * Every rep on the team with nothing on the board this period, by name.
 * A rep is an ACTIVE user with a field role (resolveRoles, the same reading
 * the chat audiences use); pending and disabled accounts and back-office-only
 * users are left out. A user with no display name is skipped rather than shown
 * by email.
 */
export function unrankedReps(
  users: ReadonlyArray<{ id: string; data: Data }>,
  rankedIds: ReadonlySet<string>
): UnrankedRep[] {
  return users
    .filter(({ id, data }) => {
      if (data.status !== 'active' || rankedIds.has(id)) return false;
      const { fieldRole } = resolveRoles(text(data.role) || undefined, text(data.fieldRole) || undefined);
      return Boolean(fieldRole) && Boolean(text(data.displayName));
    })
    .map(({ id, data }) => ({ salesRepId: id, salesRepName: text(data.displayName) }))
    .sort((a, b) => a.salesRepName.localeCompare(b.salesRepName) || a.salesRepId.localeCompare(b.salesRepId));
}

function planOf(data: Data): string {
  const products = Array.isArray(data.products) ? (data.products as Data[]) : [];
  const first = products[0];
  const name = text(first?.productName) || text(first?.productId) || text(data.productSold);
  if (!name) return '';
  const short = planWithoutCarrier(name, text(first?.company) || null);
  return products.length > 1 ? `${short} +${products.length - 1}` : short;
}

/**
 * The newest `limit` sales that still stand (pending or approved: cancelled and
 * rejected sales are left out), newest logged first. `sales` should already be
 * ordered by createdAt, newest first.
 */
export function recentSales(sales: ReadonlyArray<Data>, limit = 5): RecentSale[] {
  const feed: RecentSale[] = [];
  for (const data of sales) {
    if (feed.length >= limit) break;
    if (data.status !== 'pending' && data.status !== 'approved') continue;
    const logged = toDate(data.createdAt);
    const happened = toDate(data.saleDate) ?? logged;
    if (!logged || !happened) continue;
    const repName = text(data.salesRepName) || 'Unknown';
    const sameDay = installDayKey(logged) === installDayKey(happened);
    feed.push(
      sameDay
        ? { repName, plan: planOf(data), at: logged.toISOString() }
        : { repName, plan: planOf(data), at: happened.toISOString(), dayOnly: true }
    );
  }
  return feed;
}
