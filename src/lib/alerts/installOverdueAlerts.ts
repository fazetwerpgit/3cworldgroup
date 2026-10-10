import { dispatchToUser, type DispatchInput } from '@/lib/alerts/dispatch';
import { buildMergedBook } from '@/lib/sales/mergeBook';
import { installDayKey } from '@/lib/sales/saleDate';
import {
  OVERDUE_OWNER_TITLE,
  OVERDUE_REP_TITLE,
  overdueAlertDue,
  overdueOwnerMessage,
  overdueRepMessage,
  overdueSales,
  type OverdueAlertRecord,
  type OverdueSale,
} from '@/lib/sales/installOverdue';
import { toFiberOrder, toSale } from '@/lib/weeklyInstalls/gather';
import type { OverdueAlertCounts } from '@/types/fiberOrder';

// Overdue installs, told after the daily carrier report lands (the moment the
// data changes). The rule and the words are lib/sales/installOverdue.ts; this
// file reads the company book, claims each alert once, and sends.
//
//   rep    one bell + push per overdue sale: day 3, then weekly while it stays
//          overdue (overdueAlertDue).
//   owners one summary a day while anything is overdue.
//
// Where "told" is recorded: a side collection, NOT the sale.
//   installOverdueAlerts/{saleId}   { dueDay, lastAlertDay, lastAlertAt, count, … }
//   installOverdueDigests/{day}     one doc per Chicago day the owners were told
// The sale doc is written by the report's own date sync (conditional on its
// updateTime, so a write here between its read and its write costs it a retry),
// by reps' and admins' edits, and by the install reminders; and reps' clients
// read it. Bookkeeping that changes weekly has no business bumping that
// document. The side collections are server-only (no client rule grants them),
// and losing them only means each overdue sale is told once more.
//
// Every claim is taken BEFORE sending, in a transaction (per sale) or a create
// (per day), so a report Postmark delivers twice, even at once, tells nobody
// twice: a failed claim sends nothing; a rep can miss one alert, never get two.
// Nothing here throws at the webhook: failures are logged and counted.
//
//   INSTALL_OVERDUE_ALERTS_OFF  "true" makes every run a dry run: the same
//                               reads, no claim, no send.

const ALERTS = 'installOverdueAlerts';
const DIGESTS = 'installOverdueDigests';
const CLAIM_CHUNK = 20;
const READ_CHUNK = 300;
const OWNER_LINK = '/portal/dashboard';

type Db = FirebaseFirestore.Firestore;

export interface PlannedRepAlert {
  saleId: string;
  repId: string;
  repName: string;
  customer: string;
  daysOverdue: number;
  /** Which alert of this overdue stretch (1 = the day-3 one). */
  count: number;
  title: string;
  message: string;
  link: string;
}

export interface PlannedOwnerAlert {
  ownerIds: string[];
  title: string;
  message: string;
  link: string;
}

export interface OverdueRunResult {
  counts: OverdueAlertCounts;
  /** Dry run: what would be sent. Live: what was claimed and sent. */
  repAlerts: PlannedRepAlert[];
  ownerAlert: PlannedOwnerAlert | null;
  overdue: OverdueSale[];
}

