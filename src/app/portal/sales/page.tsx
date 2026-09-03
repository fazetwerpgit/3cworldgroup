'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { AdminSalesBoard } from '@/components/sales/AdminSalesBoard';
import { InstallStatusSection } from '@/components/sales/InstallStatusSection';
import { SalesTable } from '@/components/sales/SalesTable';
import { useSales } from '@/hooks/useSales';
import { useCompPlan } from '@/hooks/useCompPlan';
import { useFiberStatus } from '@/hooks/useFiberStatus';
import { useAuth } from '@/contexts/AuthContext';
import { expectedPayForSale, isPayableSale } from '@/lib/pay/expectedPay';
import {
  currentMonth,
  isCurrentMonth,
  monthBounds,
  monthLabel,
  salesSoldIn,
  shiftMonth,
  type MonthKey,
} from '@/lib/sales/monthWindow';
import '@/styles/sweep-rep-a.css';

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      const frame = requestAnimationFrame(() => setDisplay(value));
      return () => cancelAnimationFrame(frame);
    }

    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - started) / 650, 1);
      setDisplay(Math.round(value * (1 - Math.pow(1 - progress, 3))));
      if (progress < 1) requestAnimationFrame(tick);
    };

    const frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display.toLocaleString('en-US')}</>;
}

function SalesLineSkeleton() {
  return (
    <div className="sales-line sales-line-loading" aria-label="Loading sales">
      <PageTitle title="Sales" meta="Loading" />
      <div className="sales-line-command">
        <div className="sales-line-command-top">
          <div className="sales-skeleton-stack">
            <span className="sales-skeleton sales-skeleton-kicker" />
            <span className="sales-skeleton sales-skeleton-title" />
            <span className="sales-skeleton sales-skeleton-copy" />
            <span className="sales-skeleton sales-skeleton-button" />
          </div>
          <span className="sales-skeleton sales-skeleton-hero" />
        </div>
        <div className="sales-line-broadcast">
          {[1, 2, 3, 4].map((item) => <span key={item} className="sales-skeleton sales-skeleton-metric" />)}
        </div>
      </div>
      <div className="sales-skeleton-section">
        <span className="sales-skeleton sales-skeleton-section-head" />
        {[1, 2, 3].map((item) => <span key={item} className="sales-skeleton sales-skeleton-row" />)}
      </div>
      <div className="sales-skeleton-section">
        <span className="sales-skeleton sales-skeleton-section-head" />
        {[1, 2, 3, 4].map((item) => <span key={item} className="sales-skeleton sales-skeleton-row" />)}
      </div>
    </div>
  );
}

