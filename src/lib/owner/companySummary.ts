import type { CompPlanCompanyRates, CompPlanMargin, CompPlanRates, FiberOrder, Sale } from '@/types';
import { rateFor, resolveCompRole } from '@/types/compPlan';
import { periodBounds } from '@/lib/leaderboard/periods';
import { carrierInstallDate } from '@/lib/sales/carrierInstall';
import { buildMergedBook } from '@/lib/sales/mergeBook';

// The owner's company view: money, what needs attention, recruiting. Pure and
// framework-free — every read comes through an injected OwnerSummarySource, so
// the dashboard route and the planned Monday brief email share one set of
// numbers and the tests need no Firestore.
//
// Money is an ESTIMATE: installs × the current comp plan ("3C Receives" for
// revenue, the selling rep's own per-install rate for commission). Nothing here
// is a statement of what the carrier actually paid.
//
// Aggregates only: the output carries counts, dollars and links — never a
// customer, a rep's name, or anything from userSensitive.

// ---------------------------------------------------------------- periods

export interface Window {
  start: Date;
  end: Date;
}

export interface OwnerPeriods {
  now: Date;
  thisWeek: Window;
  lastWeek: Window;
  thisMonth: Window;
  lastMonth: Window;
}

/** Sun–Sat weeks and calendar months in America/Chicago (the leaderboard's periods). */
export function ownerPeriods(now: Date = new Date()): OwnerPeriods {
  const thisWeek = periodBounds('week', now)!;
  const thisMonth = periodBounds('month', now)!;
  return {
    now,
    thisWeek,
    lastWeek: periodBounds('week', new Date(thisWeek.start.getTime() - 1))!,
    thisMonth,
    lastMonth: periodBounds('month', new Date(thisMonth.start.getTime() - 1))!,
  };
}

/** The prior period cut at the same elapsed point as the current one ("this point last week"). */
export function sameElapsed(current: Window, prior: Window, now: Date): Window {
  const elapsed = Math.max(0, now.getTime() - current.start.getTime());
  const end = Math.min(prior.start.getTime() + elapsed, prior.end.getTime());
  return { start: prior.start, end: new Date(end) };
}

function inWindow(date: Date | null, window: Window): boolean {
  if (!date) return false;
  const time = date.getTime();
  return time >= window.start.getTime() && time < window.end.getTime();
}

function toDate(value: unknown): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

// ---------------------------------------------------------------- source

/** What a rep is paid from: their user doc's roles, nothing else. */
export interface RepRoles {
  fieldRole?: string | null;
  role?: string | null;
}

export interface CompPlanTables {
  rates: Partial<CompPlanRates>;
  /** "3C Receives" per company/plan. Owner-only. */
  margin: CompPlanMargin;
}

/** A user doc as the recruiting count needs it (activation stamp only). */
export interface ActivatedUser {
  status?: string | null;
  fieldRole?: string | null;
  hireDate: Date | null;
}

export type OpenQueue = 'payrollDisputes' | 'expediteOrders' | 'leadsRequests' | 'bugReports';

/** Everything the summary reads. The Firestore adapter lives in firestoreSource.ts. */
export interface OwnerSummarySource {
  /** Every sale since the portal started logging, without customer PII, plus every carrier order. */
  loadBook(): Promise<{ sales: Sale[]; orders: FiberOrder[] }>;
  loadCompPlan(): Promise<CompPlanTables>;
  loadRepRoles(repIds: string[]): Promise<Map<string, RepRoles>>;
  /** Form submissions still marked 'new'. */
  countOpen(queue: OpenQueue): Promise<number>;
  /** Self-signups waiting on a role (status pending, no field role, not flagged as a bot). */
  countPendingSignups(): Promise<number>;
  /** Open or claimed 'stalled_rep' alert tasks (raised after 72h without onboarding progress). */
  countStalledOnboarding(): Promise<number>;
  countCreated(collection: 'applications' | 'managerInterviews', window: Window): Promise<number>;
  loadActivatedSince(since: Date): Promise<ActivatedUser[]>;
}

// ---------------------------------------------------------------- book

export interface InstallRecord {
  saleId: string;
  repId: string;
  installDate: Date;
  sale: Sale;
}

