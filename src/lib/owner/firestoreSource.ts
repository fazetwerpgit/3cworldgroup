import { adminDb } from '@/lib/firebase/admin';
import { fiberOrdersCacheKey, getAllFiberOrders } from '@/lib/fiberReport/ordersCache';
import { PORTAL_LOGGING_START } from '@/lib/sales/mergeBook';
import { loadDayMessages } from '@/lib/alerts/calloutNudges';
import { COMP_PLAN_MARGIN, COMP_PLAN_RATES } from '@/data/compPlan.generated';
import type { CompPlanMargin, CompPlanRates, Sale } from '@/types';
import type { ActivatedUser, OwnerBook, OwnerSummarySource, RepRoles } from './companySummary';
import { DEMO_ACCOUNT_FIELD, TEST_ACCOUNT_FIELD, isDemoSale, isHiddenUser } from '@/lib/users/demoAccount';

// Admin SDK reads behind the owner summary. READ ONLY — nothing here writes.
//
// Reads per request (the numbers the owner view costs):
//   sales            saleDate >= PORTAL_LOGGING_START, projected to the fields
//                    the carrier join and pricing need, order number included
//                    (no customer name, phone or email). This is the same book the admin Sales board
//                    reads; it grows with the business (see report / TODO).
//   fiberOrders      whole collection, through the shared lastReportAt cache.
//   users            getAll on the reps with installs in the money window
//                    (fieldRole/role only); status == 'pending' (small);
//                    hireDate >= last Sunday-week start (small).
//   alertTasks       status in [open, claimed] (small).
//   chatChannels/all-company/messages  today's, Chicago (createdAt range).
//   form queues      count() aggregations on status == 'new'.
//   applications,
//   managerInterviews count() aggregations on a createdAt range.
// Every filter is on a single field, so no composite index is needed.

const SALE_FIELDS = [
  'salesRepId',
  DEMO_ACCOUNT_FIELD,
  TEST_ACCOUNT_FIELD,
  'salesRepName',
  'customerAddress',
  'orderNumberOrBtn',
  'products',
  'status',
  'saleDate',
  'installDate',
  'totalValue',
  // The board ranks by points: without them every rep ties at 0 and the top
  // rep falls to the name first A to Z.
  'totalPoints',
  'createdAt',
];

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === 'object' && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Chicago midnight at the start of the logging window (CDT in April). */
function loggingStart(): Date {
  return new Date(`${PORTAL_LOGGING_START}T05:00:00Z`);
}

function db() {
  if (!adminDb) throw new Error('Database not configured');
  return adminDb;
}

/**
 * The book of the last request, reused for a short while across requests: a
 * single-section Retry (or a second section asked for right after the first)
 * then does not re-read every sale since launch. Keyed on the carrier report's
 * lastReportAt + ordersRev (fiberOrdersCacheKey), so a new report or an order
 * write always reads fresh. Server memory only; the
 * owner summary route is owner-gated.
 */
const BOOK_CACHE_MS = 60_000;
let recentBook: { reportAt: string | null; at: number; book: Promise<OwnerBook> } | null = null;

/** Tests: forget the cross-request book. */
export function clearOwnerBookCache() {
  recentBook = null;
}

async function readBook(statusDoc: FirebaseFirestore.DocumentSnapshot): Promise<OwnerBook> {
  const lastReportAt = statusDoc.exists ? ((statusDoc.data()?.lastReportAt as string | undefined) ?? null) : null;
  const asOf = statusDoc.exists ? statusDoc.data()?.lastReportAsOf : null;
  const reportAsOf = typeof asOf === 'string' ? asOf : null;
  const [salesSnap, orders] = await Promise.all([
    db().collection('sales').where('saleDate', '>=', loggingStart()).select(...SALE_FIELDS).get(),
    getAllFiberOrders(statusDoc.exists ? (statusDoc.data() ?? null) : null),
  ]);
  // The owner never sees a demo account's sales (nor do they join carrier orders).
  const sales = salesSnap.docs.filter((doc) => !isDemoSale(doc.data())).map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      salesRepId: data.salesRepId ?? '',
      salesRepName: data.salesRepName ?? '',
      // The carrier join reads the order number first, as the board does.
      customerAddress: data.customerAddress ?? '',
      orderNumberOrBtn: data.orderNumberOrBtn ?? '',
      products: Array.isArray(data.products) ? data.products : [],
      status: data.status,
      saleDate: toDate(data.saleDate),
      installDate: toDate(data.installDate),
      totalValue: typeof data.totalValue === 'number' ? data.totalValue : 0,
      totalPoints: typeof data.totalPoints === 'number' ? data.totalPoints : 0,
      createdAt: toDate(data.createdAt),
    } as Sale;
  });
  return { sales, orders, reportAt: lastReportAt, reportAsOf };
}

