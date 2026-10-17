'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Plus, RotateCw, X } from 'lucide-react';
import { MonthPicker } from '@/components/portal/rep/MonthPicker';
import { CarrierNotice } from '@/components/portal/rep/CarrierNotice';
import { PayHelpSheet } from '@/components/portal/rep/PayHelpSheet';
import { RepShell } from '@/components/portal/rep/RepShell';
import { LOG_SALE_HREF } from '@/components/portal/rep/repNav';
import { AdminSalesBoard } from '@/components/sales/AdminSalesBoard';
import { InstallStatusSection } from '@/components/sales/InstallStatusSection';
import { SalesTable, SalesViewTabs } from '@/components/sales/SalesTable';
import { useSales } from '@/hooks/useSales';
import { useCompPlan } from '@/hooks/useCompPlan';
import { useFiberStatus } from '@/hooks/useFiberStatus';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { useAuth } from '@/contexts/AuthContext';
import { isOwner } from '@/types';
import { datedSales, undatedSales } from '@/lib/pay/payGroups';
import { isTFiberSale, payoutsInMonth } from '@/lib/pay/payoutWindow';
import { countedSales } from '@/lib/sales/installBucket';
import { monthFromParam, salesPageSearch } from '@/lib/sales/loggedSale';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import {
  clampMonth,
  currentMonth,
  latestPickableMonth,
  monthLabel,
  salesSoldIn,
  type MonthKey,
} from '@/lib/sales/monthWindow';
import { PayoutCard } from './PayoutCard';
import { cacheTimeLabel } from '@/lib/cache/dataCache';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';
import p from '@/components/portal/rep/rep-page.module.css';

function PageHead({
  month,
  max,
  onMonth,
}: {
  month?: MonthKey;
  /** Latest pickable month; defaults to this month. */
  max?: MonthKey;
  onMonth?: (next: MonthKey) => void;
}) {
  return (
    <header className={`${p.head} ${x.salesHead}`}>
      <h1 className={`${p.title} ${x.salesTitle}`}>Sales</h1>
      {month && onMonth ? <MonthPicker month={month} max={max ?? currentMonth()} onChange={onMonth} /> : null}
    </header>
  );
}

function SalesSkeleton({ label = 'Loading sales' }: { label?: string }) {
  return (
    <div className={x.page} aria-busy="true" aria-label={label}>
      <section className={s.panel}>
        <div className={x.skelBody}>
          <span className={`${s.skel} ${x.skelLine}`} />
          <span className={`${s.skel} ${x.skelKpi}`} />
        </div>
      </section>
      <section className={s.panel}>
        <div className={x.skelBody}>
          <span className={`${s.skel} ${x.skelLine}`} />
          {[1, 2, 3, 4].map((item) => (
            <span key={item} className={`${s.skel} ${x.skelRow}`} />
          ))}
        </div>
      </section>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <section className={s.panel} aria-label="Sales">
      <div className={s.failed} role="alert">
        <span>Couldn&apos;t load your sales</span>
        <button type="button" className={s.retry} onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" />
          Retry
        </button>
      </div>
    </section>
  );
}