export interface OverdueRunDeps {
  db: Db;
  now?: Date;
  /** Read and plan only: no claim, no send. Defaults to INSTALL_OVERDUE_ALERTS_OFF. */
  dryRun?: boolean;
  dispatch?: (input: DispatchInput) => Promise<void>;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function emptyCounts(dryRun: boolean): OverdueAlertCounts {
  return {
    dryRun,
    overdue: 0,
    repAlertsDue: 0,
    repAlertsSent: 0,
    alreadySent: 0,
    skippedInactiveRep: 0,
    ownerSummary: 'none',
    errors: 0,
  };
}

function readRecord(data: FirebaseFirestore.DocumentData | undefined): OverdueAlertRecord | null {
  const dueDay = text(data?.dueDay);
  const lastAlertDay = text(data?.lastAlertDay);
  if (!dueDay || !lastAlertDay) return null;
  return { dueDay, lastAlertDay, count: typeof data?.count === 'number' ? data.count : 0 };
}

function repAlert(sale: OverdueSale, count: number): PlannedRepAlert {
  return {
    saleId: sale.saleId,
    repId: sale.repId,
    repName: sale.repName,
    customer: sale.customer,
    daysOverdue: sale.daysOverdue,
    count,
    title: OVERDUE_REP_TITLE,
    message: overdueRepMessage(sale),
    link: `/portal/sales/${sale.saleId}`,
  };
}

/** Marks the sale told today, unless a run already did (or it isn't due). Returns the alert's count, or null. */
async function claimRepAlert(db: Db, sale: OverdueSale, today: string, now: Date): Promise<number | null> {
  const ref = db.collection(ALERTS).doc(sale.saleId);
  return db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    const decision = overdueAlertDue(snapshot.exists ? readRecord(snapshot.data()) : null, sale, today);
    if (!decision.send) return null;
    transaction.set(ref, {
      saleId: sale.saleId,
      repId: sale.repId,
      orderId: sale.orderId,
      dueDay: sale.dueDay,
      daysOverdue: sale.daysOverdue,
      lastAlertDay: today,
      lastAlertAt: now.toISOString(),
      count: decision.count,
    });
    return decision.count;
  });
}

/** Firestore's ALREADY_EXISTS: another delivery of today's report told the owners first. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists';
}

/** The dry run's view of the per-sale records: the same decision, read without a transaction. */
async function readRecords(db: Db, saleIds: string[]): Promise<Map<string, OverdueAlertRecord | null>> {
  const out = new Map<string, OverdueAlertRecord | null>();
  const collection = db.collection(ALERTS);
  for (let offset = 0; offset < saleIds.length; offset += READ_CHUNK) {
    const refs = saleIds.slice(offset, offset + READ_CHUNK).map((id) => collection.doc(id));
    if (!refs.length) continue;
    for (const snapshot of await db.getAll(...refs)) {
      out.set(snapshot.id, snapshot.exists ? readRecord(snapshot.data()) : null);
    }
  }
  return out;
}

