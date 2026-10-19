// The solar leaderboard, pure so the route and the tests agree.
//
// Reps rank by BOOKED CONSULTS: every solarBookings doc that is not cancelled,
// credited to the rep who owns the lead (booking.repUid, else the lead's
// repUid) and counted in the period its consult was BOOKED (createdAt), not
// when it happens. Same periods, order, rank history (movement, 7-day spark,
// streak) and team extras as the fiber board, so the fiber board's components
// draw it unchanged. Names, counts, modes and times only: no customer data.

import { computeHistory, dayKey, type SaleRecord } from '@/lib/leaderboard/history';
import { boardOrder } from '@/lib/leaderboard/order';
import { formatMonthParam } from '@/lib/leaderboard/periods';
import { isSolarRole } from '@/types/auth';
import { isDemoAccount } from '@/lib/users/demoAccount';
import { chicagoMonthKey } from '@/lib/sales/monthWindow';
import type { PlanMixEntry } from '@/lib/sales/planMix';

type Data = Record<string, unknown>;

export interface SolarBoardRow {
  rank: number;
  uid: string;
  name: string;
  /** Non-cancelled consults booked in the period. */
  booked: number;
  /** In the fiber board's plan-mix slot: booked consults by mode ("3× Virtual · 1× In person"). */
  mix: PlanMixEntry[];
  movement: number | null;
  spark: (number | null)[];
  streakDays: number;
}

/** A rep with a solar role and nothing booked this period. */
export interface SolarUnrankedRep {
  uid: string;
  name: string;
}

/** The newest booked consults team-wide: rep name, mode, when it was booked. */
export interface SolarRecentConsult {
  repName: string;
  /** "Virtual" or "In person". */
  plan: string;
  at: string;
  /** Server-side only (demo aliasing); routes strip it. */
  repKey?: string;
}

export interface CountedBooking {
  repUid: string;
  repName: string;
  mode: string;
  createdAt: Date;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

// Firestore hands back a Timestamp; a test or a hand-written doc can hold a
// Date or an ISO string.
export function toDate(value: unknown): Date | null {
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

/** The lead a booking belongs to: `leadId` (as POST bookings writes it) or `lead`. */
export function bookingLeadId(data: Data): string {
  return text(data.leadId) || text(data.lead);
}

export function modeLabel(mode: string): string {
  return mode === 'in_person' ? 'In person' : mode === 'virtual' ? 'Virtual' : 'Consult';
}

/**
 * The bookings the board counts: not cancelled, with a booked time and a rep.
 * The rep is booking.repUid, else the lead's (leadRepUid), else it is skipped.
 */
export function countedBookings(
  bookings: ReadonlyArray<{ id: string; data: Data }>,
  leadRepUid: ReadonlyMap<string, string>,
  names: ReadonlyMap<string, string>
): CountedBooking[] {
  const out: CountedBooking[] = [];
  for (const { data } of bookings) {
    if (data.status === 'cancelled') continue;
    const createdAt = toDate(data.createdAt);
    if (!createdAt) continue;
    const repUid = text(data.repUid) || leadRepUid.get(bookingLeadId(data)) || '';
    if (!repUid) continue;
    out.push({
      repUid,
      repName: names.get(repUid) || text(data.repName) || 'Unknown',
      mode: text(data.mode),
      createdAt,
    });
  }
  return out;
}

/** Mode counts, most first, then In person before Virtual on a tie. */
function modeMix(bookings: CountedBooking[]): PlanMixEntry[] {
  const counts = new Map<string, number>();
  for (const b of bookings) counts.set(modeLabel(b.mode), (counts.get(modeLabel(b.mode)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count || a.tier.localeCompare(b.tier));
}

/**
 * Every rep with a booking booked in [start, end), ranked by booked consults
 * (ties by name A to Z, then uid: the fiber board's order), with rank history.
 */
export function rankSolarBoard(
  counted: CountedBooking[],
  window: { start: Date | null; end: Date | null },
  opts: { now: Date; withHistory: boolean }
): SolarBoardRow[] {
  const start = window.start?.getTime() ?? -Infinity;
  const end = window.end?.getTime() ?? Infinity;
  const byRep = new Map<string, { name: string; bookings: CountedBooking[] }>();
  const allRecords: SaleRecord[] = [];
  const periodRecords: SaleRecord[] = [];

  for (const b of counted) {
    const record: SaleRecord = { salesRepId: b.repUid, saleDate: b.createdAt, totalPoints: 1, salesRepName: b.repName };
    allRecords.push(record);
    const time = b.createdAt.getTime();
    if (!(time >= start && time < end)) continue;
    periodRecords.push(record);
    const rep = byRep.get(b.repUid) ?? { name: b.repName, bookings: [] };
    rep.bookings.push(b);
    byRep.set(b.repUid, rep);
  }

  const ranked = [...byRep.entries()]
    .map(([uid, rep]) => ({ uid, name: rep.name, booked: rep.bookings.length, mix: modeMix(rep.bookings) }))
    .sort((a, b) => boardOrder({ score: a.booked, name: a.name, id: a.uid }, { score: b.booked, name: b.name, id: b.uid }));

  let history: ReturnType<typeof computeHistory> | null = null;
  if (opts.withHistory && ranked.length > 0) {
    try {
      history = computeHistory({
        periodSales: periodRecords,
        allSales: allRecords,
        currentRanks: new Map(ranked.map((row, index) => [row.uid, index + 1])),
        periodStartKey: dayKey(window.start ?? new Date(0)),
        metric: 'totalSales',
        now: opts.now,
      });
    } catch (error) {
      // Fail-soft, as the fiber board is: no history beats no board.
      console.error('Solar leaderboard history failed:', error);
    }
  }

  return ranked.map((row, index) => {
    const h = history?.get(row.uid);
    return { ...row, rank: index + 1, movement: h?.movement ?? null, spark: h?.spark ?? [], streakDays: h?.streakDays ?? 0 };
  });
}

/**
 * The solar team at 0: active users with a solar role and a display name,
 * not on the board this period, by name. Demo accounts are left out.
 */
export function unrankedSolarReps(
  users: ReadonlyArray<{ id: string; data: Data }>,
  rankedIds: ReadonlySet<string>
): SolarUnrankedRep[] {
  return users
    .filter(({ id, data }) =>
      data.status === 'active' && !rankedIds.has(id) && !isDemoAccount(data) && isSolarRole(data.solarRole) && !!text(data.displayName)
    )
    .map(({ id, data }) => ({ uid: id, name: text(data.displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
}

/** The newest `limit` booked consults, newest booked first. */
export function recentConsults(counted: CountedBooking[], limit = 5): SolarRecentConsult[] {
  return [...counted]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((b) => ({ repName: b.repName, plan: modeLabel(b.mode), at: b.createdAt.toISOString(), repKey: b.repUid }));
}

/** YYYY-MM of the earliest booked consult (office clock), or null. */
export function firstBookedMonth(counted: CountedBooking[]): string | null {
  if (counted.length === 0) return null;
  const first = counted.reduce((min, b) => (b.createdAt < min ? b.createdAt : min), counted[0].createdAt);
  return formatMonthParam(chicagoMonthKey(first));
}
