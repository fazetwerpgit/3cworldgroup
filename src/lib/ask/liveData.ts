import {
  CALL_DAY_ORDER,
  CallDayLabels,
  MANAGEMENT_FIELD_ROLES,
  MAX_SCHEDULED_CALLS,
  getOnboardingItemsForUser,
  resolveRoles,
  type CallDay,
  type FiberOrder,
  type FiberOrderStatus,
  type Sale,
} from '@/types';
import { isOverdue, planLabel, rowStatus, type RowStatus } from '@/lib/dashboard/repSummary';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import { carrierReasonLabel } from '@/lib/fiberReport/carrierNotice';
import { periodBounds, type LeaderboardPeriod } from '@/lib/leaderboard/periods';
import { boardOrder } from '@/lib/leaderboard/order';
import { boardSales, companyFiberBySale, sortBoard, type BoardTotals } from '@/lib/leaderboard/board';
import { monthPeriodId } from '@/lib/leaderboard/snapshot';
import { loadBoardPeriod } from '@/lib/leaderboard/snapshotStore';
import { chicagoMonthKey } from '@/lib/sales/monthWindow';
import { getAllFiberOrders } from '@/lib/fiberReport/ordersCache';
import { adminDb } from '@/lib/firebase/admin';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { isAwaitingCarrier } from '@/lib/sales/installBucket';
import { saleProofPaths } from '@/lib/sales/proofPaths';
import { LIVE_DEFAULT_ZONE, zoneFor } from './prompt';
import { redactContact } from './redact';
import { isDemoSale } from '@/lib/users/demoAccount';

// The asking rep's own portal data, as a short plain-text block for Ask 3C's
// prompt: their sales and install status, their spot on the Board, the next
// team calls, their forms, recent notifications and (for a new hire) their
// onboarding checklist.
//
// Owner rule (Jacob, Oct 18 2026): NO homeowner or teammate identities reach
// the AI provider. A sale is "Customer A", "Customer B"... with its city (or
// ZIP) and the last 4 of its order number at most; never a customer's name,
// street address, phone or email. Teammates on the Board are "Teammate 1",
// "Teammate 2"... with their counts and points. Notifications are reduced to
// their kind (their text names customers), and free text that does pass
// through (a cancel reason) has the sale's customer name, any street address,
// email and phone number taken out.
//
// Owner rule (Jacob): NOTHING about pay. Every line is built from an explicit
// allow-list of fields, never by spreading a document, so no pay, commission,
// estimate, rate, value or chargeback field can ride along; free text that is
// passed through is stripped of dollar amounts and customer contact details,
// and a reason or notification line that mentions pay or money at all is
// replaced whole (see reasonText). Only this rep's documents are read, and
// only notifications about their own sales and installs, except the Board,
// which every rep already sees.
//
// Reads mirror the portal's own: sales by salesRepId ordered by saleDate (the
// Sales page), fiberOrders by matchedUserId (install status), the Board's week
// and month from the leaderboard snapshot (built from every sale and carrier
// order by the leaderboard's own rule; names, counts and points are all that
// leave it), scheduledCalls (Calls), the form collections by repUid,
// notifications by userId, userOnboarding by {uid}_{item}. Each section fails
// soft, and the whole load has a time budget so a slow read never holds up
// the answer.

export const LIVE_BUDGET_MS = 1500;

const SALES_SHOWN = 10;
const SALES_FETCH = 50;
const BOARD_FETCH = 5000;
const BOARD_CACHE_MS = 60_000;
const CALLS_SHOWN = 4;
const FORMS_SHOWN = 6;
const FORM_HANDLED_DAYS = 30;
const NOTIFICATIONS_SHOWN = 4;
const TEXT_MAX = 120;
const DAY_MS = 86_400_000;

type Db = FirebaseFirestore.Firestore;
type Data = Record<string, unknown>;
type Zone = [string, string];

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const stamp = value as { toDate?: () => Date } | null | undefined;
  if (stamp && typeof stamp.toDate === 'function') return stamp.toDate();
  return null;
}

// $150, $ 1,200.50, 150$, 150 dollars, 150 bucks, 150 USD, USD 150.
const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:\$|dollars?\b|bucks\b|usd\b)|\busd\s?\d[\d,]*(?:\.\d+)?/gi;
const PAY_WORDS =
  /\b(?:pay|pays|paid|paying|payout|payouts|payroll|payment|payments|commissions?|charge-?backs?|charge backs?|claw-?backs?|claw backs?|bonus(?:es)?|rates?|earn(?:s|ed|ing|ings)?)\b/i;

