import { adminDb } from '@/lib/firebase/admin';
import { getAllFiberOrders } from '@/lib/fiberReport/ordersCache';
import { PORTAL_LOGGING_START } from '@/lib/sales/mergeBook';
import { COMP_PLAN_MARGIN, COMP_PLAN_RATES } from '@/data/compPlan.generated';
import type { CompPlanMargin, CompPlanRates, FiberOrder, Sale } from '@/types';
import type { OwnerSummarySource, RepRoles } from './companySummary';

// Admin SDK reads behind the owner summary. READ ONLY — nothing here writes.
//
// Reads per request (the numbers the owner view costs):
//   sales            saleDate >= PORTAL_LOGGING_START, projected to the fields
//                    the carrier join and pricing need (no customer name, phone
//                    or email). This is the same book the admin Sales board
//                    reads; it grows with the business (see report / TODO).
//   fiberOrders      whole collection, through the shared lastReportAt cache.
//   users            getAll on the reps with installs in the money window
//                    (fieldRole/role only); status == 'pending' (small);
//                    hireDate >= last Sunday-week start (small).
//   alertTasks       status in [open, claimed] (small).
//   form queues      count() aggregations on status == 'new'.
//   applications,
//   managerInterviews count() aggregations on a createdAt range.
// Every filter is on a single field, so no composite index is needed.

const SALE_FIELDS = [
  'salesRepId',
  'salesRepName',
  'customerAddress',
  'products',
  'status',
  'saleDate',
  'installDate',
  'totalValue',
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

/** One source per request: the book is read once however many sections ask for it. */
export function createFirestoreOwnerSource(): OwnerSummarySource {
  let book: Promise<{ sales: Sale[]; orders: FiberOrder[] }> | null = null;

  return {
    loadBook() {
      book ??= (async () => {
        const [salesSnap, statusDoc] = await Promise.all([
          db().collection('sales').where('saleDate', '>=', loggingStart()).select(...SALE_FIELDS).get(),
          db().collection('config').doc('fiberReportStatus').get(),
        ]);
        const lastReportAt = statusDoc.exists ? ((statusDoc.data()?.lastReportAt as string | undefined) ?? null) : null;
        const orders = await getAllFiberOrders(lastReportAt);
        const sales = salesSnap.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            salesRepId: data.salesRepId ?? '',
            salesRepName: data.salesRepName ?? '',
            customerAddress: data.customerAddress ?? '',
            products: Array.isArray(data.products) ? data.products : [],
            status: data.status,
            saleDate: toDate(data.saleDate),
            installDate: toDate(data.installDate),
            totalValue: typeof data.totalValue === 'number' ? data.totalValue : 0,
            createdAt: toDate(data.createdAt),
          } as Sale;
        });
        return { sales, orders };
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
      const snap = await db().collection('users').where('status', '==', 'pending').select('fieldRole', 'suspectedBot').get();
      return snap.docs.filter((doc) => !doc.get('fieldRole') && !doc.get('suspectedBot')).length;
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

    async loadActivatedSince(since) {
      const snap = await db()
        .collection('users')
        .where('hireDate', '>=', since)
        .select('status', 'fieldRole', 'hireDate')
        .get();
      return snap.docs.map((doc) => ({
        status: doc.get('status') ?? null,
        fieldRole: doc.get('fieldRole') ?? null,
        hireDate: toDate(doc.get('hireDate')) ?? null,
      }));
    },
  };
}
