// The solar leaderboard, pure so the route and the tests agree.
//
// Three boards, one ranking: SET (the default) ranks BOOKED CONSULTS: every
// solarBookings doc that is not cancelled, credited to the rep who owns the
// lead (the lead's repUid, else booking.repUid) and counted in the period its
// consult was BOOKED (createdAt), not when it happens. DEMOED ranks leads that
// reached the demo (any outcome) and CLOSED leads whose outcome is a sale, both
// credited to the lead's rep (the setter) and counted by when the lead got
// there (lib/solar/leadMilestones). Same periods, order, rank history (movement, 7-day spark,
// streak) and team extras as the fiber board, so the fiber board's components
// draw it unchanged. Names, counts, modes and times only: no customer data.

import { computeHistory, dayKey, type SaleRecord } from '@/lib/leaderboard/history';
import { boardOrder } from '@/lib/leaderboard/order';
import { formatMonthParam } from '@/lib/leaderboard/periods';
import { isSolarRole } from '@/types/auth';
import { isHiddenUser } from '@/lib/users/demoAccount';
import { chicagoMonthKey } from '@/lib/sales/monthWindow';
import type { PlanMixEntry } from '@/lib/sales/planMix';

type Data = Record<string, unknown>;

/** Which count the solar board ranks by: ?metric=set|demoed|closed. */
export type SolarBoardMetric = 'set' | 'demoed' | 'closed';

/** The ?metric param, read leniently: anything unknown is the Set board. */
export function parseSolarMetric(raw: string | null): SolarBoardMetric {
  if (raw === 'demoed' || raw === 'solarDemoed') return 'demoed';
  if (raw === 'closed' || raw === 'solarClosed') return 'closed';
  return 'set';
}

/** One counted thing on the board: a booked consult, a demo, a close. */
export interface SolarEvent {
  repUid: string;
  repName: string;
  at: Date;
  /** Its label in the mix line and the recent list ("Virtual", "Sale", ...). */
  kind: string;
}

export interface SolarBoardRow {
  rank: number;
  uid: string;
  name: string;
  /** What the board counts in the period (consults booked, demos, closes). */
  count: number;
  /** In the fiber board's plan-mix slot: the count by kind ("3× Virtual · 1× In person"). */
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

/** The newest events team-wide: rep name, kind (mode or outcome), when. */
export interface SolarRecentConsult {
  repName: string;
  /** "Virtual" / "In person" on Set; the outcome on Demoed and Closed. */
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
 * The rep is the lead's owner (leadRepUid), the same rep Demoed and Closed
 * credit, else booking.repUid (a lead without one), else it is skipped.
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
    const repUid = leadRepUid.get(bookingLeadId(data)) || text(data.repUid) || '';
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

/** The board's events for booked consults: one per counted booking, by mode. */
export function bookingEvents(counted: CountedBooking[]): SolarEvent[] {
  return counted.map((b) => ({ repUid: b.repUid, repName: b.repName, at: b.createdAt, kind: modeLabel(b.mode) }));
}

export function outcomeLabel(outcome: string | null): string {
  return outcome === 'sale' ? 'Sale' : outcome === 'no_sale' ? 'No sale' : outcome === 'proposal_sent' ? 'Proposal sent' : 'Demoed';
}

/**
 * The board's events for Demoed or Closed: one per lead that stands there,
 * credited to the lead's rep (the setter) and dated when it got there.
 * Demo accounts' leads ('demo' status) and leads with no rep are skipped.
 */
export function leadEvents(
  leads: ReadonlyArray<{ id: string; data: Data }>,
  metric: 'demoed' | 'closed',
  names: ReadonlyMap<string, string>,
  milestones: (data: Data) => { demoedAt: Date | null; outcome: string | null; closedAt: Date | null }
): SolarEvent[] {
  const out: SolarEvent[] = [];
  for (const { data } of leads) {
    if (data.status === 'demo') continue;
    const repUid = text(data.repUid);
    if (!repUid) continue;
    const m = milestones(data);
    const at = metric === 'closed' ? m.closedAt : m.demoedAt;
    if (!at) continue;
    out.push({
      repUid,
      repName: names.get(repUid) || text(data.repName) || 'Unknown',
      at,
      kind: metric === 'closed' ? 'Sale' : outcomeLabel(m.outcome),
    });
  }
  return out;
}

/** Kind counts, most first, then A to Z on a tie (In person before Virtual). */
function kindMix(events: SolarEvent[]): PlanMixEntry[] {
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tier, count]) => ({ tier, count }))
    .sort((a, b) => b.count - a.count || a.tier.localeCompare(b.tier));
}

/**
 * Every rep with an event in [start, end), ranked by their count (ties by
 * name A to Z, then uid: the fiber board's order), with rank history.
 */
export function rankSolarBoard(
  counted: SolarEvent[],
  window: { start: Date | null; end: Date | null },
  opts: { now: Date; withHistory: boolean }
): SolarBoardRow[] {
  const start = window.start?.getTime() ?? -Infinity;
  const end = window.end?.getTime() ?? Infinity;
  const byRep = new Map<string, { name: string; events: SolarEvent[] }>();
  const allRecords: SaleRecord[] = [];
  const periodRecords: SaleRecord[] = [];

  for (const b of counted) {
    const record: SaleRecord = { salesRepId: b.repUid, saleDate: b.at, totalPoints: 1, salesRepName: b.repName };
    allRecords.push(record);
    const time = b.at.getTime();
    if (!(time >= start && time < end)) continue;
    periodRecords.push(record);
    const rep = byRep.get(b.repUid) ?? { name: b.repName, events: [] };
    rep.events.push(b);
    byRep.set(b.repUid, rep);
  }

  const ranked = [...byRep.entries()]
    .map(([uid, rep]) => ({ uid, name: rep.name, count: rep.events.length, mix: kindMix(rep.events) }))
    .sort((a, b) => boardOrder({ score: a.count, name: a.name, id: a.uid }, { score: b.count, name: b.name, id: b.uid }));

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
      data.status === 'active' && !rankedIds.has(id) && !isHiddenUser(data) && isSolarRole(data.solarRole) && !!text(data.displayName)
    )
    .map(({ id, data }) => ({ uid: id, name: text(data.displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.uid.localeCompare(b.uid));
}

/** The newest `limit` events (consults, demos or closes), newest first. */
export function recentConsults(counted: SolarEvent[], limit = 5): SolarRecentConsult[] {
  return [...counted]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit)
    .map((b) => ({ repName: b.repName, plan: b.kind, at: b.at.toISOString(), repKey: b.repUid }));
}

/** YYYY-MM of the earliest event (office clock), or null. */
export function firstBookedMonth(counted: SolarEvent[]): string | null {
  if (counted.length === 0) return null;
  const first = counted.reduce((min, b) => (b.at < min ? b.at : min), counted[0].at);
  return formatMonthParam(chicagoMonthKey(first));
}
