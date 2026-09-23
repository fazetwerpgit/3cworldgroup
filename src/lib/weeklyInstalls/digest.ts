import type { CompPlanCompanyRates, FiberOrder, Sale } from '@/types';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { countedSales, installBucketForSale, isCarrierCancelled } from '@/lib/sales/installBucket';
import { installDayKey } from '@/lib/sales/saleDate';
import { formatPayoutWindow, isTFiberSale, payoutWindowForInstall } from '@/lib/pay/payoutWindow';
import { planLabel } from '@/lib/dashboard/repSummary';
import {
  dayKeyToLocalNoon,
  inRange,
  sendInstantFor,
  type DayKey,
  type ReportWeek,
} from '@/lib/weeklyInstalls/week';

// One rep's Monday email, as data. Pure: the rep's own sales and carrier orders
// in, the sections out. The renderer turns this into HTML; the cron and the
// owner preview both build it the same way, so what the owner previews is
// exactly what the rep would get.
//
// The join is the one the rep's own Sales page uses (sales/page.tsx):
// matchFiberOrdersToSales over the rep's sales and the rep's carrier orders,
// then applyCarrierInstallDates so a carrier activation date wins. The email
// can therefore never disagree with the page it links to.
//
// T-Fiber only for now (Jacob's focus). The carrier report IS the T-Fiber
// report, so every carrier order is T-Fiber; sales are filtered by product.

export interface DigestRep {
  uid: string;
  name: string;
}

export interface RepDigestInput {
  rep: DigestRep;
  /** The rep's OWN sales (salesRepId === rep.uid), dates already as Date. */
  sales: Sale[];
  /** The rep's OWN carrier orders (matchedUserId === rep.uid). */
  orders: FiberOrder[];
  /** The rep's own slice of the comp plan; null when their role has none. */
  rates: CompPlanCompanyRates | null;
  week: ReportWeek;
  /** Defaults to the send Monday morning of `week`. */
  now?: Date;
}

export interface DigestInstall {
  saleId: string;
  customer: string;
  address: string;
  plan: string;
  installDay: DayKey;
  /** Null when it cannot be computed from real rates — then it is not shown. */
  estPay: number | null;
  /** "Oct 7–11". Always a range, never a single date. */
  payoutWindow: string;
  /** The carrier's report shows the account active. */
  carrierConfirmed: boolean;
}

export interface DigestUpcoming {
  saleId: string;
  customer: string;
  address: string;
  plan: string;
  installDay: DayKey;
}

export interface DigestCancel {
  orderId: string;
  customer: string | null;
  address: string;
  plan: string | null;
  cancelledDay: DayKey;
  /** 'churned' = it went live and was later disconnected. */
  kind: 'cancelled' | 'churned';
}

export interface DigestNeedsDate {
  saleId: string;
  customer: string;
  address: string;
  plan: string;
  soldDay: DayKey | null;
  /** It had a date, but the install broke at the door. */
  missed: boolean;
}

export interface DigestTotal {
  count: number;
  /** Σ estPay over installs that have one; null when none do. */
  estAmount: number | null;
  /** How many installs the estimate covers (≤ count). */
  estCount: number;
}

export interface RepDigest {
  rep: DigestRep;
  week: ReportWeek;
  installed: DigestInstall[];
  total: DigestTotal;
  upcoming: DigestUpcoming[];
  cancelled: DigestCancel[];
  needsDate: DigestNeedsDate[];
  /** Needs-a-date sales past the list cap, for a "+N more" line. */
  needsDateMore: number;
}

/** A rep with a lot of undated sales gets the newest few and a pointer to the rest. */
export const NEEDS_DATE_LIMIT = 8;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/** "1234 Oak St, Dallas, TX 75201" → "1234 Oak St". */
export function shortAddress(address: string | null | undefined): string {
  const first = (text(address) ?? '').split(',')[0].trim();
  return first.length > 42 ? `${first.slice(0, 41).trimEnd()}…` : first;
}

/**
 * Stricter than expectedPayForSale on purpose. That one lets an unknown plan
 * count as $0 so a total never overstates; an email that prints "est. $0" for a
 * plan with no rate on file is inventing a number. Here any product without a
 * positive rate on file makes the whole sale unknown, and unknown is not shown.
 */
export function estimatedPayForSale(
  sale: Pick<Sale, 'products'>,
  rates: CompPlanCompanyRates | null | undefined
): number | null {
  if (!rates) return null;
  const products = sale.products || [];
  if (!products.length) return null;
  let sum = 0;
  for (const product of products) {
    const rate = rates[product.company]?.[product.productId];
    const quantity = product.quantity;
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;
    if (typeof quantity !== 'number' || !Number.isFinite(quantity) || quantity <= 0) return null;
    sum += rate * quantity;
  }
  return sum > 0 ? sum : null;
}