/** Stands in for a reason or message that touches pay (owner rule: nothing about pay). */
export const REASON_ON_FILE = 'reason on file, ask Jeremy or Jacob';

// A street address inside free text: a house number, then up to four words,
// then a street type ("1412 Oak St", "88 N Elm Avenue", "9 Hidden Ln").
const STREET =
  /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}?(?:st|street|ave|avenue|rd|road|ln|lane|dr|drive|blvd|boulevard|ct|court|cir|circle|way|pl|place|pkwy|parkway|ter|terrace|trl|trail|hwy|highway)\b\.?/gi;

/** Free text safe for the prompt: no contact details, no street addresses, no dollar amounts, one short line. */
function clean(value: unknown, max = TEXT_MAX): string {
  const text = redactContact(str(value).replace(/\s+/g, ' ')).replace(STREET, '[address]').replace(MONEY, '[amount]');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * A reason or message someone else wrote (a cancel reason, a carrier reason, a
 * notification line): cleaned, or REASON_ON_FILE when it mentions pay or money
 * at all, since a half-redacted pay sentence still says something about pay.
 */
function reasonText(value: unknown, max = TEXT_MAX, names: readonly string[] = []): string {
  const raw = str(value);
  MONEY.lastIndex = 0;
  if (PAY_WORDS.test(raw) || MONEY.test(raw)) return REASON_ON_FILE;
  return clean(withoutNames(raw, names), max);
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * `text` with each of `names` taken out: the whole name, then each word of it
 * (3+ letters, so "Maria" and "Johnson" both go), as "the customer".
 */
export function withoutNames(text: string, names: readonly string[]): string {
  const words = new Set<string>();
  for (const name of names) {
    const whole = name.trim();
    if (!whole) continue;
    words.add(whole);
    for (const word of whole.split(/[\s,]+/)) if (word.replace(/\W/g, '').length >= 3) words.add(word);
  }
  // Longest first, so the full name goes before its parts.
  const ordered = [...words].sort((a, b) => b.length - a.length);
  let out = text;
  for (const word of ordered) {
    out = out.replace(new RegExp(`(?<![\\w])${escapeRegExp(word)}(?![\\w])`, 'gi'), 'the customer');
  }
  return out;
}

/** "Customer A", "Customer B", ... "Customer Z", "Customer 27"... */
export function customerAlias(index: number): string {
  return `Customer ${index < 26 ? String.fromCharCode(65 + index) : index + 1}`;
}

const STATE_ZIP = /^(?:[A-Za-z]{2})?\s*(?:\d{5}(?:-\d{4})?)?$/;

/**
 * The city of a service address, or its ZIP when no city can be told apart,
 * or '' when neither can. Never the street: the first comma part is skipped,
 * and a "city" with a digit in it is not one.
 */
export function addressArea(address: string): string {
  const main = address.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
  const parts = main.split(',').map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const rest = parts.slice(1);
  let city = '';
  for (let i = rest.length - 1; i >= 0; i -= 1) {
    if (STATE_ZIP.test(rest[i])) continue;
    city = rest[i].replace(/\s+[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/, '').replace(/\s+\d{5}(?:-\d{4})?$/, '').trim();
    break;
  }
  if (city && /^[A-Za-z][A-Za-z .'-]{1,29}$/.test(city)) return city;
  const zip = rest.join(' ').match(/\b\d{5}(?:-\d{4})?\b/);
  return zip ? zip[0].slice(0, 5) : '';
}

/** The last 4 characters of an order number or BTN (letters and digits only), or ''. */
export function orderTail(value: string): string {
  const plain = value.replace(/[^A-Za-z0-9]/g, '');
  return plain.length >= 4 ? plain.slice(-4) : '';
}

function dayLabel(date: Date, zone: Zone): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone[0], weekday: 'short', month: 'short', day: 'numeric' }).format(date);
}

function timeLabel(date: Date, zone: Zone): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: zone[0], hour: 'numeric', minute: '2-digit' }).format(date);
}

// ---------- Sales ----------

// Every sale is logged as 'approved' now (approval was removed in Sep 2026),
// so only the other states are worth a word: older rows can still be pending.
const SALE_STATUS: Record<string, string> = {
  pending: 'not approved yet, so not on the Board',
  rejected: 'rejected',
  cancelled: 'cancelled',
};

const CARRIER_STATUS: Record<FiberOrderStatus, string> = {
  pending_install: 'pending install',
  active: 'active (installed)',
  pre_sale: 'pre-sale, no install scheduled',
  cancelled: 'cancelled',
  churned: 'churned',
  breakage: 'missed install',
};