export async function runOverdueInstallAlerts(deps: OverdueRunDeps): Promise<OverdueRunResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const dryRun = deps.dryRun ?? process.env.INSTALL_OVERDUE_ALERTS_OFF === 'true';
  const dispatch = deps.dispatch ?? dispatchToUser;
  const counts = emptyCounts(dryRun);
  const result: OverdueRunResult = { counts, repAlerts: [], ownerAlert: null, overdue: [] };
  const today = installDayKey(now);
  if (!today) return result;

  // The company book exactly as the admin board builds it: every sale, every
  // stored carrier order (read fresh, after this report's upsert), the users'
  // display names.
  const [usersSnap, salesSnap, ordersSnap, statusDoc] = await Promise.all([
    db.collection('users').get(),
    db.collection('sales').get(),
    db.collection('fiberOrders').get(),
    // The day the newest report covers: an install day after it is not judged.
    db.collection('config').doc('fiberReportStatus').get(),
  ]);
  const asOf = statusDoc.exists ? statusDoc.data()?.lastReportAsOf : null;
  const reportAsOf = typeof asOf === 'string' ? asOf : null;
  const repNames = new Map<string, string>();
  const activeUsers = new Set<string>();
  const ownerIds: string[] = [];
  for (const doc of usersSnap.docs) {
    const data = doc.data() ?? {};
    const name = text(data.displayName) ?? text(data.name);
    if (name) repNames.set(doc.id, name);
    if (data.status === 'active') activeUsers.add(doc.id);
    if (data.role === 'owner') ownerIds.push(doc.id);
  }
  const sales = salesSnap.docs.map((doc) => toSale(doc.id, doc.data() ?? {}));
  const orders = ordersSnap.docs.map((doc) => toFiberOrder(doc.id, doc.data() ?? {}));
  const book = buildMergedBook(sales, orders, { now, repNames, reportAsOf });

  const overdue = overdueSales(book.rows, now, reportAsOf);
  result.overdue = overdue;
  counts.overdue = overdue.length;

  // ---- reps
  const reachable = overdue.filter((sale) => {
    if (sale.repId && activeUsers.has(sale.repId)) return true;
    counts.skippedInactiveRep += 1;
    return false;
  });

  if (dryRun) {
    const records = await readRecords(db, reachable.map((sale) => sale.saleId));
    for (const sale of reachable) {
      const decision = overdueAlertDue(records.get(sale.saleId) ?? null, sale, today);
      if (!decision.send) {
        counts.alreadySent += 1;
        continue;
      }
      counts.repAlertsDue += 1;
      result.repAlerts.push(repAlert(sale, decision.count));
    }
  } else {
    const claimed: PlannedRepAlert[] = [];
    for (let offset = 0; offset < reachable.length; offset += CLAIM_CHUNK) {
      const chunk = reachable.slice(offset, offset + CLAIM_CHUNK);
      const settled = await Promise.allSettled(chunk.map((sale) => claimRepAlert(db, sale, today, now)));
      settled.forEach((outcome, index) => {
        const sale = chunk[index];
        if (outcome.status === 'rejected') {
          console.error(`[overdueAlerts] failed to claim sale ${sale.saleId}`, outcome.reason);
          counts.errors += 1;
        } else if (outcome.value === null) {
          counts.alreadySent += 1;
        } else {
          claimed.push(repAlert(sale, outcome.value));
        }
      });
    }
    counts.repAlertsDue = claimed.length;

    for (const alert of claimed) {
      try {
        // In-app + push only, like the other carrier-report notices. No money.
        await dispatch({
          userId: alert.repId,
          type: 'install_overdue',
          title: alert.title,
          message: alert.message,
          link: alert.link,
          metadata: { saleId: alert.saleId, daysOverdue: alert.daysOverdue, alertCount: alert.count },
        });
        counts.repAlertsSent += 1;
        result.repAlerts.push(alert);
      } catch (error) {
        console.error(`[overdueAlerts] failed to notify ${alert.repId} about sale ${alert.saleId}`, error);
        counts.errors += 1;
      }
    }
  }

  // ---- owners: one summary a day while anything is overdue
  const message = overdueOwnerMessage(overdue);
  if (!message || !ownerIds.length) return result;
  const ownerAlert: PlannedOwnerAlert = { ownerIds, title: OVERDUE_OWNER_TITLE, message, link: OWNER_LINK };

  if (dryRun) {
    const digest = await db.collection(DIGESTS).doc(today).get();
    counts.ownerSummary = digest.exists ? 'already_sent' : 'dry_run';
    if (!digest.exists) result.ownerAlert = ownerAlert;
    return result;
  }

  try {
    await db.collection(DIGESTS).doc(today).create({
      day: today,
      at: now.toISOString(),
      overdue: overdue.length,
      owners: ownerIds.length,
    });
  } catch (error) {
    if (isAlreadyExists(error)) {
      counts.ownerSummary = 'already_sent';
    } else {
      console.error('[overdueAlerts] failed to claim the owner summary', error);
      counts.ownerSummary = 'failed';
      counts.errors += 1;
    }
    return result;
  }

  let sent = 0;
  for (const ownerId of ownerIds) {
    try {
      await dispatch({
        userId: ownerId,
        type: 'install_overdue_summary',
        title: ownerAlert.title,
        message: ownerAlert.message,
        link: ownerAlert.link,
        metadata: { day: today, overdue: overdue.length },
      });
      sent += 1;
    } catch (error) {
      console.error(`[overdueAlerts] failed to notify owner ${ownerId}`, error);
      counts.errors += 1;
    }
  }
  counts.ownerSummary = sent ? 'sent' : 'failed';
  result.ownerAlert = ownerAlert;
  return result;
}
