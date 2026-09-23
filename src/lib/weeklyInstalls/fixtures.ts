import type { CompPlanCompanyRates, FiberOrder, Sale, SaleProduct } from '@/types';
import type { RepDigestInput } from '@/lib/weeklyInstalls/digest';
import { reportWeekFromStart } from '@/lib/weeklyInstalls/week';

// FIXTURE data for tests and the sample renders. Invented customers, invented
// addresses; nothing here is read from Firestore.

/** AE Tier 1's T-Fiber slice of the committed comp plan. */
export const FIXTURE_RATES: CompPlanCompanyRates = {
  tfiber: { 'tfiber-300': 67.5, 'tfiber-500': 97.5, 'tfiber-1gig': 138, 'tfiber-2gig': 168 },
};

const PLAN_NAMES: Record<string, string> = {
  'tfiber-300': 'TFiber 300',
  'tfiber-500': 'TFiber 500',
  'tfiber-1gig': 'TFiber 1 Gig',
  'tfiber-2gig': 'TFiber 2 Gig',
};

/** Local noon, the way install and sale dates are stored. */
export function localNoon(key: string): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

export function product(productId: string, company = 'tfiber'): SaleProduct {
  return {
    productId,
    productName: PLAN_NAMES[productId] ?? productId,
    company,
    quantity: 1,
    unitPrice: 0,
    totalPrice: 0,
    points: 0,
  };
}

export function fixtureSale(
  partial: Partial<Sale> & { id: string; salesRepId: string; plan?: string; installDay?: string | null; soldDay?: string }
): Sale {
  const { plan, installDay, soldDay, ...rest } = partial;
  return {
    salesRepName: 'Rep',
    customerAddress: '100 Main St, Dallas, TX 75201',
    saleType: 'new_service',
    products: [product(plan ?? 'tfiber-1gig')],
    totalValue: 60,
    totalPoints: 8,
    status: 'approved',
    saleDate: localNoon(soldDay ?? '2026-09-01'),
    ...(installDay ? { installDate: localNoon(installDay) } : {}),
    createdAt: localNoon(soldDay ?? '2026-09-01'),
    updatedAt: localNoon(soldDay ?? '2026-09-01'),
    ...rest,
  } as Sale;
}

export function fixtureOrder(partial: Partial<FiberOrder> & { id: string; address: string }): FiberOrder {
  return {
    status: 'pending_install',
    rawStatus: '',
    repDealerId: '4721016',
    repName: 'REP',
    matchedUserId: null,
    orderDate: '2026-09-01',
    estInstallDate: null,
    activationDate: null,
    cancellationDate: null,
    deactivationDate: null,
    fiberPlan: null,
    mrc: null,
    unit: null,
    city: 'Dallas',
    state: 'TX',
    zip: '75201',
    breakageReason: null,
    breakageNotes: null,
    customerName: null,
    sourceSheet: 'Orders',
    reportReceivedAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
    ...partial,
  };
}

/** Sun Sep 13 – Sat Sep 19, 2026; the email goes out Mon Sep 21. */
export const FIXTURE_WEEK = reportWeekFromStart('2026-09-13');

const BUSY = 'rep-braeden';