function installLine(status: RowStatus, installDate: Date | null, zone: Zone, overdue = false, awaiting = false): string {
  switch (status) {
    case 'installed':
      return installDate ? `installed ${dayLabel(installDate, zone)}` : 'installed';
    case 'scheduled':
      if (awaiting) {
        return `install day ${installDate ? `(${dayLabel(installDate, zone)}) ` : ''}passed, waiting on the carrier report to confirm it; not overdue, no reschedule needed`;
      }
      return installDate ? `installs ${dayLabel(installDate, zone)}` : 'scheduled';
    case 'needs-date':
      return 'needs an install date';
    case 'missed':
      if (overdue) {
        return `install overdue${installDate ? ` (was ${dayLabel(installDate, zone)})` : ''}, the carrier still shows it pending`;
      }
      return `missed install${installDate ? ` (was ${dayLabel(installDate, zone)})` : ''}, needs a reschedule`;
    case 'cancelled':
      return 'cancelled';
    case 'chargeback':
      return `installed${installDate ? ` ${dayLabel(installDate, zone)}` : ''}, then the customer cancelled within 120 days of install, so its est. pay is charged back`;
  }
}

async function salesSection(db: Db, uid: string, now: Date, zone: Zone): Promise<string> {
  const [salesSnap, ordersSnap, reportAsOf] = await Promise.all([
    db.collection('sales').where('salesRepId', '==', uid).orderBy('saleDate', 'desc').limit(SALES_FETCH).get(),
    db.collection('fiberOrders').where('matchedUserId', '==', uid).get(),
    // The day the newest carrier report covers; unread, the 2-day grace applies.
    Promise.resolve()
      .then(() => db.collection('config').doc('fiberReportStatus').get())
      .then((snap) => {
        const asOf = snap.exists ? snap.data()?.lastReportAsOf : null;
        return typeof asOf === 'string' ? asOf : null;
      })
      .catch(() => null),
  ]);
  const raw = salesSnap.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as Data }))
    .filter(({ data }) => data.salesRepId === uid);
  if (raw.length === 0) return 'Sales: none logged yet.';

  // Only the fields the lines below use; the rest of the doc (value, points,
  // commission, email, phone) never leaves this function, and the name and
  // address only ever leave it as an alias and a city (see the owner rule).
  const sales = raw.map(({ id, data }) => ({
    id,
    salesRepId: uid,
    customerName: str(data.customerName),
    customerAddress: str(data.customerAddress),
    status: str(data.status) as Sale['status'],
    saleDate: toDate(data.saleDate),
    installDate: toDate(data.installDate) ?? undefined,
    createdAt: toDate(data.createdAt),
    products: Array.isArray(data.products)
      ? (data.products as Data[]).map((p) => ({ productName: str(p?.productName), productId: str(p?.productId) }))
      : [],
    productSold: str(data.productSold),
    hasOrderNumber: Boolean(str(data.orderNumberOrBtn)),
    // For the carrier join (matched by order number first, as the board
    // does); a line prints its last 4 at most.
    orderNumberOrBtn: str(data.orderNumberOrBtn),
    screenshots: saleProofPaths(data).length,
    reason: str(data.status) === 'rejected' ? data.rejectionReason : str(data.status) === 'cancelled' ? data.cancelReason : '',
  }));
  sales.sort((a, b) => (b.createdAt?.getTime() ?? 0) - (a.createdAt?.getTime() ?? 0));

  const orders = ordersSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as Data) }) as FiberOrder)
    .filter((order) => order.matchedUserId === uid);
  const fiberBySale = matchFiberOrdersToSales(sales, orders);
  const dated = applyCarrierInstallDates(sales, fiberBySale);

  const lines = dated.slice(0, SALES_SHOWN).map((sale, index) => {
    const order = fiberBySale.get(sale.id);
    const status = rowStatus(sale as unknown as Sale, order, now, reportAsOf);
    const awaiting = status === 'scheduled' && isAwaitingCarrier(sale as unknown as Sale, order, now, reportAsOf);
    // Who and where, without the who: an alias, and the city (or ZIP) only.
    const area = addressArea(sale.customerAddress);
    const parts = [
      `${customerAlias(index)}${area ? `, ${area}` : ''}`,
      `plan ${clean(planLabel(sale as unknown as Sale), 40)}`,
      `sold ${sale.saleDate ? dayLabel(sale.saleDate, zone) : 'date not set'}`,
      `logged ${sale.createdAt ? `${dayLabel(sale.createdAt, zone)} ${timeLabel(sale.createdAt, zone)}` : 'unknown'}`,
      `install: ${installLine(status, sale.installDate ?? null, zone, isOverdue(sale as unknown as Sale, order, status), awaiting)}`,
    ];
    if (SALE_STATUS[sale.status]) {
      const names = [sale.customerName];
      parts.push(`in the portal: ${SALE_STATUS[sale.status]}${str(sale.reason) ? ` (${reasonText(sale.reason, 80, names)})` : ''}`);
    }
    if (order) {
      const reason = order.status === 'breakage' ? carrierReasonLabel(order.breakageReason) : null;
      parts.push(`carrier report: ${CARRIER_STATUS[order.status] ?? 'unknown'}${reason ? ` (${reasonText(reason, 60)})` : ''}`);
    } else {
      parts.push('carrier report: no match yet');
    }
    const tail = orderTail(sale.orderNumberOrBtn);
    parts.push(sale.hasOrderNumber ? `order # attached${tail ? ` (ending ${tail})` : ''}` : 'order # not attached');
    parts.push(`screenshot ${sale.screenshots > 0 ? 'attached' : 'not attached'}`);
    return `- ${parts.join('; ')}`;
  });
  const shown = Math.min(SALES_SHOWN, dated.length);
  const more = raw.length >= SALES_FETCH ? `${shown} newest shown` : `${shown} of ${raw.length} shown`;
  return `Sales (newest logged first; ${more}):\n${lines.join('\n')}`;
}

