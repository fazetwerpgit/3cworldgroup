import { dispatchToUser, type DispatchInput } from '@/lib/alerts/dispatch';
import { buildMergedBook } from '@/lib/sales/mergeBook';
import { unloggedOrders, unloggedOrdersPush, type UnloggedOrder } from '@/lib/sales/unloggedOrders';
import { toFiberOrder, toSale } from '@/lib/weeklyInstalls/gather';
import { chicagoDayKey } from '@/lib/weeklyInstalls/week';
import type { UnloggedOrderNudgeCounts } from '@/types/fiberOrder';
import { isDemoAccount } from '@/lib/users/demoAccount';

// The carrier backstop for sales nobody logged. After a report lands, a live
// carrier order matched to a rep that no sale claims (the board's "Not in the
// portal", the same buildMergedBook join) is told to that rep once: one push
// per rep per report, naming how many. A callout the rep forgot is caught the
// same day by the callout nudge (calloutNudges.ts); this catches the rest.
// Which orders, and the words: lib/sales/unloggedOrders.ts. Only reps who are
// active users are told, as with the overdue alerts.
//
// Where "told" is recorded: unloggedOrderNudges/{orderId}, a server-only side
// collection, claimed with create() BEFORE the send, so a report Postmark
// delivers twice tells nobody twice, and an order is told once ever however
// many reports still list it. A failed claim sends nothing.
//
//   UNLOGGED_ORDER_NUDGE_OFF  "true" makes every run a dry run: the same
//                             reads, no claim, no send.

type Db = FirebaseFirestore.Firestore;

const CLAIMS = 'unloggedOrderNudges';
const CLAIM_CHUNK = 20;

export interface UnloggedOrderPush {
  repId: string;
  repName: string;
  orderIds: string[];
  title: string;
  message: string;
  link: string;
}

export interface UnloggedOrderRunResult {
  counts: UnloggedOrderNudgeCounts;
  /** Dry run: what would be sent. Live: what was claimed and sent. */
  pushes: UnloggedOrderPush[];
  /** Every qualifying order, told before or not. */
  orders: UnloggedOrder[];
}

export interface UnloggedOrderRunDeps {
  db: Db;
  now?: Date;
  /** Read and plan only. Defaults to UNLOGGED_ORDER_NUDGE_OFF. */
  dryRun?: boolean;
  dispatch?: (input: DispatchInput) => Promise<void>;
}

/** Firestore's ALREADY_EXISTS: an earlier report already told this order. */
function isAlreadyExists(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 6 || code === 'already-exists';
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function groupByRep(orders: readonly UnloggedOrder[]): Map<string, UnloggedOrder[]> {
  const byRep = new Map<string, UnloggedOrder[]>();
  for (const order of orders) byRep.set(order.repId, [...(byRep.get(order.repId) ?? []), order]);
  return byRep;
}

function repPush(own: UnloggedOrder[]): UnloggedOrderPush {
  return { repId: own[0].repId, repName: own[0].repName, orderIds: own.map((order) => order.orderId), ...unloggedOrdersPush(own) };
}

export async function runUnloggedOrderNudges(deps: UnloggedOrderRunDeps): Promise<UnloggedOrderRunResult> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const dryRun = deps.dryRun ?? process.env.UNLOGGED_ORDER_NUDGE_OFF === 'true';
  const dispatch = deps.dispatch ?? dispatchToUser;
  const counts: UnloggedOrderNudgeCounts = {
    dryRun,
    found: 0,
    alreadySent: 0,
    skippedInactiveRep: 0,
    ordersTold: 0,
    repsTold: 0,
    errors: 0,
  };
  const result: UnloggedOrderRunResult = { counts, pushes: [], orders: [] };
  const today = chicagoDayKey(now);
  if (!today) return result;

  // The company book exactly as the admin board builds it (and the overdue
  // alerts read it): every sale, every stored carrier order, the users' names.
  const [usersSnap, salesSnap, ordersSnap, statusDoc] = await Promise.all([
    db.collection('users').get(),
    db.collection('sales').get(),
    db.collection('fiberOrders').get(),
    db.collection('config').doc('fiberReportStatus').get(),
  ]);
  const asOf = statusDoc.exists ? statusDoc.data()?.lastReportAsOf : null;
  const repNames = new Map<string, string>();
  const activeUsers = new Set<string>();
  for (const doc of usersSnap.docs) {
    const data = doc.data() ?? {};
    if (isDemoAccount(data)) continue;
    const name = text(data.displayName) ?? text(data.name);
    if (name) repNames.set(doc.id, name);
    if (data.status === 'active') activeUsers.add(doc.id);
  }
  const book = buildMergedBook(
    salesSnap.docs.map((doc) => toSale(doc.id, doc.data() ?? {})),
    ordersSnap.docs.map((doc) => toFiberOrder(doc.id, doc.data() ?? {})),
    { now, repNames, reportAsOf: typeof asOf === 'string' ? asOf : null }
  );

  const found = unloggedOrders(book.rows, today);
  result.orders = found;
  counts.found = found.length;
  // Active users only, mirroring the overdue alerts: a rep who left is not told.
  const reachable = found.filter((order) => {
    if (activeUsers.has(order.repId)) return true;
    counts.skippedInactiveRep += 1;
    return false;
  });

  const claimed: UnloggedOrder[] = [];
  if (dryRun) {
    const refs = reachable.map((order) => db.collection(CLAIMS).doc(order.orderId));
    const snaps = refs.length ? await db.getAll(...refs) : [];
    const told = new Set(snaps.filter((snap) => snap.exists).map((snap) => snap.id));
    for (const order of reachable) {
      if (told.has(order.orderId)) counts.alreadySent += 1;
      else claimed.push(order);
    }
    for (const own of groupByRep(claimed).values()) result.pushes.push(repPush(own));
    return result;
  }

  for (let offset = 0; offset < reachable.length; offset += CLAIM_CHUNK) {
    const chunk = reachable.slice(offset, offset + CLAIM_CHUNK);
    const settled = await Promise.allSettled(
      chunk.map((order) =>
        db.collection(CLAIMS).doc(order.orderId).create({
          orderId: order.orderId,
          repId: order.repId,
          orderDate: order.orderDate,
          status: order.status,
          at: now.toISOString(),
        })
      )
    );
    settled.forEach((outcome, index) => {
      const order = chunk[index];
      if (outcome.status === 'fulfilled') claimed.push(order);
      else if (isAlreadyExists(outcome.reason)) counts.alreadySent += 1;
      else {
        console.error(`[unloggedOrders] failed to claim order ${order.orderId}`, outcome.reason);
        counts.errors += 1;
      }
    });
  }

  for (const own of groupByRep(claimed).values()) {
    const push = repPush(own);
    try {
      // Bell + push only, like the other carrier-report notices. No money.
      await dispatch({
        userId: push.repId,
        type: 'unlogged_orders',
        title: push.title,
        message: push.message,
        link: push.link,
        metadata: { orderIds: push.orderIds },
      });
      counts.repsTold += 1;
      counts.ordersTold += own.length;
      result.pushes.push(push);
    } catch (error) {
      console.error(`[unloggedOrders] failed to notify ${push.repId}`, error);
      counts.errors += 1;
    }
  }
  return result;
}