function SalesContent() {
  const { user, hasPermission } = useAuth();
  const { sales, loading, error, fetchSales, deleteSale, setSaleCancelled } = useSales();
  const fiber = useFiberStatus();

  // Admins and owners read the whole company book; everyone else reads their own.
  // This replaced sales:approve, which used to carry the visibility switch as a
  // side effect of the approval permission.
  const canViewAll = hasPermission('sales:read:all');

  const [payView, setPayView] = useState(false);
  const [month, setMonth] = useState<MonthKey>(() => currentMonth());
  const { rates, payDelayDays, hasPlan, compRole } = useCompPlan();
  const payPlan = useMemo(
    () => ({ rates, payDelayDays, hasPlan, compRole }),
    [compRole, hasPlan, payDelayDays, rates]
  );

  const atCurrentMonth = useMemo(() => isCurrentMonth(month), [month]);

  useEffect(() => {
    if (!user) return;
    // Management fetches one month at a time. A rep's book is fetched whole and
    // sliced by month in the browser instead: their pay list is keyed on the
    // INSTALL date, so a month-bounded fetch on saleDate would drop a sale sold
    // in August that installs in September — money they are actually owed.
    const filters: { salesRepId?: string; limit?: number; startDate?: string; endDate?: string } =
      canViewAll ? { limit: 500, ...monthBounds(month) } : { limit: 500, salesRepId: user.uid };
    fetchSales(filters);
  }, [canViewAll, fetchSales, month, user]);

  // Rep KPIs follow the month picker rather than always reading "this month",
  // so the figures and the list underneath can never describe different months.
  const mtdSales = useMemo(() => salesSoldIn(sales, month), [month, sales]);
  const payableMtd = useMemo(() => mtdSales.filter(isPayableSale), [mtdSales]);
  const expectedPayMtd = hasPlan
    ? payableMtd.reduce((sum, sale) => sum + (expectedPayForSale(sale, rates) ?? 0), 0)
    : null;
  const boardValue = mtdSales.reduce((sum, sale) => sum + (sale.totalValue || 0), 0);

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="sales-line-main flex-1 overflow-auto">
            <div className="sales-line">
              <PageTitle
                title="Sales"
                meta={monthLabel(month)}
                actions={(
                  <Link className="sales-line-primary" href="/portal/sales/new">
                    <Plus className="sales-line-icon" aria-hidden="true" />
                    Log Sale
                  </Link>
                )}
              />

              {error && <div className="sales-line-error" role="alert">{error}</div>}

              {/* One picker for both views. A rep's ledger is month-sliced in
                  the browser rather than in the fetch — see the fetch comment
                  above — but the control and the label are the same one. */}
              <div className="sales-board-month" role="group" aria-label="Month">
                <button
                  type="button"
                  onClick={() => setMonth((current) => shiftMonth(current, -1))}
                  aria-label="Previous month"
                >
                  ‹
                </button>
                <span>{monthLabel(month)}</span>
                <button
                  type="button"
                  onClick={() => setMonth((current) => shiftMonth(current, 1))}
                  disabled={atCurrentMonth}
                  aria-label="Next month"
                >
                  ›
                </button>
              </div>

              {canViewAll ? (
                <>
                  <AdminSalesBoard
                    sales={sales}
                    loading={loading}
                    onDelete={deleteSale}
                    onSetCancelled={setSaleCancelled}
                    fiber={fiber}
                    payPlan={payPlan}
                  />

                  {/* The carrier report from the morning email — Pending
                      install / Active / Cancelled-Churned / Attention. It is a
                      DIFFERENT feed from the board above: the board is what
                      reps logged, this is what the carrier says actually
                      happened, so management needs both. It is not month-
                      scoped; the picker above only moves the board. */}
                  {fiber.data?.scope === 'all' && <InstallStatusSection fiber={fiber} />}
                </>
              ) : (
                <>
                  {!loading && sales.length === 0 && (
                    <p className="sales-line-empty-state">No sales yet. Log your first one.</p>
                  )}

                  <section className="sales-line-command" aria-label="Sales summary">
                    <section className="sales-line-broadcast" aria-label="Sales KPIs">
                      <div className="sales-line-metric">
                        <span className="sales-line-metric-label">Value MTD</span>
                        <strong className="sales-line-metric-value portal-metallic-num"><AnimatedNumber value={boardValue} /><small>$ / mo</small></strong>
                        <span className="sales-line-metric-note"><span className="sales-line-lime">{mtdSales.length}</span> records in {monthLabel(month)}</span>
                      </div>
                      <div className="sales-line-metric">
                        <span className="sales-line-metric-label">Sales this month</span>
                        <strong className="sales-line-metric-value portal-metallic-num"><AnimatedNumber value={mtdSales.length} /><small>sales</small></strong>
                        <span className="sales-line-metric-note">{sales.length} on your board all time</span>
                      </div>
                      <div className="sales-line-metric">
                        <span className="sales-line-metric-label">Expected pay MTD</span>
                        <strong className="sales-line-metric-value portal-metallic-num">
                          {expectedPayMtd === null ? '—' : <><AnimatedNumber value={expectedPayMtd} /><small>$ expected</small></>}
                        </strong>
                        <span className="sales-line-metric-note">{expectedPayMtd === null
                          ? 'No pay plan assigned yet'
                          : `Across ${payableMtd.length} sale${payableMtd.length === 1 ? '' : 's'} in ${monthLabel(month)}`}</span>
                      </div>
                    </section>
                  </section>

                  {fiber.data?.scope === 'all' && <InstallStatusSection fiber={fiber} />}

                  {(loading || sales.length > 0) && (
                    <SalesTable
                      sales={sales}
                      month={month}
                      onDelete={deleteSale}
                      loading={loading}
                      payView={payView}
                      onPayViewChange={setPayView}
                      payPlan={payPlan}
                      fiber={fiber}
                    />
                  )}
                </>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}

function SalesLoadingFallback() {
  return (
    <div className="min-h-screen portal-canvas">
      <PortalHeader />
      <div className="flex">
        <PortalSidebar />
        <main className="sales-line-main flex-1 overflow-auto">
          <SalesLineSkeleton />
        </main>
      </div>
    </div>
  );
}

export default function SalesPage() {
  return (
    <Suspense fallback={<SalesLoadingFallback />}>
      <SalesContent />
    </Suspense>
  );
}