// ---------- Board ----------

// The two periods reps ask about; the Board's Year and All time stay on the Board.
const BOARD_PERIODS: Array<[LeaderboardPeriod, string]> = [
  ['week', 'This week'],
  ['month', 'This month'],
];

export interface BoardRow {
  id: string;
  name: string;
  sales: number;
  points: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const rowText = (row: BoardRow, rank: number) =>
  `#${rank} ${clean(row.name, 40) || 'Unknown'} (${plural(row.sales, 'sale')}, ${plural(row.points, 'point')})`;

/** One counted sale as the Board reads it; `demo` marks a demo account's sale. */
export interface BoardSale {
  repId: string;
  name: string;
  points: number;
  at: number;
  demo: boolean;
}

/** The period's counted sales, company-wide, kept for a minute per db so back-to-back questions don't re-read. */
const boardCache = new WeakMap<Db, { key: string; expires: number; sales: BoardSale[] }>();

/**
 * The Board's counted sales, exactly as GET /api/portal/leaderboard counts them
 * (lib/leaderboard/board boardSales over the company carrier join): approved,
 * not cancelled by the carrier, not charged back under the 120-day rule, an
 * order number logged twice counted once. `sales` is every sale, any status,
 * so the join resolves as it does on the leaderboard. A demo account's sales
 * stay out of the join and are marked `demo` (rankBoard drops them per viewer).
 */
export function countedBoardSales(
  sales: Sale[],
  orders: FiberOrder[],
  opts?: { now?: Date; reportAsOf?: string | null }
): BoardSale[] {
  const fiberBySale = companyFiberBySale(
    sales.filter((sale) => !isDemoSale(sale as unknown as Data)),
    orders,
    opts
  );
  return boardSales(sales, fiberBySale, 'approved').map((sale) => ({
    repId: str(sale.salesRepId),
    name: str(sale.salesRepName) || 'Unknown',
    points: typeof sale.totalPoints === 'number' ? sale.totalPoints : 0,
    at: toDate(sale.saleDate)?.getTime() ?? 0,
    demo: isDemoSale(sale as unknown as Data),
  }));
}

/**
 * Each period's ranking for `viewerUid`: a demo account's sales are left out
 * unless the viewer is that demo account (it still sees its own standing).
 * Sales are counted from each period's start up to its end (`ends`, exclusive),
 * like the leaderboard, so a sale dated tomorrow never ranks in the week that
 * is closing.
 */
export function rankBoard(
  sales: readonly BoardSale[],
  starts: readonly number[],
  viewerUid: string,
  ends: readonly number[] = []
): BoardRow[][] {
  const counted = sales.filter((sale) => !sale.demo || sale.repId === viewerUid);
  return starts.map((start, i) => {
    const end = ends[i] ?? Infinity;
    const byRep = new Map<string, BoardRow>();
    for (const sale of counted) {
      if (sale.at < start || sale.at >= end || !sale.repId) continue;
      const row = byRep.get(sale.repId) ?? { id: sale.repId, name: sale.name, sales: 0, points: 0 };
      row.sales += 1;
      row.points += sale.points;
      byRep.set(sale.repId, row);
    }
    return [...byRep.values()].sort((a, b) => boardOrder({ score: a.points, name: a.name, id: a.id }, { score: b.points, name: b.name, id: b.id }));
  });
}

/** A snapshot period's rows as the Ask Board reads them, ranked by points (sortBoard). */
export function boardRowsFromTotals(totals: BoardTotals[]): BoardRow[] {
  return sortBoard([...totals], 'totalPoints').map((row) => ({
    id: row.salesRepId,
    name: row.salesRepName || 'Unknown',
    sales: row.totalSales,
    points: row.totalPoints,
  }));
}

/**
 * The Board's week and month from the leaderboard snapshot (loadBoardPeriod:
 * the same counting rule, Chicago bounds closed at their end, demo sales only
 * on their own account's board). A due rebuild happens there, as on a Board read.
 */
async function snapshotBoardRankings(now: Date, viewerUid: string): Promise<BoardRow[][]> {
  return Promise.all(
    BOARD_PERIODS.map(async ([period]) => {
      const bounds = periodBounds(period, now);
      const board = await loadBoardPeriod({
        now,
        viewerUid,
        scope: 'approved',
        periodId: period === 'month' ? monthPeriodId(chicagoMonthKey(now)) : period,
        start: bounds?.start ?? new Date(0),
        end: bounds?.end ?? null,
        withHistory: false,
      });
      return boardRowsFromTotals(board.payload.totals);
    })
  );
}

/** Every carrier order: the shared per-instance cache on the admin db, else a plain read. */
async function boardOrders(db: Db, lastReportAt: string | null): Promise<FiberOrder[]> {
  if (db === (adminDb as unknown as Db)) return getAllFiberOrders(lastReportAt);
  const snap = await db.collection('fiberOrders').get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as FiberOrder);
}