/** "Sale logged · Carla Diaz": Log Sale lands here, on the sale's month. */
function LoggedBanner({ name, onDismiss }: { name: string | null; onDismiss: () => void }) {
  return (
    <div className={x.logged} role="status">
      <CheckCircle2 size={20} strokeWidth={2.25} aria-hidden="true" className={x.loggedIcon} />
      <p className={x.loggedText}>
        <strong>Sale logged</strong>
        {name ? <> · {name}</> : null}
      </p>
      <button type="button" className={x.loggedClose} onClick={onDismiss} aria-label="Dismiss">
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}

function SalesContent() {
  const { user, hasPermission, isRole } = useAuth();
  const params = useSearchParams();

  // Admins and owners read the whole company book; everyone else reads their own.
  // This replaced sales:approve, which used to carry the visibility switch as a
  // side effect of the approval permission.
  const canViewAll = hasPermission('sales:read:all');
  const salesFilters = useMemo(() => {
    if (!user) return null;
    // Both books are fetched WHOLE and sliced by month in the browser.
    //
    // A rep's pay list is keyed on the INSTALL date, so a month-bounded fetch on
    // saleDate would drop a sale sold in August that installs in September —
    // money they are actually owed.
    //
    // Management's book is merged against the carrier report, which arrives
    // all-time. A month-bounded fetch made the two feeds asymmetric: a sale
    // whose saleDate sat outside the picked month left its carrier order with
    // nothing to join to, and the order rendered red as "never logged" — the
    // board accusing somebody of not logging a sale they had logged. The month
    // is applied to the merged book instead, where both sides see it.
    return canViewAll ? { limit: 500 } : { limit: 500, salesRepId: user.uid };
  }, [canViewAll, user]);
  // A revisit shows the last copy of the book at once and refreshes it in the
  // background. Not straight after Log Sale: the new sale must be in the list
  // the banner names, so that lands on a fresh read as before.
  const {
    sales: loggedSales,
    truncated,
    loading,
    error,
    fetchSales,
    deleteSale,
    setSaleCancelled,
    seeded,
  } = useSales(params.get('logged') ? null : salesFilters);
  const fiber = useFiberStatus();
  const canLog = hasPermission('sales:write');
  // The status API answers scope 'all' to admins and owners. Until it answers —
  // or when the first load fails — the role stands in, so Install status shows
  // its loading state and Retry rather than vanishing.
  const adminView = isRole('admin');
  const showInstallStatus = fiber.data ? fiber.data.scope === 'all' : adminView;

  // `?view=pay` opens the rep's pay list directly.
  const [payView, setPayView] = useState(() => params.get('view') === 'pay');
  // `?month=YYYY-MM` opens on that month: Log Sale sends the month the sale was
  // sold in (a backdated sale is not in this month) with `logged=<id>` to
  // confirm it by name, and the page keeps its own month there (below).
  const [month, setMonth] = useState<MonthKey>(
    () =>
      monthFromParam(params.get('month'), new Date(), latestPickableMonth(params.get('view') === 'pay')) ??
      currentMonth()
  );
  const [loggedId, setLoggedId] = useState(() => params.get('logged'));
  useEffect(() => {
    // The month and view live in the URL (replaced, not pushed), so Back from a
    // sale or a reload reopens the same month; `logged` is consumed so the same
    // sale is never confirmed again.
    const url = new URL(window.location.href);
    const search = salesPageSearch(url.search, { month, payView });
    if (search === url.search) return;
    window.history.replaceState(window.history.state, '', `${url.pathname}${search}${url.hash}`);
  }, [month, payView]);
  // The pay list may look a month ahead for scheduled installs; the ledger
  // (what was sold) may not, so leaving Pay pulls a future month back.
  const maxMonth = latestPickableMonth(payView);
  const choosePayView = useCallback((pay: boolean) => {
    setPayView(pay);
    setMonth((current) => clampMonth(current, latestPickableMonth(pay)));
  }, []);
  // useSales starts idle (loading false, no sales). Until the first fetch
  // settles the page shows skeletons, never a zero it has not measured.
  const [fetched, setFetched] = useState(seeded);
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const {
    rates,
    payDelayDays,
    hasPlan,
    compRole,
    loading: planLoading,
    error: planError,
    retry: retryPlan,
    ownerPricing,
  } = useCompPlan();
  const payPlan = useMemo(
    () => ({ rates, payDelayDays, hasPlan, compRole, error: planError, onRetry: retryPlan }),
    [compRole, hasPlan, payDelayDays, planError, rates, retryPlan]
  );

  const refreshSales = useCallback(() => {
    if (!salesFilters) return;
    void fetchSales(salesFilters).finally(() => setFetched(true));
  }, [fetchSales, salesFilters]);

  const showedCached = useRef(seeded);
  useEffect(() => {
    if (showedCached.current && salesFilters) {
      showedCached.current = false;
      void fetchSales(salesFilters, { background: true });
      return;
    }
    refreshSales();
  }, [fetchSales, refreshSales, salesFilters]);

  // Reopened after a while: reload the book and the carrier report in place,
  // keeping the list on screen (and on a failure, keeping it as it was).
  const { refetch: refetchFiber } = fiber;
  const refreshQuietly = useCallback(() => {
    if (!salesFilters) return;
    return Promise.all([fetchSales(salesFilters, { quiet: true }), refetchFiber().catch(() => undefined)]);
  }, [fetchSales, refetchFiber, salesFilters]);
  useRefreshOnResume(refreshQuietly, { enabled: !!salesFilters });

  // The Value and Sales KPIs follow the month picker rather than always reading
  // "this month", so the figures and the list underneath can never describe
  // different months; Est. payout names its own pay period instead.
  // Every KPI here counts MONEY, so a cancelled customer leaves all three —
  // including one the carrier cancelled (Jacob 2026-09-10). The sale itself
  // stays in the list underneath, marked, because it is still the paper trail.
  const fiberBySale = useMemo(
    () => matchFiberOrdersToSales(loggedSales, fiber.data?.orders ?? []),
    [fiber.data?.orders, loggedSales]
  );
  // The carrier's activation date wins over the install date the rep typed
  // (Jacob 2026-09-14). Applied once here so the KPIs, the ledger, the pay
  // list and the board all see one install date — see carrierInstall.ts.
  const sales = useMemo(
    () => applyCarrierInstallDates(loggedSales, fiberBySale),
    [fiberBySale, loggedSales]
  );
  const mtdSales = useMemo(() => salesSoldIn(sales, month), [month, sales]);
  const payableMtd = useMemo(
    () => countedSales(mtdSales, fiberBySale),
    [fiberBySale, mtdSales]
  );
  // Est. pay is PAY-PERIOD based (owner, 2026-09-22): T-Fiber payout windows,
  // live from each sale's current install date (carrier moves applied above) —
  // scheduled installs included, cancelled ones out. The card steps through the
  // windows that PAY in the picked month (owner, 2026-10-13), filled from sales
  // of any month, and opens on the next one not yet over.
  const monthPayouts = useMemo(
    () => payoutsInMonth(datedSales(sales, fiberBySale), hasPlan ? rates : null, month),
    [fiberBySale, hasPlan, month, rates, sales]
  );
  // T-Fiber sales with no install date have no window yet; the card says so.
  const undatedTFiber = useMemo(
    () => undatedSales(sales, fiberBySale).filter(isTFiberSale).length,
    [fiberBySale, sales]
  );

  const booting = !fetched || (loading && sales.length === 0);
  const failed = !!error && sales.length === 0;
  const loggedSale = loggedId ? sales.find((sale) => sale.id === loggedId) : undefined;
  const loggedBanner =
    loggedId && !booting ? (
      <LoggedBanner
        name={loggedSale ? loggedSale.customerName || loggedSale.customerAddress || null : null}
        onDismiss={() => setLoggedId(null)}
      />
    ) : null;
  const staleNote = error ? (
    <p className={x.alert} role="alert">
      Couldn&apos;t refresh just now. What you see may be out of date.
    </p>
  ) : fiber.staleAt !== null ? (
    // The carrier report shown is a cached copy whose refresh failed.
    <p className={x.alert} role="status">
      Couldn&apos;t refresh the carrier report · as of {cacheTimeLabel(fiber.staleAt)}
    </p>
  ) : null;

  if (canViewAll) {
    return (
      <div className={x.page}>
        <PageHead month={month} onMonth={setMonth} />
        {loggedBanner}
        {booting ? (
          <SalesSkeleton label="Loading the company book" />
        ) : failed ? (
          <LoadFailed onRetry={refreshSales} />
        ) : (
          <>
            {staleNote}
            <div className={`${x.mgmt} ${showInstallStatus ? '' : x.mgmtSolo}`}>
              <AdminSalesBoard
                sales={sales}
                month={month}
                truncated={truncated}
                loading={loading}
                onDelete={deleteSale}
                onSetCancelled={setSaleCancelled}
                fiber={fiber}
                payPlan={payPlan}
                ownerPricing={ownerPricing}
                onSaleUpdated={refreshSales}
              />

              {/* The carrier report from the morning email — Pending
                  install / Active / Cancelled-Churned / Attention. It is a
                  DIFFERENT feed from the board: the board is what reps
                  logged, this is what the carrier says actually happened, so
                  management needs both. It is not month-scoped; the picker
                  only moves the board. */}
              {showInstallStatus && (
                <InstallStatusSection
                  fiber={fiber}
                  sales={sales}
                  ownerView={isOwner(user?.role)}
                  viewerId={user?.uid ?? null}
                  adminView={adminView}
                />
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  const monthName = monthLabel(month);

  return (
    <div className={x.page}>
      <PageHead
        month={month}
        max={maxMonth}
        onMonth={booting || failed || sales.length === 0 ? undefined : setMonth}
      />
      {loggedBanner}

      {booting ? (
        <SalesSkeleton />
      ) : failed ? (
        <LoadFailed onRetry={refreshSales} />
      ) : sales.length === 0 ? (
        <section className={`${s.panel} ${x.welcome}`} aria-labelledby="sales-empty-h">
          <h2 id="sales-empty-h" className={x.welcomeTitle}>
            No sales yet.
          </h2>
          {canLog ? (
            <Link href={LOG_SALE_HREF} className={s.btnPrimary}>
              <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
              Log your first sale
            </Link>
          ) : null}
        </section>
      ) : (
        <>
          <SalesViewTabs payView={payView} onChange={choosePayView} />
          {staleNote}
          {/* Without the carrier report, carrier cancellations and missed
              installs still count as money: say so, keep the numbers. */}
          {fiber.error ? (
            <CarrierNotice
              onRetry={() => void fiber.refetch().catch(() => undefined)}
              retrying={fiber.refreshing}
            />
          ) : null}

          {/* C · Split: the raised money card holds the pay; the ledger beside
              (desktop) or under it (phone) holds the record. */}
          <div className={x.split}>
            <PayoutCard
              payouts={monthPayouts}
              resetKey={`${month.year}-${month.month}`}
              undatedCount={undatedTFiber}
              saleCount={payableMtd.length}
              monthName={monthName}
              hasPlan={hasPlan}
              planLoading={planLoading}
              planError={!!planError}
              onRetryPlan={retryPlan}
              onHelp={() => setHelpOpen(true)}
            />

            <div className={x.ledgerCol}>
              {fiber.data?.scope === 'all' && <InstallStatusSection fiber={fiber} />}

              <SalesTable
                sales={sales}
                month={month}
                onDelete={deleteSale}
                loading={loading}
                payView={payView}
                payPlan={payPlan}
                fiber={fiber}
                onSaleUpdated={refreshSales}
                arriveId={loggedId}
              />
            </div>
          </div>
        </>
      )}
      {helpOpen ? <PayHelpSheet onClose={closeHelp} /> : null}
    </div>
  );
}

export default function SalesPage() {
  return (
    <RepShell permissions={['sales:read']}>
      <Suspense fallback={<SalesSkeleton />}>
        <SalesContent />
      </Suspense>
    </RepShell>
  );
}
