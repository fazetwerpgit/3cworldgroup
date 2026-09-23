import type { CallDay, CompPlanCompanyRates, FiberOrder, Sale } from '@/types';
import { carrierReasonLabel } from '@/lib/fiberReport/carrierNotice';
import { expectedPayForSale } from '@/lib/pay/expectedPay';
import { carrierMark, planWithoutCarrier } from '@/lib/sales/carrierMark';
import {
  formatPayoutWindow,
  nextPayout,
  payoutWindowForSale,
  type UpcomingPayout,
} from '@/lib/pay/payoutWindow';
import {
  countedSales,
  emptyInstallCounts,
  installBucketForSale,
  isCarrierCancelled,
  type InstallCounts,
} from '@/lib/sales/installBucket';
import {
  chicagoMonthKey,
  currentMonth,
  isInChicagoMonth,
  salesSoldIn,
  shiftMonth,
} from '@/lib/sales/monthWindow';
import { datedSales, missedInstallSales, sumExpectedPay, undatedSales } from '@/lib/pay/payGroups';
import { periodBounds } from '@/lib/leaderboard/periods';
import { missedInstallDay } from '@/lib/sales/rescheduleDay';

// Everything the rep dashboard shows, derived from the rep's OWN book. Pure, so
// the dashboard, its tests and any later endpoint agree on one set of numbers.
//
// `sales` is always the caller's own sales (salesRepId = their uid) with the
// carrier's install dates already applied (applyCarrierInstallDates). Nothing
// here ever sees company-wide totals or comp margin.

type FiberMap = Map<string, FiberOrder>;

const orderFor = (sale: Pick<Sale, 'id'>, fiberBySale: FiberMap) => fiberBySale.get(sale.id || '');

// ---------------------------------------------------------------- pay card

export interface PaySummary {
  /**
   * Est. pay on non-cancelled sales whose INSTALL DATE — scheduled or completed
   * — falls in this calendar month (America/Chicago). Owner, 2026-09-22: pay
   * follows the install, not the sale. Null = no pay plan.
   */
  estThisMonth: number | null;
  /**
   * % change vs last month, counted the same way. Null when there is no plan or
   * last month had fewer than MIN_DELTA_BASE installs (no "+315%" off one sale).
   */
  deltaPct: number | null;
  /** Est. pay on non-cancelled sales with no install date yet. Null = no pay plan. */
  estNoDate: number | null;
  /** Est. pay on missed installs (carrier breakage), waiting on a new date. Null = no pay plan. */
  estMissed: number | null;
  /** This month's counted sales (by SALE date) by install bucket — a count, not money. */
  counts: InstallCounts;
  monthCount: number;
  /** Next estimated T-Fiber payout window (scheduled or completed installs), or null. */
  payout: UpcomingPayout | null;
}

/** Last month needs this many installs before a % change means anything. */
const MIN_DELTA_BASE = 3;

export function summarizePay(
  sales: Sale[],
  fiberBySale: FiberMap,
  rates: CompPlanCompanyRates | null,
  now: Date = new Date()
): PaySummary {
  const dated = datedSales(sales, fiberBySale);
  const month = chicagoMonthKey(now);
  const installsIn = (key: typeof month) =>
    dated.filter((sale) => isInChicagoMonth(sale.installDate as Date | string | undefined, key));

  const estThisMonth = sumExpectedPay(installsIn(month), rates);
  const lastMonth = installsIn(shiftMonth(month, -1));
  const estLastMonth = sumExpectedPay(lastMonth, rates);
  const deltaPct =
    estThisMonth !== null && estLastMonth && lastMonth.length >= MIN_DELTA_BASE
      ? Math.round(((estThisMonth - estLastMonth) / estLastMonth) * 100)
      : null;

  // The month's sales COUNT stays by sale date: it is activity, not money.
  const soldThisMonth = countedSales(salesSoldIn(sales, currentMonth(now)), fiberBySale);
  const counts = emptyInstallCounts();
  for (const sale of soldThisMonth) counts[installBucketForSale(sale, orderFor(sale, fiberBySale), now)] += 1;

  return {
    estThisMonth,
    deltaPct,
    estNoDate: sumExpectedPay(undatedSales(sales, fiberBySale), rates),
    estMissed: sumExpectedPay(missedInstallSales(sales, fiberBySale), rates),
    counts,
    monthCount: soldThisMonth.length,
    payout: nextPayout(dated, rates, now),
  };
}