/**
 * The Board as GET /api/portal/leaderboard builds it: every sale (any status)
 * and every carrier order read the same way, counted with the same rule
 * (countedBoardSales), ranked by points. Cached for a minute per db. Without
 * the carrier report the Board still ranks the portal's own counts, as the
 * leaderboard does.
 */
async function boardRankings(db: Db, now: Date, viewerUid: string): Promise<BoardRow[][]> {
  // Production: the leaderboard's precomputed snapshot, which is built by this
  // same rule from every sale and carrier order. Two small doc reads per period
  // instead of a read of every sale and order inside Ask's live-data budget.
  if (db === (adminDb as unknown as Db)) return snapshotBoardRankings(now, viewerUid);
  const bounds = BOARD_PERIODS.map(([period]) => periodBounds(period, now));
  const starts = bounds.map((bound) => bound?.start.getTime() ?? 0);
  const ends = bounds.map((bound) => bound?.end.getTime() ?? Infinity);
  const key = starts.join('|');
  const cached = boardCache.get(db);
  if (cached && cached.key === key && cached.expires > now.getTime()) return rankBoard(cached.sales, starts, viewerUid, ends);

  const [snap, status] = await Promise.all([
    db.collection('sales').limit(BOARD_FETCH).get(),
    db.collection('config').doc('fiberReportStatus').get().then(
      (doc) => (doc.exists ? (doc.data() as Data) : undefined),
      () => undefined
    ),
  ]);
  const sales = snap.docs.map((doc) => {
    const data = doc.data() as Data;
    return {
      ...data,
      id: doc.id,
      saleDate: toDate(data.saleDate) ?? undefined,
      installDate: toDate(data.installDate) ?? undefined,
      createdAt: toDate(data.createdAt) ?? undefined,
    } as unknown as Sale;
  });
  let orders: FiberOrder[] = [];
  try {
    orders = await boardOrders(db, typeof status?.lastReportAt === 'string' ? status.lastReportAt : null);
  } catch (error) {
    console.error('Ask Board carrier report failed:', error);
  }
  const reportAsOf = typeof status?.lastReportAsOf === 'string' ? status.lastReportAsOf : null;
  const counted = countedBoardSales(sales, orders, { now, reportAsOf });
  boardCache.set(db, { key, expires: now.getTime() + BOARD_CACHE_MS, sales: counted });
  return rankBoard(counted, starts, viewerUid, ends);
}

const BOARD_LIST_MAX = 10;

/**
 * The rankings with every other rep's name as "Teammate N": one alias per rep
 * across all periods, numbered in the order first written out (so the top row
 * of the first period is Teammate 1). The viewer's own row keeps its name (it
 * is never printed). Ids, counts and points stay.
 */