export interface CompanyBook {
  /** Counted sales that have installed, dated by the carrier's activation when it has one. */
  installs: InstallRecord[];
  /** Counted sales with no install date at all. */
  missingInstallDate: number;
  /** Carrier orders with no portal sale ("Not logged" on the Sales board). */
  notLogged: number;
  orders: FiberOrder[];
}

/** Joins sales to carrier orders exactly as the admin Sales board does (buildMergedBook). */
export function companyBook(sales: Sale[], orders: FiberOrder[], now: Date): CompanyBook {
  const book = buildMergedBook(sales, orders, { now });
  const installs: InstallRecord[] = [];
  let missingInstallDate = 0;

  for (const row of book.rows) {
    if (!row.sale || !row.counted) continue;
    const sale = row.sale;
    const carrierDate = carrierInstallDate(row.order);
    const installDate = carrierDate ?? toDate(sale.installDate);
    if (!sale.installDate && !carrierDate) {
      missingInstallDate += 1;
      continue;
    }
    if (row.bucket !== 'installed' || !installDate || installDate.getTime() > now.getTime()) continue;
    installs.push({ saleId: row.key, repId: sale.salesRepId, installDate, sale });
  }

  return { installs, missingInstallDate, notLogged: book.notLoggedCount, orders };
}

// ---------------------------------------------------------------- money

export interface MoneyFigures {
  installs: number;
  revenue: number;
  commissions: number;
  margin: number;
}

export interface MoneyComparison {
  current: MoneyFigures;
  /** The prior period to the same elapsed point. */
  prior: MoneyFigures;
  /** Where that prior cut ends (ISO), e.g. Aug 22 noon when today is Sep 22 noon. */
  priorEnd: string;
}

export interface MoneySummary {
  week: MoneyComparison;
  month: MoneyComparison;
  /** Installs in either window whose product has no "3C Receives" rate yet (counted at $0 revenue). */
  unpricedInstalls: number;
  /** Installs in either window whose rep resolves to no pay plan (counted at $0 commission). */
  unratedInstalls: number;
}

function sumProducts(sale: Sale, rateOf: (company: string, planId: string) => number): number {
  return (sale.products || []).reduce((sum, product) => {
    const quantity = typeof product.quantity === 'number' && Number.isFinite(product.quantity) ? product.quantity : 0;
    return sum + rateOf(product.company, product.productId) * quantity;
  }, 0);
}