// ---------------------------------------------------------------- sales rows

export type RowStatus = 'installed' | 'scheduled' | 'needs-date' | 'missed' | 'cancelled';

export interface RecentSaleRow {
  id: string;
  customer: string;
  plan: string;
  /** Carrier wordmark ("T-Fiber", "AT&T"), '' when the sale has no known carrier. */
  carrier: string;
  /** The plan without its leading carrier name, for rows that show the wordmark. */
  planShort: string;
  address: string;
  status: RowStatus;
  installDate: Date | null;
  /** Null = no pay plan (show a dash); 0 = no contracted rate yet. */
  estPay: number | null;
  /** "Oct 7–11" for a dated, live T-Fiber sale (scheduled or completed; not missed or cancelled), else null. */
  payoutLabel: string | null;
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function planLabel(sale: Pick<Sale, 'products' | 'productSold'>): string {
  const products = sale.products || [];
  if (!products.length) return sale.productSold || 'Plan not set';
  const first = products[0].productName || products[0].productId;
  return products.length > 1 ? `${first} +${products.length - 1}` : first;
}

export function rowStatus(sale: Sale, order: FiberOrder | undefined, now: Date): RowStatus {
  if (sale.status === 'cancelled' || sale.status === 'rejected' || isCarrierCancelled(order)) return 'cancelled';
  const bucket = installBucketForSale(sale, order, now);
  if (bucket === 'attention') return sale.installDate ? 'missed' : 'needs-date';
  return bucket;
}

/** The newest `limit` sales (the API returns them newest-logged first). */
export function recentSaleRows(
  sales: Sale[],
  fiberBySale: FiberMap,
  rates: CompPlanCompanyRates | null,
  now: Date = new Date(),
  limit = 5
): RecentSaleRow[] {
  return sales.slice(0, limit).map((sale) => {
    const status = rowStatus(sale, orderFor(sale, fiberBySale), now);
    // A missed install's date is stale, so it has no window until it is rescheduled.
    const window = payoutWindowForSale(sale, status !== 'cancelled' && status !== 'missed');
    const plan = planLabel(sale);
    const company = sale.products?.[0]?.company;
    return {
      id: sale.id || '',
      customer: sale.customerName || 'Customer',
      plan,
      carrier: carrierMark(company),
      planShort: planWithoutCarrier(plan, company),
      address: sale.customerAddress || '',
      status,
      installDate: toDate(sale.installDate),
      estPay: status === 'cancelled' ? null : expectedPayForSale(sale, rates),
      payoutLabel: window ? formatPayoutWindow(window) : null,
    };
  });
}

export interface NeedsDateRow {
  id: string;
  customer: string;
  plan: string;
  /** True when a date existed but the install broke at the door. */
  missed: boolean;
  /** The carrier's missed install day (its breakage row), when it gave one. */
  missedDay: string | null;
  /** "Missed Sep 19 · Customer not home": a missed install the carrier gave a reason for, else null. */
  missedNote: string | null;
}

const NOTE_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

/** "Missed Sep 19 · Customer not home", or null when the carrier gave no reason. */
function missedNote(sale: Sale, order: FiberOrder | undefined): string | null {
  if (order?.status !== 'breakage') return null;
  const reason = carrierReasonLabel(order.breakageReason);
  if (!reason) return null;
  const day = missedInstallDay(order.estInstallDate, sale.installDate);
  if (!day) return `Missed · ${reason}`;
  const [year, month, date] = day.split('-').map(Number);
  return `Missed ${NOTE_DAY.format(new Date(Date.UTC(year, month - 1, date)))} · ${reason}`;
}

/** Counted sales that still need an install date on the calendar, newest first. */
export function needsDateRows(sales: Sale[], fiberBySale: FiberMap, now: Date = new Date()): NeedsDateRow[] {
  return countedSales(sales, fiberBySale)
    .filter((sale) => installBucketForSale(sale, orderFor(sale, fiberBySale), now) === 'attention')
    .map((sale) => {
      const order = orderFor(sale, fiberBySale);
      const missed = !!sale.installDate;
      return {
        id: sale.id || '',
        customer: sale.customerName || 'Customer',
        plan: planLabel(sale),
        missed,
        missedDay: order?.status === 'breakage' ? order.estInstallDate ?? null : null,
        missedNote: missed ? missedNote(sale, order) : null,
      };
    });
}

// ---------------------------------------------------------------- standing

export interface LeaderboardRow {
  salesRepId: string;
  salesRepName: string;
  rank: number;
  totalPoints: number;
  totalSales: number;
}

export interface Standing {
  rank: number;
  of: number;
  points: number;
  /** The rep one place up, and how many points behind them we are. */
  ahead: { name: string; rank: number; points: number; gap: number } | null;
  /** Rank 1 only: points clear of 2nd (0 = tied). */
  leadBy: number | null;
  /** Level on points with the rep one place up. */
  tiedWith: string | null;
}

/** "Braeden Carter" → "Braeden C." */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || 'Unknown';
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

export function standingFrom(
  entries: LeaderboardRow[],
  me: LeaderboardRow | null,
  totalRanked: number
): Standing | null {
  if (!me) return null;
  const above = entries.find((entry) => entry.rank === me.rank - 1) ?? null;
  const below = entries.find((entry) => entry.rank === me.rank + 1) ?? null;
  const tied = above && above.totalPoints === me.totalPoints ? shortName(above.salesRepName) : null;
  return {
    rank: me.rank,
    of: Math.max(totalRanked, me.rank),
    points: me.totalPoints,
    ahead:
      above && !tied
        ? {
            name: shortName(above.salesRepName),
            rank: above.rank,
            points: above.totalPoints,
            gap: above.totalPoints - me.totalPoints,
          }
        : null,
    leadBy: me.rank === 1 && below ? me.totalPoints - below.totalPoints : null,
    tiedWith: tied,
  };
}

// ---------------------------------------------------------------- week + calls

/** Time left in the leaderboard week (Sun–Sat, Chicago): "4d 8h left", "5h 12m left". */
export function weekTimeLeft(now: Date = new Date()): string {
  const bounds = periodBounds('week', now);
  const ms = Math.max(0, (bounds?.end.getTime() ?? now.getTime()) - now.getTime());
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h ${minutes % 60}m left`;
}

export interface DashboardCall {
  id: string;
  title: string;
  day: CallDay;
  /** "HH:mm", 24h, Chicago. */
  time: string;
  meetLink?: string;
  active?: boolean;
}

function chicagoNow(now: Date): { day: CallDay; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return {
    day: get('weekday').toLowerCase() as CallDay,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function callMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** "14:30" → "2:30 PM" */
export function formatCallTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  if (!Number.isFinite(h)) return time;
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m || 0).padStart(2, '0')} ${suffix}`;
}

/** Today's active calls (Chicago), soonest first, dropping any that started over an hour ago. */
export function callsToday(calls: DashboardCall[], now: Date = new Date()): DashboardCall[] {
  const { day, minutes } = chicagoNow(now);
  return calls
    .filter((call) => call.active !== false && call.day === day && callMinutes(call.time) >= minutes - 60)
    .sort((a, b) => a.time.localeCompare(b.time));
}