export function aliasTeammates(rankings: readonly BoardRow[][], viewerUid: string): BoardRow[][] {
  const aliases = new Map<string, number>();
  return rankings.map((rows) =>
    rows.map((row) => {
      if (row.id === viewerUid) return row;
      let n = aliases.get(row.id);
      if (n === undefined) {
        n = aliases.size + 1;
        aliases.set(row.id, n);
      }
      return { ...row, name: `Teammate ${n}` };
    })
  );
}

async function boardSection(db: Db, uid: string, now: Date): Promise<string> {
  // Teammates' names never go to the AI provider (owner rule): "Teammate 1",
  // "Teammate 2"..., for every viewer (a demo account included). Counts stay.
  const rankings = aliasTeammates(await boardRankings(db, now, uid), uid);
  const lines = BOARD_PERIODS.map(([period, name], i) => {
    // The period's own dates (Central, like the Board), so "when does the week reset" is never a guess.
    const bounds = periodBounds(period, now);
    const label = bounds
      ? `${name} (${dayLabel(bounds.start, LIVE_DEFAULT_ZONE)} to ${dayLabel(new Date(bounds.end.getTime() - 1), LIVE_DEFAULT_ZONE)})`
      : name;
    const ranked = rankings[i];
    const at = ranked.findIndex((row) => row.id === uid);
    if (at === -1) {
      // Not on it (an owner, or no sales yet): the whole Board, which every rep can already see,
      // so "how's the team doing" is never answered from a single row.
      if (ranked.length === 0) return `- ${label}: nobody on the Board yet.`;
      const rows = ranked.slice(0, BOARD_LIST_MAX).map((row, n) => rowText(row, n + 1)).join('; ');
      const more = ranked.length > BOARD_LIST_MAX ? ` (and ${ranked.length - BOARD_LIST_MAX} more)` : '';
      return `- ${label}: this person is not on it (no sales). Everyone on it (${ranked.length}): ${rows}${more}.`;
    }
    const me = ranked[at];
    const above = at > 0 ? `; just above: ${rowText(ranked[at - 1], at)}` : '; that is first place';
    const below = at < ranked.length - 1 ? `; just below: ${rowText(ranked[at + 1], at + 2)}` : '';
    return `- ${label}: #${at + 1} of ${ranked.length} with ${plural(me.sales, 'sale')}, ${plural(me.points, 'point')}${above}${below}.`;
  });
  return `Board (ranked by points like the Board's default view; cancelled sales don't count; Year and All time are on the Board; teammates are shown as "Teammate N", not by name; the Board in the portal has the names):\n${lines.join('\n')}`;
}

// ---------- Calls ----------

function zoneParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** The instant a wall-clock time in `timeZone` happens (two passes settle the offset across DST). */
function zonedInstant(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let pass = 0; pass < 2; pass += 1) {
    const shown = zoneParts(new Date(guess), timeZone);
    guess += wanted - Date.UTC(shown.year, shown.month - 1, shown.day, shown.hour, shown.minute);
  }
  return new Date(guess);
}

function validZone(timeZone: string): string {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return timeZone;
  } catch {
    return LIVE_DEFAULT_ZONE[0];
  }
}

/** The next time a weekly call happens, from an hour ago on (a call in progress still counts). */
function nextOccurrence(day: CallDay, time: string, timeZone: string, now: Date): Date | null {
  const [hour, minute] = time.split(':').map(Number);
  if (!Number.isFinite(hour)) return null;
  const today = zoneParts(now, timeZone);
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = new Date(Date.UTC(today.year, today.month - 1, today.day + offset));
    if (CALL_DAY_ORDER[(date.getUTCDay() + 6) % 7] !== day) continue;
    const at = zonedInstant(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(), hour, minute || 0, timeZone);
    if (at.getTime() >= now.getTime() - 60 * 60_000) return at;
  }
  return null;
}

