import { dispatchToUser, type DispatchInput } from '@/lib/alerts/dispatch';
import { chicagoDayBounds } from '@/lib/leaderboard/periods';
import {
  CALLOUT_CHANNEL_ID,
  CALLOUT_PUSH_TITLE,
  calloutDays,
  calloutLogLink,
  calloutPushMessage,
  type CalloutDay,
  type CalloutMessage,
  type LoggedSale,
} from '@/lib/sales/calloutNudge';
import { chicagoDayKey, chicagoHour } from '@/lib/weeklyInstalls/week';
import { DEMO_ACCOUNT_FIELD, isDemoSale, withoutDemoDocs } from '@/lib/users/demoAccount';

// The reads behind the callout nudge (lib/sales/calloutNudge.ts has the rule and
// the words), and the 9 PM push.
//
//   rep Home   GET /api/portal/sales/callouts: today's count for the caller.
//   9 PM push  /api/cron/callout-nudges: every active rep still short today,
//              once per rep per day.
//   owner      Needs attention, "Called out, not logged today".
//
// Where "told" is recorded: calloutNudges/{uid}_{day}, a server-only side
// collection (no client rule grants it), claimed with create() BEFORE the send:
// the cron fires in two UTC slots and Vercel can retry, and a second run finds
// the claim and sends nothing. A failed claim sends nothing either; a rep can
// miss a nudge, never get two.
//
//   CALLOUT_NUDGE_OFF   "true" makes every run a dry run: the same reads, no
//                       claim, no send.

type Db = FirebaseFirestore.Firestore;

const CLAIMS = 'calloutNudges';
const DAY_MS = 86_400_000;

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  const maybe = value as { toDate?: () => Date } | null | undefined;
  return maybe && typeof maybe.toDate === 'function' ? maybe.toDate() : null;
}

function toMessage(data: FirebaseFirestore.DocumentData): CalloutMessage {
  return {
    authorId: typeof data.authorId === 'string' ? data.authorId : '',
    authorName: typeof data.authorName === 'string' ? data.authorName : '',
    text: typeof data.text === 'string' ? data.text : '',
    createdAt: toDate(data.createdAt),
    deletedAt: data.deletedAt ?? null,
  };
}

function toLoggedSale(data: FirebaseFirestore.DocumentData): LoggedSale {
  return {
    salesRepId: typeof data.salesRepId === 'string' ? data.salesRepId : '',
    saleDate: toDate(data.saleDate),
    createdAt: toDate(data.createdAt),
  };
}

/** One Chicago day of All Company messages (deleted ones included; calloutDays skips them). */
export async function loadDayMessages(db: Db, day: string): Promise<CalloutMessage[]> {
  const { start, end } = chicagoDayBounds(day);
  const snap = await db
    .collection('chatChannels')
    .doc(CALLOUT_CHANNEL_ID)
    .collection('messages')
    .where('createdAt', '>=', start)
    .where('createdAt', '<', end)
    .get();
  return snap.docs.map((doc) => toMessage(doc.data()));
}

/**
 * Every sale that could be FOR `day`: sale dates are stored at noon on the
 * server, so a day either side covers any time zone; createdAt is the fallback
 * for a sale with no sale date. calloutDays places each one on its Chicago day.
 */
export async function loadDaySales(db: Db, day: string): Promise<LoggedSale[]> {
  const { start, end } = chicagoDayBounds(day);
  const from = new Date(start.getTime() - DAY_MS);
  const to = new Date(end.getTime() + DAY_MS);
  const sales = db.collection('sales');
  const [bySaleDate, byCreated] = await Promise.all([
    sales.where('saleDate', '>=', from).where('saleDate', '<', to).select('salesRepId', 'saleDate', 'createdAt', DEMO_ACCOUNT_FIELD).get(),
    sales.where('createdAt', '>=', from).where('createdAt', '<', to).select('salesRepId', 'saleDate', 'createdAt', DEMO_ACCOUNT_FIELD).get(),
  ]);
  const byId = new Map<string, LoggedSale>();
  for (const doc of [...bySaleDate.docs, ...byCreated.docs]) {
    if (isDemoSale(doc.data())) continue; // company-wide gaps never count a demo sale
    if (!byId.has(doc.id)) byId.set(doc.id, toLoggedSale(doc.data()));
  }
  return [...byId.values()];
}

/**
 * Today's count for one rep: their callouts against their own sales. Runs on
 * every rep Home mount, so it reads only the rep's sales dated a day either
 * side of today (the window loadDaySales uses), not their whole history. The
 * existing sales(salesRepId, saleDate) composite serves it. Every sale carries
 * a saleDate (POST always writes one; verified in production 2026-09-03), so
 * the createdAt fallback loadDaySales keeps is not needed for the rep's own.
 */
