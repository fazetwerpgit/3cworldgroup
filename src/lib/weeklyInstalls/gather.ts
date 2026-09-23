import type { CompPlanCompanyRates, CompPlanRates, FiberOrder, Sale } from '@/types';
import { resolveCompRole, resolveRoles } from '@/types';
import { COMP_PLAN_RATES } from '@/data/compPlan.generated';
import { emailFromUserDoc } from '@/lib/email/userEmail';

// The Firestore half of the Monday email. READ ONLY: every function here reads
// and returns plain data; nothing in this module writes, so building a digest
// or a preview can never touch production state. (The send log the cron keeps
// lives in sendLog.ts, and only the cron calls it.)

type Db = FirebaseFirestore.Firestore;
type DocData = FirebaseFirestore.DocumentData;

export interface WeeklyRepInput {
  uid: string;
  name: string;
  /** undefined when the user doc carries no usable address. */
  email: string | undefined;
  rates: CompPlanCompanyRates | null;
  sales: Sale[];
  orders: FiberOrder[];
}

const SALE_DATE_FIELDS = [
  'saleDate',
  'installDate',
  'installDatePreviousDate',
  'installDateChangedAt',
  'createdAt',
  'updatedAt',
  'approvedAt',
  'cancelledAt',
] as const;

/** A Firestore Timestamp, Date or ISO string → Date; anything else → undefined. */
export function toDateValue(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  const maybe = value as { toDate?: () => Date } | null | undefined;
  if (maybe && typeof maybe.toDate === 'function') {
    const date = maybe.toDate();
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : undefined;
  }
  if (typeof value === 'string' && value.trim()) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

/** A sale doc as the pure helpers expect it: dates as Date, never Timestamp. */
export function toSale(id: string, data: DocData): Sale {
  const sale = { ...data, id } as Record<string, unknown>;
  for (const field of SALE_DATE_FIELDS) {
    if (field in sale) sale[field] = toDateValue(sale[field]);
  }
  return sale as unknown as Sale;
}

export function toFiberOrder(id: string, data: DocData): FiberOrder {
  return { ...data, id } as FiberOrder;
}

/** Mirrors GET /api/portal/comp-plan: config/compPlan, else the committed plan. */
export async function loadCompRates(db: Db): Promise<Partial<CompPlanRates>> {
  const doc = await db.collection('config').doc('compPlan').get();
  if (!doc.exists) return COMP_PLAN_RATES;
  return (doc.data()?.rates as Partial<CompPlanRates>) ?? COMP_PLAN_RATES;
}

/** The rep's own slice, resolved the way the comp-plan route resolves it. */
export function ratesForUser(rates: Partial<CompPlanRates>, user: DocData): CompPlanCompanyRates | null {
  const { role, fieldRole } = resolveRoles(user.role, user.fieldRole);
  const compRole = resolveCompRole(fieldRole, role);
  return compRole ? rates[compRole] ?? null : null;
}

function displayName(user: DocData, fallback: string): string {
  const name = [user.displayName, user.name, user.fullName].find(
    (value) => typeof value === 'string' && value.trim()
  ) as string | undefined;
  return name?.trim() || fallback;
}

function userInput(
  uid: string,
  snap: FirebaseFirestore.DocumentSnapshot,
  rates: Partial<CompPlanRates>,
  sales: Sale[],
  orders: FiberOrder[]
): WeeklyRepInput {
  const data = snap.data() ?? {};
  const email = emailFromUserDoc(snap);
  return {
    uid,
    name: displayName(data, email ?? 'there'),
    email,
    rates: ratesForUser(rates, data),
    sales,
    orders,
  };
}

/**
 * Every ACTIVE user with their own sales and carrier orders. Whole-collection
 * reads, once a week: the admin board already reads both collections whole
 * (see fiberReport/ordersCache for why no bound is safe on orders).
 */
export async function gatherAllReps(db: Db): Promise<WeeklyRepInput[]> {
  const [usersSnap, salesSnap, ordersSnap, rates] = await Promise.all([
    db.collection('users').where('status', '==', 'active').get(),
    db.collection('sales').get(),
    db.collection('fiberOrders').get(),
    loadCompRates(db),
  ]);

  const salesByRep = new Map<string, Sale[]>();
  for (const doc of salesSnap.docs) {
    const sale = toSale(doc.id, doc.data());
    if (!sale.salesRepId) continue;
    const list = salesByRep.get(sale.salesRepId) ?? [];
    list.push(sale);
    salesByRep.set(sale.salesRepId, list);
  }

  const ordersByRep = new Map<string, FiberOrder[]>();
  for (const doc of ordersSnap.docs) {
    const order = toFiberOrder(doc.id, doc.data());
    if (!order.matchedUserId) continue;
    const list = ordersByRep.get(order.matchedUserId) ?? [];
    list.push(order);
    ordersByRep.set(order.matchedUserId, list);
  }

  return usersSnap.docs
    .filter((doc) => salesByRep.has(doc.id) || ordersByRep.has(doc.id))
    .map((doc) =>
      userInput(doc.id, doc, rates, salesByRep.get(doc.id) ?? [], ordersByRep.get(doc.id) ?? [])
    );
}

/** One rep, for the owner preview. null when the user doc does not exist. */
export async function gatherRep(db: Db, uid: string): Promise<WeeklyRepInput | null> {
  const [userSnap, salesSnap, ordersSnap, rates] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('sales').where('salesRepId', '==', uid).get(),
    db.collection('fiberOrders').where('matchedUserId', '==', uid).get(),
    loadCompRates(db),
  ]);
  if (!userSnap.exists) return null;
  return userInput(
    uid,
    userSnap,
    rates,
    salesSnap.docs.map((doc) => toSale(doc.id, doc.data())),
    ordersSnap.docs.map((doc) => toFiberOrder(doc.id, doc.data()))
  );
}