/** The call schedule as GET /api/portal/calls scopes it for this rep. */
async function callsSection(db: Db, user: Data, now: Date, zone: Zone): Promise<string> {
  const { role, fieldRole } = resolveRoles(str(user.role) || undefined, str(user.fieldRole) || undefined);
  // Same rule as GET /api/portal/calls.
  const seesManagerCalls = !!role || (fieldRole ? MANAGEMENT_FIELD_ROLES.includes(fieldRole) : false);
  const snap = await db.collection('scheduledCalls').limit(MAX_SCHEDULED_CALLS).get();
  const upcoming = snap.docs
    .map((doc) => doc.data() as Data)
    .filter((call) => (call.active ?? true) !== false)
    .filter((call) => (call.audience ?? 'all') === 'all' || seesManagerCalls)
    .flatMap((call) => {
      const day = str(call.day) as CallDay;
      if (!CallDayLabels[day]) return [];
      const at = nextOccurrence(day, str(call.time), validZone(str(call.timezone) || LIVE_DEFAULT_ZONE[0]), now);
      return at ? [{ title: clean(call.title, 60) || 'Team call', at }] : [];
    })
    .sort((a, b) => a.at.getTime() - b.at.getTime())
    .slice(0, CALLS_SHOWN);
  if (upcoming.length === 0) return 'Team calls: none on the schedule this week.';
  const lines = upcoming.map((call) => {
    const started = call.at.getTime() <= now.getTime();
    return `- ${call.title}: ${dayLabel(call.at, zone)} ${timeLabel(call.at, zone)}${started ? ' (started, still on)' : ''}`;
  });
  return `Next team calls (${zone[1]} time; Join is on the Calls page, in the Menu):\n${lines.join('\n')}`;
}

// ---------- Forms ----------

// Each rep form's collection, its name, and the ONLY fields worth a mention.
// Payroll disputes say type, status and date and nothing else.
const FORM_SOURCES: Array<{ collection: string; name: string; detail?: (data: Data) => string }> = [
  { collection: 'payrollDisputes', name: 'Payroll dispute' },
  {
    collection: 'expediteOrders',
    name: 'Expedite order',
    // Never the customer's name, phone or email: the order's last 4 and the reason (a fixed list).
    detail: (data) =>
      [
        orderTail(str(data.orderNumber)) && `order ending ${orderTail(str(data.orderNumber))}`,
        str(data.reason) && `reason: ${reasonText(data.reason, 60, [str(data.customerName)])}`,
      ]
        .filter(Boolean)
        .join(', '),
  },
  {
    collection: 'leadsRequests',
    name: 'Leads request',
    detail: (data) => [clean(data.category, 70), clean(data.location, 50)].filter(Boolean).join(', '),
  },
  { collection: 'fiberReports', name: 'Fiber report', detail: (data) => (clean(data.dateKnocked, 20) ? `knocked ${clean(data.dateKnocked, 20)}` : '') },
  { collection: 'managerInterviews', name: 'Manager interview' },
  { collection: 'bugReports', name: 'Bug report' },
];

async function formsSection(db: Db, uid: string, now: Date, zone: Zone): Promise<string> {
  const lists = await Promise.all(
    FORM_SOURCES.map(async (source) => {
      const snap = await db.collection(source.collection).where('repUid', '==', uid).get();
      return snap.docs
        .map((doc) => doc.data() as Data)
        .filter((data) => data.repUid === uid)
        .map((data) => ({
          name: source.name,
          // A demo account's own form (status 'demo', lib/forms/submitForm) reads as open.
          open: data.status === 'new' || data.status === 'demo',
          at: toDate(data.createdAt),
          detail: source.detail?.(data) ?? '',
        }));
    })
  );
  const recent = now.getTime() - FORM_HANDLED_DAYS * DAY_MS;
  const forms = lists
    .flat()
    .filter((form) => form.open || (form.at?.getTime() ?? 0) >= recent)
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .slice(0, FORMS_SHOWN);
  if (forms.length === 0) return 'Forms: none open, none handled in the last 30 days.';
  const lines = forms.map(
    (form) =>
      `- ${form.name}${form.detail ? ` (${form.detail})` : ''}: ${form.open ? 'open, the office has not marked it handled yet' : 'handled'}; sent ${form.at ? dayLabel(form.at, zone) : 'date unknown'}`
  );
  return `Forms sent (open ones, plus any handled in the last 30 days):\n${lines.join('\n')}`;
}

// ---------- Notifications ----------

// Only types about the rep's own sales and installs. alert_task and
// announcement are about other people (a hire who stalled, a manager's
// field-train note), and so is sale_pending ("New Sale Needs Approval. <rep>
// submitted…", sent to managers). Onboarding lives in its own section.
//
// Only the KIND of each notification is sent, never its title or message:
// those name the customer ("Install tomorrow. Maria J. ..."), and the sale's
// own line in the Sales section already carries its status.
const NOTIFICATION_TYPES: Record<string, string> = {
  sale_submitted: 'Sale logged',
  sale_approved: 'Sale approved',
  sale_rejected: 'Sale rejected',
  install_date_changed: 'Install date changed',
  carrier_order_issue: 'Carrier flagged an order',
  install_reminder: 'Install reminder',
  install_overdue: 'Install overdue',
  unlogged_callouts: 'Callouts to log',
  unlogged_orders: 'Orders to log',
};