/** The day the carrier took the account off: cancellation, or disconnect for a churn. */
function carrierCancelDay(order: FiberOrder): DayKey | null {
  const cancelled = text(order.cancellationDate);
  const deactivated = text(order.deactivationDate);
  const raw = order.status === 'churned' ? (deactivated ?? cancelled) : (cancelled ?? deactivated);
  return raw ? installDayKey(raw) : null;
}

function bySaleIdThenDay<T extends { installDay: DayKey; saleId: string }>(a: T, b: T): number {
  return a.installDay.localeCompare(b.installDay) || a.saleId.localeCompare(b.saleId);
}

export function buildRepDigest(input: RepDigestInput): RepDigest {
  const { rep, week, rates } = input;
  const now = input.now ?? sendInstantFor(week);

  // Belt and braces: the gatherer already scopes by uid, but this is the one
  // guarantee the email makes, so it is re-asserted where the rows are built.
  const ownSales = input.sales.filter((sale) => sale.salesRepId === rep.uid);
  const ownOrders = input.orders.filter((order) => order.matchedUserId === rep.uid);

  const fiberBySale = matchFiberOrdersToSales(ownSales, ownOrders);
  const sales = applyCarrierInstallDates(ownSales, fiberBySale).filter(isTFiberSale);
  const orderFor = (sale: Sale) => fiberBySale.get(sale.id || '');
  const live = countedSales(sales, fiberBySale);

  const installed: DigestInstall[] = [];
  const upcoming: DigestUpcoming[] = [];
  const needsDate: DigestNeedsDate[] = [];

  for (const sale of live) {
    const order = orderFor(sale);
    const bucket = installBucketForSale(sale, order, now);
    const day = installDayKey(sale.installDate);
    const base = {
      saleId: sale.id || '',
      customer: text(sale.customerName) ?? 'Customer',
      address: shortAddress(sale.customerAddress),
      plan: planLabel(sale),
    };

    if (bucket === 'attention') {
      needsDate.push({
        ...base,
        soldDay: installDayKey(sale.saleDate),
        // A date that broke at the door, rather than a date nobody set.
        missed: !!day,
      });
      continue;
    }
    if (!day) continue;

    if (bucket === 'installed' && inRange(day, week.last)) {
      installed.push({
        ...base,
        installDay: day,
        estPay: estimatedPayForSale(sale, rates),
        payoutWindow: formatPayoutWindow(payoutWindowForInstall(dayKeyToLocalNoon(day))),
        carrierConfirmed: order?.status === 'active',
      });
    } else if (inRange(day, week.upcoming)) {
      upcoming.push({ ...base, installDay: day });
    }
  }

  // Carrier cancellations dated inside last week. Every carrier order is
  // T-Fiber, and one nobody logged is still this rep's customer to call back.
  const saleByOrder = new Map<FiberOrder, Sale>();
  for (const sale of ownSales) {
    const order = orderFor(sale);
    if (order) saleByOrder.set(order, sale);
  }
  const cancelled: DigestCancel[] = [];
  for (const order of ownOrders) {
    if (!isCarrierCancelled(order)) continue;
    const day = carrierCancelDay(order);
    if (!inRange(day, week.last)) continue;
    const sale = saleByOrder.get(order);
    cancelled.push({
      orderId: order.id,
      customer: text(sale?.customerName) ?? text(order.customerName) ?? text(order.loggedCustomerName),
      address: shortAddress(sale?.customerAddress ?? order.address),
      plan: sale ? planLabel(sale) : text(order.fiberPlan),
      cancelledDay: day as DayKey,
      kind: order.status === 'churned' ? 'churned' : 'cancelled',
    });
  }

  installed.sort(bySaleIdThenDay);
  upcoming.sort(bySaleIdThenDay);
  cancelled.sort((a, b) => a.cancelledDay.localeCompare(b.cancelledDay) || a.orderId.localeCompare(b.orderId));
  // Newest sale first: the freshest customer is the easiest one to get a date from.
  needsDate.sort((a, b) => (b.soldDay ?? '').localeCompare(a.soldDay ?? '') || a.saleId.localeCompare(b.saleId));

  const withEstimate = installed.filter((install) => install.estPay !== null);
  const total: DigestTotal = {
    count: installed.length,
    estAmount: withEstimate.length
      ? withEstimate.reduce((sum, install) => sum + (install.estPay as number), 0)
      : null,
    estCount: withEstimate.length,
  };

  return {
    rep,
    week,
    installed,
    total,
    upcoming,
    cancelled,
    needsDate: needsDate.slice(0, NEEDS_DATE_LIMIT),
    needsDateMore: Math.max(0, needsDate.length - NEEDS_DATE_LIMIT),
  };
}

/** Nothing to say. An empty email is never sent. */
export function isDigestEmpty(digest: RepDigest): boolean {
  return (
    digest.installed.length === 0 &&
    digest.upcoming.length === 0 &&
    digest.cancelled.length === 0 &&
    digest.needsDate.length === 0
  );
}