export async function repCalloutDay(db: Db, uid: string, now: Date = new Date()): Promise<CalloutDay> {
  const day = chicagoDayKey(now);
  const { start, end } = chicagoDayBounds(day);
  const [messages, salesSnap] = await Promise.all([
    loadDayMessages(db, day),
    db
      .collection('sales')
      .where('salesRepId', '==', uid)
      .where('saleDate', '>=', new Date(start.getTime() - DAY_MS))
      .where('saleDate', '<', new Date(end.getTime() + DAY_MS))
      .select('salesRepId', 'saleDate', 'createdAt')
      .get(),
  ]);
  const own = calloutDays(
    messages.filter((message) => message.authorId === uid),
    salesSnap.docs.map((doc) => toLoggedSale(doc.data()))
  ).find((entry) => entry.day === day);
  return own ?? { repId: uid, repName: '', day, callouts: 0, logged: 0, gap: 0 };
}

/** Every rep short on `day`, company-wide. */
export async function calloutGapsFor(db: Db, day: string): Promise<CalloutDay[]> {
  const [messages, sales] = await Promise.all([loadDayMessages(db, day), loadDaySales(db, day)]);
  return calloutDays(messages, sales).filter((entry) => entry.day === day && entry.gap > 0);
}

// ---------------------------------------------------------------- 9 PM push

/** The cron acts at 9 PM Chicago (see isCalloutNudgeHour). */
export const CALLOUT_NUDGE_HOUR = 21;

/**
 * The Vercel cron fires at 02:00 AND 03:00 UTC every day, because 9 PM in
 * Chicago is 02:00 UTC in summer (CDT) and 03:00 UTC in winter (CST). Exactly
 * one of the two lands on 9 PM local; this is the gate that picks it.
 */
export function isCalloutNudgeHour(now: Date): boolean {
  return chicagoHour(now) === CALLOUT_NUDGE_HOUR;
}

export interface CalloutPush {
  repId: string;
  repName: string;
  callouts: number;
  logged: number;
  title: string;
  message: string;
  link: string;
}

export interface CalloutRunSummary {
  day: string;
  dryRun: boolean;
  /** Reps short today (callouts > logged). */
  short: number;
  /** Short, but not an active user. */
  skippedInactiveRep: number;
  /** Dry run: what would be sent. Live: what was claimed and sent. */
  pushes: CalloutPush[];
  sent: number;
  alreadySent: number;
  errors: number;
}

export interface CalloutRunDeps {
  db: Db;
  now?: Date;
  /** Read and plan only. Defaults to CALLOUT_NUDGE_OFF. */
  dryRun?: boolean;
  dispatch?: (input: DispatchInput) => Promise<void>;
}

/** Firestore's ALREADY_EXISTS: an earlier run already nudged this rep today. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists';
}

function push(entry: CalloutDay): CalloutPush {
  return {
    repId: entry.repId,
    repName: entry.repName,
    callouts: entry.callouts,
    logged: entry.logged,
    title: CALLOUT_PUSH_TITLE,
    message: calloutPushMessage(entry.callouts, entry.logged),
    link: calloutLogLink(entry.gap),
  };
}

export async function runCalloutNudges(deps: CalloutRunDeps): Promise<CalloutRunSummary> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const dryRun = deps.dryRun ?? process.env.CALLOUT_NUDGE_OFF === 'true';
  const dispatch = deps.dispatch ?? dispatchToUser;
  const day = chicagoDayKey(now);
  const summary: CalloutRunSummary = {
    day,
    dryRun,
    short: 0,
    skippedInactiveRep: 0,
    pushes: [],
    sent: 0,
    alreadySent: 0,
    errors: 0,
  };

  const [short, usersSnap] = await Promise.all([
    calloutGapsFor(db, day),
    db.collection('users').where('status', '==', 'active').select('status', DEMO_ACCOUNT_FIELD).get(),
  ]);
  summary.short = short.length;
  // Active users only, as the overdue alerts do: a rep who left is not nudged.
  const active = new Set(withoutDemoDocs(usersSnap.docs).map((doc) => doc.id));

  for (const entry of short) {
    if (!active.has(entry.repId)) {
      summary.skippedInactiveRep += 1;
      continue;
    }
    const planned = push(entry);
    if (dryRun) {
      summary.pushes.push(planned);
      continue;
    }

    try {
      await db.collection(CLAIMS).doc(`${entry.repId}_${day}`).create({
        repId: entry.repId,
        day,
        callouts: entry.callouts,
        logged: entry.logged,
        at: now.toISOString(),
      });
    } catch (error) {
      if (isAlreadyExists(error)) {
        summary.alreadySent += 1;
      } else {
        console.error(`[calloutNudges] failed to claim ${entry.repId} for ${day}`, error);
        summary.errors += 1;
      }
      continue;
    }

    try {
      // Bell + push only. No money in it.
      await dispatch({
        userId: entry.repId,
        type: 'unlogged_callouts',
        title: planned.title,
        message: planned.message,
        link: planned.link,
        metadata: { day, callouts: entry.callouts, logged: entry.logged },
      });
      summary.sent += 1;
      summary.pushes.push(planned);
    } catch (error) {
      console.error(`[calloutNudges] failed to notify ${entry.repId}`, error);
      summary.errors += 1;
    }
  }
  return summary;
}