async function notificationsSection(db: Db, uid: string, zone: Zone): Promise<string> {
  const snap = await db.collection('notifications').where('userId', '==', uid).orderBy('createdAt', 'desc').limit(40).get();
  const items = snap.docs
    .map((doc) => doc.data() as Data)
    .filter((data) => data.userId === uid && NOTIFICATION_TYPES[str(data.type)])
    .map((data) => ({ kind: NOTIFICATION_TYPES[str(data.type)], read: data.read === true, at: toDate(data.createdAt) }))
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
    .slice(0, NOTIFICATIONS_SHOWN);
  if (items.length === 0) return '';
  const lines = items.map((item) => `- ${item.at ? dayLabel(item.at, zone) : ''}: ${item.kind}${item.read ? '' : ' (unread)'}`);
  return `Latest notifications (the bell; open the bell for the details):\n${lines.join('\n')}`;
}

// ---------- Onboarding ----------

const ONBOARDING_STATUS: Record<string, string> = {
  not_started: 'not started',
  submitted: 'sent, waiting on review',
  approved: 'approved',
  rejected: 'sent back, needs a fix',
};

/** A new hire's checklist (My Onboarding). Active reps have no checklist to work through. */
async function onboardingSection(db: Db, uid: string, user: Data): Promise<string> {
  if (user.status !== 'pending') return '';
  const { fieldRole } = resolveRoles(str(user.role) || undefined, str(user.fieldRole) || undefined);
  if (!fieldRole) return '';
  const items = getOnboardingItemsForUser(fieldRole, user.isIBO === true);
  if (items.length === 0) return '';
  const progress = await Promise.all(items.map((item) => db.collection('userOnboarding').doc(`${uid}_${item.id}`).get()));
  const lines = items.map((item, i) => {
    const status = str(progress[i].exists ? progress[i].data()?.status : '') || 'not_started';
    return `- ${item.label}: ${ONBOARDING_STATUS[status] ?? 'not started'}`;
  });
  return `My Onboarding checklist (not active yet):\n${lines.join('\n')}`;
}

// ---------- Load ----------

const TIMED_OUT = Symbol('timed out');

/**
 * This rep's portal right now as plain text for the prompt, or '' when nothing
 * could be read in time. Sections that fail or miss the budget are left out.
 */
export async function loadRepSnapshot(db: Db, uid: string, now: Date, budgetMs = LIVE_BUDGET_MS): Promise<string> {
  const { promise: deadline, resolve: expire } = Promise.withResolvers<typeof TIMED_OUT>();
  const timer = setTimeout(() => expire(TIMED_OUT), budgetMs);

  const userRead = Promise.resolve()
    .then(() => db.collection('users').doc(uid).get())
    .then((snap) => (snap.data() ?? {}) as Data)
    .catch((error: unknown): Data => {
      // Without the profile: Central time, everyone's calls only, no onboarding.
      console.error('[ask-3c] live user read failed', error instanceof Error ? error.message : error);
      return {};
    });

  const section = async (name: string, work: () => Promise<string>): Promise<string> => {
    const result = await Promise.race([work().catch((error: unknown) => error instanceof Error ? error : new Error(String(error))), deadline]);
    if (result === TIMED_OUT) {
      console.warn('[ask-3c] live section timed out', name);
      return '';
    }
    if (result instanceof Error) {
      console.error('[ask-3c] live section failed', name, result.message);
      return '';
    }
    return result;
  };

  const zoneOf = (user: Data) => zoneFor([str(user.city), str(user.state)].filter(Boolean).join(', ')) ?? LIVE_DEFAULT_ZONE;

  try {
    const sections = await Promise.all([
      section('sales', async () => {
        const user = await userRead;
        return user.status === 'pending' ? '' : salesSection(db, uid, now, zoneOf(user));
      }),
      section('board', async () => {
        const user = await userRead;
        return user.status === 'pending' ? '' : boardSection(db, uid, now);
      }),
      section('calls', async () => {
        const user = await userRead;
        return callsSection(db, user, now, zoneOf(user));
      }),
      section('forms', async () => formsSection(db, uid, now, zoneOf(await userRead))),
      section('notifications', async () => notificationsSection(db, uid, zoneOf(await userRead))),
      section('onboarding', async () => onboardingSection(db, uid, await userRead)),
    ]);
    return sections.filter(Boolean).join('\n\n');
  } finally {
    clearTimeout(timer);
  }
}
