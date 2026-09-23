'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, RotateCw } from 'lucide-react';
import { CarrierNotice } from '@/components/portal/rep/CarrierNotice';
import { RepShell } from '@/components/portal/rep/RepShell';
import { LOG_SALE_HREF } from '@/components/portal/rep/repNav';
import { AdminSalesBoard } from '@/components/sales/AdminSalesBoard';
import { InstallStatusSection } from '@/components/sales/InstallStatusSection';
import { SalesTable } from '@/components/sales/SalesTable';
import { useSales } from '@/hooks/useSales';
import { useCompPlan } from '@/hooks/useCompPlan';
import { useFiberStatus } from '@/hooks/useFiberStatus';
import { useAuth } from '@/contexts/AuthContext';
import { isOwner } from '@/types';
import { datedSales } from '@/lib/pay/payGroups';
import { formatPayoutWindow, nextPayout } from '@/lib/pay/payoutWindow';
import { countedSales } from '@/lib/sales/installBucket';
import { applyCarrierInstallDates } from '@/lib/sales/carrierInstall';
import { matchFiberOrdersToSales } from '@/lib/fiberReport/matchSales';
import {
  currentMonth,
  isCurrentMonth,
  monthLabel,
  salesSoldIn,
  shiftMonth,
  type MonthKey,
} from '@/lib/sales/monthWindow';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function MonthPicker({ month, onChange }: { month: MonthKey; onChange: (next: MonthKey) => void }) {
  return (
    <div className={x.month} role="group" aria-label="Month">
      <button
        type="button"
        className={x.monthBtn}
        onClick={() => onChange(shiftMonth(month, -1))}
        aria-label="Previous month"
      >
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span className={x.monthLabel} aria-live="polite">
        {monthLabel(month)}
      </span>
      <button
        type="button"
        className={x.monthBtn}
        onClick={() => onChange(shiftMonth(month, 1))}
        disabled={isCurrentMonth(month)}
        aria-label="Next month"
      >
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

function PageHead({ month, onMonth }: { month?: MonthKey; onMonth?: (next: MonthKey) => void }) {
  return (
    <header className={x.head}>
      <h1 className={x.title}>Sales</h1>
      {month && onMonth ? <MonthPicker month={month} onChange={onMonth} /> : null}
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

function SalesContent() {
  const { user, hasPermission } = useAuth();
  const params = useSearchParams();
  const { sales: loggedSales, truncated, loading, error, fetchSales, deleteSale, setSaleCancelled } = useSales();
  const fiber = useFiberStatus();

  // Admins and owners read the whole company book; everyone else reads their own.
  // This replaced sales:approve, which used to carry the visibility switch as a
  // side effect of the approval permission.
  const canViewAll = hasPermission('sales:read:all');
  const canLog = hasPermission('sales:write');

  // `?view=pay` opens the rep's pay list directly.
  const [payView, setPayView] = useState(() => params.get('view') === 'pay');
  const [month, setMonth] = useState<MonthKey>(() => currentMonth());
  // useSales starts idle (loading false, no sales). Until the first fetch
  // settles the page shows skeletons, never a zero it has not measured.
  const [fetched, setFetched] = useState(false);
  const { rates, payDelayDays, hasPlan, compRole, loading: planLoading } = useCompPlan();
  const payPlan = useMemo(
    () => ({ rates, payDelayDays, hasPlan, compRole }),
    [compRole, hasPlan, payDelayDays, rates]
  );

  const refreshSales = useCallback(() => {
    if (!user) return;
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
    const filters: { salesRepId?: string; limit?: number } =
      canViewAll ? { limit: 500 } : { limit: 500, salesRepId: user.uid };
    void fetchSales(filters).finally(() => setFetched(true));
  }, [canViewAll, fetchSales, user]);

  useEffect(() => {
    refreshSales();
  }, [refreshSales]);

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
  // Est. pay is PAY-PERIOD based (owner, 2026-09-22): the next T-Fiber payout
  // window, live from each sale's current install date — scheduled installs
  // included. It is "now", not the picked month; the window says which period.
  const upcoming = useMemo(
    () => nextPayout(datedSales(sales, fiberBySale), hasPlan ? rates : null),
    [fiberBySale, hasPlan, rates, sales]
  );
  const boardValue = payableMtd.reduce((sum, sale) => sum + (sale.totalValue || 0), 0);

  const booting = !fetched || (loading && sales.length === 0);
  const failed = !!error && sales.length === 0;
  const staleNote = error ? (
    <p className={x.alert} role="alert">
      Couldn&apos;t refresh just now. What you see may be out of date.
    </p>
  ) : null;

  if (canViewAll) {
    return (
      <div className={x.page}>
        <PageHead month={month} onMonth={setMonth} />
        {booting ? (
          <SalesSkeleton label="Loading the company book" />
        ) : failed ? (
          <LoadFailed onRetry={refreshSales} />
        ) : (
          <>
            {staleNote}
            <div className={`${x.mgmt} ${fiber.data?.scope === 'all' ? '' : x.mgmtSolo}`}>
              <AdminSalesBoard
                sales={sales}
                month={month}
                truncated={truncated}
                loading={loading}
                onDelete={deleteSale}
                onSetCancelled={setSaleCancelled}
                fiber={fiber}
                payPlan={payPlan}
                onSaleUpdated={refreshSales}
              />

              {/* The carrier report from the morning email — Pending
                  install / Active / Cancelled-Churned / Attention. It is a
                  DIFFERENT feed from the board: the board is what reps
                  logged, this is what the carrier says actually happened, so
                  management needs both. It is not month-scoped; the picker
                  only moves the board. */}
              {fiber.data?.scope === 'all' && (
                <InstallStatusSection
                  fiber={fiber}
                  sales={sales}
                  ownerView={isOwner(user?.role)}
                  viewerId={user?.uid ?? null}
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
      <PageHead month={month} onMonth={booting || failed || sales.length === 0 ? undefined : setMonth} />

      {booting ? (
        <SalesSkeleton />
      ) : failed ? (
        <LoadFailed onRetry={refreshSales} />
      ) : sales.length === 0 ? (
        <section className={`${s.panel} ${x.welcome}`} aria-labelledby="sales-empty-h">
          <p className={s.kicker}>Your sales</p>
          <h2 id="sales-empty-h" className={x.welcomeTitle}>
            No sales yet
          </h2>
          <p className={x.welcomeText}>
            Log your first sale and it shows up here with its install status and estimated pay.
          </p>
          {canLog ? (
            <Link href={LOG_SALE_HREF} className={s.btnPrimary}>
              <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
              Log your first sale
            </Link>
          ) : null}
        </section>
      ) : (
        <>
          {staleNote}
          {/* Without the carrier report, carrier cancellations and missed
              installs still count as money: say so, keep the numbers. */}
          {fiber.error ? (
            <CarrierNotice
              onRetry={() => void fiber.refetch().catch(() => undefined)}
              retrying={fiber.refreshing}
            />
          ) : null}

          <section className={`${s.panel} ${x.kpis}`} aria-label="Sales summary">
            <div className={`${x.kpi} ${x.kpiValue}`}>
              <p className={`${s.kicker} ${x.kpiLabel}`}>Value</p>
              <p className={x.kpiNum}>
                {money(boardValue)}
                <span className={x.kpiUnit}>/ mo</span>
              </p>
              <p className={x.kpiNote}>
                <b>{payableMtd.length}</b> {payableMtd.length === 1 ? 'record' : 'records'} in {monthName}
              </p>
            </div>
            <div className={`${x.kpi} ${x.kpiCount}`}>
              <p className={`${s.kicker} ${x.kpiLabel}`}>Sales</p>
              <p className={x.kpiNum}>
                {payableMtd.length}
                <span className={x.kpiUnit}>{payableMtd.length === 1 ? 'sale' : 'sales'}</span>
              </p>
              <p className={x.kpiNote}>
                <b>{sales.length}</b> on your board all time
              </p>
            </div>
            <div className={`${x.kpi} ${x.kpiPay}`}>
              <p className={`${s.kicker} ${x.kpiLabel}`}>
                Est. payout{upcoming ? ` · ${formatPayoutWindow(upcoming.window)}` : ''}
              </p>
              {planLoading ? (
                <span className={`${s.skel} ${x.skelKpi}`} aria-label="Loading estimated pay" />
              ) : !hasPlan ? (
                <>
                  <p className={`${x.kpiNum} ${x.kpiDash}`}>—</p>
                  <p className={x.kpiNote}>No pay plan assigned yet</p>
                </>
              ) : upcoming ? (
                <>
                  <p className={x.kpiNum}>
                    <span className={x.est}>est.</span>
                    {money(upcoming.amount ?? 0)}
                  </p>
                  <p className={x.kpiNote}>
                    <b>{upcoming.count}</b> T-Fiber {upcoming.count === 1 ? 'install' : 'installs'}
                    {upcoming.scheduled > 0 ? <> · {upcoming.scheduled} scheduled</> : null} · before chargebacks
                  </p>
                </>
              ) : (
                <>
                  <p className={`${x.kpiNum} ${x.kpiDash}`}>—</p>
                  <p className={x.kpiNote}>No T-Fiber payout window coming up</p>
                </>
              )}
            </div>
          </section>

          {fiber.data?.scope === 'all' && <InstallStatusSection fiber={fiber} />}

          <SalesTable
            sales={sales}
            month={month}
            onDelete={deleteSale}
            loading={loading}
            payView={payView}
            onPayViewChange={setPayView}
            payPlan={payPlan}
            fiber={fiber}
            onSaleUpdated={refreshSales}
          />
        </>
      )}
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