/** One source per request: the book is read once however many sections ask for it. */
export function createFirestoreOwnerSource(): OwnerSummarySource {
  let book: Promise<OwnerBook> | null = null;

  return {
    loadBook() {
      book ??= (async () => {
        const statusDoc = await db().collection('config').doc('fiberReportStatus').get();
        // Keyed like the carrier orders cache: a new report or an order write misses.
        const reportAt = fiberOrdersCacheKey(statusDoc.exists ? (statusDoc.data() ?? null) : null);
        const now = Date.now();
        if (recentBook && recentBook.reportAt === reportAt && now - recentBook.at < BOOK_CACHE_MS) {
          return recentBook.book;
        }
        const read = readBook(statusDoc);
        const entry = { reportAt, at: now, book: read };
        recentBook = entry;
        // A failed read is never served to the next request.
        read.catch(() => {
          if (recentBook === entry) recentBook = null;
        });
        return read;
      })();
      return book;
    },

    async loadCompPlan() {
      const [ratesDoc, marginDoc] = await Promise.all([
        db().collection('config').doc('compPlan').get(),
        db().collection('config').doc('compPlanMargin').get(),
      ]);
      return {
        rates: ((ratesDoc.exists ? ratesDoc.data()?.rates : null) as Partial<CompPlanRates> | null) ?? COMP_PLAN_RATES,
        margin: ((marginDoc.exists ? marginDoc.data()?.margin : null) as CompPlanMargin | null) ?? COMP_PLAN_MARGIN,
      };
    },

    async loadRepRoles(repIds) {
      const roles = new Map<string, RepRoles>();
      if (!repIds.length) return roles;
      const refs = repIds.map((id) => db().collection('users').doc(id));
      const snaps = await db().getAll(...refs, { fieldMask: ['fieldRole', 'role'] });
      for (const snap of snaps) {
        if (!snap.exists) continue;
        roles.set(snap.id, { fieldRole: snap.get('fieldRole') ?? null, role: snap.get('role') ?? null });
      }
      return roles;
    },

    async countOpen(queue) {
      const snap = await db().collection(queue).where('status', '==', 'new').count().get();
      return snap.data().count;
    },

    async countPendingSignups() {
      const snap = await db()
        .collection('users')
        .where('status', '==', 'pending')
        .select('fieldRole', 'suspectedBot', DEMO_ACCOUNT_FIELD, TEST_ACCOUNT_FIELD)
        .get();
      return snap.docs.filter((doc) => !doc.get('fieldRole') && !doc.get('suspectedBot') && !isHiddenUser(doc.data())).length;
    },

    async countStalledOnboarding() {
      const snap = await db().collection('alertTasks').where('status', 'in', ['open', 'claimed']).select('kind').get();
      return snap.docs.filter((doc) => doc.get('kind') === 'stalled_rep').length;
    },

    async countCreated(collection, window) {
      const snap = await db()
        .collection(collection)
        .where('createdAt', '>=', window.start)
        .where('createdAt', '<', window.end)
        .count()
        .get();
      return snap.data().count;
    },

    // Users activated since `since` by either stamp: activatedAt (every pending ->
    // active flip) or hireDate (docs from before activatedAt existed). Merged by
    // id; activationsByWeek picks activatedAt first.
    async loadActivatedSince(since) {
      const users = db().collection('users');
      const fields = ['status', 'fieldRole', 'hireDate', 'activatedAt', DEMO_ACCOUNT_FIELD, TEST_ACCOUNT_FIELD] as const;
      const [byActivated, byHire] = await Promise.all([
        users.where('activatedAt', '>=', since).select(...fields).get(),
        users.where('hireDate', '>=', since).select(...fields).get(),
      ]);
      const byId = new Map<string, ActivatedUser>();
      for (const doc of [...byActivated.docs, ...byHire.docs]) {
        if (byId.has(doc.id) || isHiddenUser(doc.data())) continue;
        byId.set(doc.id, {
          status: doc.get('status') ?? null,
          fieldRole: doc.get('fieldRole') ?? null,
          activatedAt: toDate(doc.get('activatedAt')) ?? null,
          hireDate: toDate(doc.get('hireDate')) ?? null,
        });
      }
      return [...byId.values()];
    },

    loadDayMessages(day) {
      return loadDayMessages(db(), day);
    },
  };
}