function companyRate(table: CompPlanCompanyRates, company: string, planId: string): number {
  const value = table[company]?.[planId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export interface PricedInstall extends InstallRecord {
  revenue: number;
  commission: number;
  hasRepPlan: boolean;
}

export function priceInstalls(
  installs: InstallRecord[],
  plan: CompPlanTables,
  roles: Map<string, RepRoles>
): PricedInstall[] {
  return installs.map((install) => {
    const rep = roles.get(install.repId);
    const compRole = rep ? resolveCompRole(rep.fieldRole, rep.role) : null;
    return {
      ...install,
      revenue: sumProducts(install.sale, (company, planId) => companyRate(plan.margin, company, planId)),
      commission: compRole
        ? sumProducts(install.sale, (company, planId) => rateFor(plan.rates, compRole, company, planId))
        : 0,
      hasRepPlan: compRole !== null,
    };
  });
}

function figuresIn(priced: PricedInstall[], window: Window): MoneyFigures {
  const figures: MoneyFigures = { installs: 0, revenue: 0, commissions: 0, margin: 0 };
  for (const install of priced) {
    if (!inWindow(install.installDate, window)) continue;
    figures.installs += 1;
    figures.revenue += install.revenue;
    figures.commissions += install.commission;
  }
  figures.revenue = Math.round(figures.revenue);
  figures.commissions = Math.round(figures.commissions);
  figures.margin = figures.revenue - figures.commissions;
  return figures;
}

/** The earliest moment any money window reaches back to. */
export function moneyHorizon(periods: OwnerPeriods): Date {
  return new Date(Math.min(periods.lastWeek.start.getTime(), periods.lastMonth.start.getTime()));
}

export function summarizeMoney(priced: PricedInstall[], periods: OwnerPeriods): MoneySummary {
  const { now, thisWeek, lastWeek, thisMonth, lastMonth } = periods;
  const weekNow = { start: thisWeek.start, end: now };
  const monthNow = { start: thisMonth.start, end: now };
  const horizon = { start: moneyHorizon(periods), end: now };
  const inScope = priced.filter((install) => inWindow(install.installDate, horizon));
  const current = inScope.filter(
    (install) => inWindow(install.installDate, weekNow) || inWindow(install.installDate, monthNow)
  );

  const weekPrior = sameElapsed(thisWeek, lastWeek, now);
  const monthPrior = sameElapsed(thisMonth, lastMonth, now);
  return {
    week: {
      current: figuresIn(inScope, weekNow),
      prior: figuresIn(inScope, weekPrior),
      priorEnd: weekPrior.end.toISOString(),
    },
    month: {
      current: figuresIn(inScope, monthNow),
      prior: figuresIn(inScope, monthPrior),
      priorEnd: monthPrior.end.toISOString(),
    },
    unpricedInstalls: current.filter((install) => install.revenue === 0).length,
    unratedInstalls: current.filter((install) => !install.hasRepPlan || install.commission === 0).length,
  };
}

// ---------------------------------------------------------------- problems

export type ProblemKey =
  | 'carrierCancellations'
  | 'notLogged'
  | 'payrollDisputes'
  | 'stalledOnboarding'
  | 'pendingSignups'
  | 'missingInstallDate'
  | 'expediteOrders'
  | 'leadsRequests'
  | 'bugReports';

export interface ProblemRow {
  key: ProblemKey;
  count: number;
  /** The page that handles it. */
  href: string;
}

/** Display order: money at risk first, then people, then requests. */
export const PROBLEM_HREFS: Record<ProblemKey, string> = {
  carrierCancellations: '/portal/sales',
  notLogged: '/portal/sales',
  payrollDisputes: '/portal/admin/payroll-disputes',
  stalledOnboarding: '/portal/admin/onboarding',
  pendingSignups: '/portal/admin/users',
  missingInstallDate: '/portal/sales',
  expediteOrders: '/portal/admin/expedite-orders',
  leadsRequests: '/portal/admin/leads-requests',
  bugReports: '/portal/admin/bug-reports',
};

const DATE_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Chicago',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** yyyy-mm-dd in Chicago, the format the carrier report dates arrive in. */
export function chicagoDayKey(date: Date): string {
  return DATE_KEY.format(date);
}

/**
 * Carrier cancellations dated inside the window: 'cancelled' orders by their
 * cancellation date, 'churned' orders by their deactivation date. An order the
 * report gives no date for is not counted (it cannot be placed in a week).
 */
export function carrierCancellationsIn(orders: FiberOrder[], window: Window): number {
  const from = chicagoDayKey(window.start);
  const to = chicagoDayKey(new Date(window.end.getTime() - 1));
  return orders.filter((order) => {
    const day =
      order.status === 'cancelled' ? order.cancellationDate : order.status === 'churned' ? order.deactivationDate : null;
    return !!day && day >= from && day <= to;
  }).length;
}

export function problemRows(counts: Record<ProblemKey, number>): ProblemRow[] {
  return (Object.keys(PROBLEM_HREFS) as ProblemKey[]).map((key) => ({
    key,
    count: counts[key],
    href: PROBLEM_HREFS[key],
  }));
}

// ---------------------------------------------------------------- recruiting

export interface WeekCount {
  thisWeek: number;
  lastWeek: number;
}

export interface RecruitingSummary {
  applications: WeekCount;
  interviews: WeekCount;
  activations: WeekCount;
  firstInstalls: WeekCount;
}

/** Reps whose first-ever install lands in each week. */
export function firstInstallsByWeek(installs: InstallRecord[], periods: OwnerPeriods): WeekCount {
  const first = new Map<string, number>();
  for (const install of installs) {
    if (!install.repId) continue;
    const time = install.installDate.getTime();
    const seen = first.get(install.repId);
    if (seen === undefined || time < seen) first.set(install.repId, time);
  }
  const counts: WeekCount = { thisWeek: 0, lastWeek: 0 };
  for (const time of first.values()) {
    const date = new Date(time);
    if (inWindow(date, periods.thisWeek)) counts.thisWeek += 1;
    else if (inWindow(date, periods.lastWeek)) counts.lastWeek += 1;
  }
  return counts;
}

/** Active field reps whose activation (hireDate) lands in each week. */
export function activationsByWeek(users: ActivatedUser[], periods: OwnerPeriods): WeekCount {
  const counts: WeekCount = { thisWeek: 0, lastWeek: 0 };
  for (const user of users) {
    if (user.status !== 'active' || !user.fieldRole) continue;
    if (inWindow(user.hireDate, periods.thisWeek)) counts.thisWeek += 1;
    else if (inWindow(user.hireDate, periods.lastWeek)) counts.lastWeek += 1;
  }
  return counts;
}

// ---------------------------------------------------------------- assembly

export type OwnerSection = 'money' | 'problems' | 'recruiting';

export const OWNER_SECTIONS: readonly OwnerSection[] = ['money', 'problems', 'recruiting'];

export async function buildMoney(source: OwnerSummarySource, periods: OwnerPeriods): Promise<MoneySummary> {
  const [{ sales, orders }, plan] = await Promise.all([source.loadBook(), source.loadCompPlan()]);
  const book = companyBook(sales, orders, periods.now);
  const horizon = moneyHorizon(periods);
  const recent = book.installs.filter((install) => install.installDate.getTime() >= horizon.getTime());
  const repIds = [...new Set(recent.map((install) => install.repId).filter(Boolean))];
  const roles = await source.loadRepRoles(repIds);
  return summarizeMoney(priceInstalls(recent, plan, roles), periods);
}

export async function buildProblems(source: OwnerSummarySource, periods: OwnerPeriods): Promise<ProblemRow[]> {
  const [bookData, payrollDisputes, expediteOrders, leadsRequests, bugReports, pendingSignups, stalledOnboarding] =
    await Promise.all([
      source.loadBook(),
      source.countOpen('payrollDisputes'),
      source.countOpen('expediteOrders'),
      source.countOpen('leadsRequests'),
      source.countOpen('bugReports'),
      source.countPendingSignups(),
      source.countStalledOnboarding(),
    ]);
  const book = companyBook(bookData.sales, bookData.orders, periods.now);
  return problemRows({
    carrierCancellations: carrierCancellationsIn(book.orders, { start: periods.thisWeek.start, end: periods.now }),
    notLogged: book.notLogged,
    payrollDisputes,
    stalledOnboarding,
    pendingSignups,
    missingInstallDate: book.missingInstallDate,
    expediteOrders,
    leadsRequests,
    bugReports,
  });
}

export async function buildRecruiting(
  source: OwnerSummarySource,
  periods: OwnerPeriods
): Promise<RecruitingSummary> {
  const thisWeek = { start: periods.thisWeek.start, end: periods.thisWeek.end };
  const [appsNow, appsBefore, interviewsNow, interviewsBefore, activated, bookData] = await Promise.all([
    source.countCreated('applications', thisWeek),
    source.countCreated('applications', periods.lastWeek),
    source.countCreated('managerInterviews', thisWeek),
    source.countCreated('managerInterviews', periods.lastWeek),
    source.loadActivatedSince(periods.lastWeek.start),
    source.loadBook(),
  ]);
  const book = companyBook(bookData.sales, bookData.orders, periods.now);
  return {
    applications: { thisWeek: appsNow, lastWeek: appsBefore },
    interviews: { thisWeek: interviewsNow, lastWeek: interviewsBefore },
    activations: activationsByWeek(activated, periods),
    firstInstalls: firstInstallsByWeek(book.installs, periods),
  };
}

export interface OwnerSummary {
  generatedAt: string;
  money?: MoneySummary;
  problems?: ProblemRow[];
  recruiting?: RecruitingSummary;
}

/** One or more sections. The dashboard asks for one at a time; the Monday brief asks for all three. */
export async function buildOwnerSummary(
  source: OwnerSummarySource,
  sections: readonly OwnerSection[] = OWNER_SECTIONS,
  now: Date = new Date()
): Promise<OwnerSummary> {
  const periods = ownerPeriods(now);
  const summary: OwnerSummary = { generatedAt: now.toISOString() };
  await Promise.all(
    sections.map(async (section) => {
      if (section === 'money') summary.money = await buildMoney(source, periods);
      else if (section === 'problems') summary.problems = await buildProblems(source, periods);
      else summary.recruiting = await buildRecruiting(source, periods);
    })
  );
  return summary;
}