/** A strong week: four installs, two on deck, two carrier cancels, two to date. */
export function busyWeekInput(): RepDigestInput {
  const sale = (partial: Parameters<typeof fixtureSale>[0]) =>
    fixtureSale({ salesRepName: 'Braeden Carter', ...partial });
  const order = (partial: Parameters<typeof fixtureOrder>[0]) =>
    fixtureOrder({ matchedUserId: BUSY, repName: 'BRAEDEN CARTER', ...partial });

  return {
    rep: { uid: BUSY, name: 'Braeden Carter' },
    rates: FIXTURE_RATES,
    week: FIXTURE_WEEK,
    sales: [
      sale({ id: 's1', salesRepId: BUSY, customerName: 'Maria Lopez', customerAddress: '4417 Ridgecrest Dr, Plano, TX 75024', plan: 'tfiber-1gig', installDay: '2026-09-15', soldDay: '2026-09-04' }),
      sale({ id: 's2', salesRepId: BUSY, customerName: 'James Whitfield', customerAddress: '918 Cedar Hollow Ln, Frisco, TX 75034', plan: 'tfiber-2gig', installDay: '2026-09-14', soldDay: '2026-09-05' }),
      // The carrier activated this one on the 17th; the rep typed the 12th.
      sale({ id: 's3', salesRepId: BUSY, customerName: 'Tanya Brooks', customerAddress: '2210 Meadowview Ct, Allen, TX 75002', plan: 'tfiber-500', installDay: '2026-09-12', soldDay: '2026-09-02' }),
      sale({ id: 's4', salesRepId: BUSY, customerName: 'Derrick Owens', customerAddress: '65 Willow Bend Rd, McKinney, TX 75070', plan: 'tfiber-300', installDay: '2026-09-19', soldDay: '2026-09-08' }),
      // Coming up this week.
      sale({ id: 's5', salesRepId: BUSY, customerName: 'Priya Natarajan', customerAddress: '3120 Silver Maple Dr, Plano, TX 75025', plan: 'tfiber-1gig', installDay: '2026-09-22', soldDay: '2026-09-15' }),
      sale({ id: 's6', salesRepId: BUSY, customerName: 'Marcus Hill', customerAddress: '801 Oak Crest Trl, Frisco, TX 75033', plan: 'tfiber-500', installDay: '2026-09-24', soldDay: '2026-09-16' }),
      // Carrier-cancelled: out of installs, into the cancelled list.
      sale({ id: 's7', salesRepId: BUSY, customerName: 'Kevin Tran', customerAddress: '3301 Lakeside Blvd, Allen, TX 75013', plan: 'tfiber-1gig', installDay: '2026-09-18', soldDay: '2026-09-06' }),
      // Needs a date: never set, and one that broke at the door.
      sale({ id: 's8', salesRepId: BUSY, customerName: 'Alicia Gomez', customerAddress: '1450 Sunset Ridge, Plano, TX 75023', plan: 'tfiber-1gig', soldDay: '2026-09-17' }),
      sale({ id: 's9', salesRepId: BUSY, customerName: 'Robert Chen', customerAddress: '52 Harbor Point Dr, Frisco, TX 75034', plan: 'tfiber-2gig', installDay: '2026-09-10', soldDay: '2026-09-01' }),
      // Noise that must NOT appear: another carrier, a rejected sale, an old install.
      sale({ id: 'n1', salesRepId: BUSY, customerName: 'Not TFiber', customerAddress: '9 Elm St, Dallas, TX', products: [product('att-1gig', 'att')], installDay: '2026-09-15' }),
      sale({ id: 'n2', salesRepId: BUSY, customerName: 'Rejected Sale', customerAddress: '10 Elm St, Dallas, TX', status: 'rejected', installDay: '2026-09-16' }),
      sale({ id: 'n3', salesRepId: BUSY, customerName: 'Old Install', customerAddress: '11 Elm St, Dallas, TX', installDay: '2026-09-03' }),
      // Someone else's sale in the input must never leak in.
      sale({ id: 'x1', salesRepId: 'rep-other', salesRepName: 'Other Rep', customerName: 'Other Customer', customerAddress: '12 Elm St, Dallas, TX', installDay: '2026-09-15' }),
    ],
    orders: [
      order({ id: 'TMO1', address: '4417 Ridgecrest Dr', status: 'active', activationDate: '2026-09-15', fiberPlan: 'Fiber 1 Gig' }),
      order({ id: 'TMO3', address: '2210 Meadowview Ct', status: 'active', activationDate: '2026-09-17', fiberPlan: 'Fiber 500' }),
      order({ id: 'TMO7', address: '3301 Lakeside Blvd', status: 'cancelled', cancellationDate: '2026-09-16', fiberPlan: 'Fiber 1 Gig' }),
      // Nobody logged this one; it is still the rep's customer to call.
      order({ id: 'TMO8', address: '77 Birchwood Pl', status: 'cancelled', cancellationDate: '2026-09-18', fiberPlan: 'Fiber 500' }),
      order({ id: 'brk_9', address: '52 Harbor Point Dr', status: 'breakage', breakageReason: 'CX Missed — Customer Not Home' }),
      // Cancelled the week before: not this email's business.
      order({ id: 'TMO_OLD', address: '600 Pine St', status: 'cancelled', cancellationDate: '2026-09-09' }),
      // Another rep's cancel.
      order({ id: 'TMO_X', address: '700 Pine St', status: 'cancelled', cancellationDate: '2026-09-16', matchedUserId: 'rep-other' }),
    ],
  };
}

const LIGHT = 'rep-jasmine';

/** A quiet week: one install and one sale still waiting on a date. */
export function lightWeekInput(): RepDigestInput {
  return {
    rep: { uid: LIGHT, name: 'Jasmine Reed' },
    rates: FIXTURE_RATES,
    week: FIXTURE_WEEK,
    sales: [
      fixtureSale({ id: 'j1', salesRepId: LIGHT, salesRepName: 'Jasmine Reed', customerName: 'Gloria Santos', customerAddress: '2045 Brookhaven Dr, Richardson, TX 75080', plan: 'tfiber-500', installDay: '2026-09-17', soldDay: '2026-09-09' }),
      fixtureSale({ id: 'j2', salesRepId: LIGHT, salesRepName: 'Jasmine Reed', customerName: 'Nate Wallace', customerAddress: '318 Canyon Creek Dr, Richardson, TX 75080', plan: 'tfiber-1gig', soldDay: '2026-09-18' }),
    ],
    orders: [],
  };
}
