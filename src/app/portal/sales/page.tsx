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
import { dateToSaleDateInput } from '@/lib/sales/saleDate';
import '@/styles/sweep-rep-a.css';

// A month, as the page tracks it. Sales are fetched a month at a time now: the
// old unbounded `limit: 100` silently truncated a busy month, and every figure
// on the admin board is a monthly figure anyway.
interface MonthKey { year: number; month: number; }

function monthBounds({ year, month }: MonthKey) {
  // Local-noon bounds, matching how install and sale dates are stored.
  const start = new Date(year, month, 1, 12, 0, 0);
  const end = new Date(year, month + 1, 0, 12, 0, 0);
  return { startDate: dateToSaleDateInput(start), endDate: dateToSaleDateInput(end) };
}

function monthLabel({ year, month }: MonthKey) {
  return new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth({ year, month }: MonthKey, by: number): MonthKey {
  const shifted = new Date(year, month + by, 1);
  return { year: shifted.getFullYear(), month: shifted.getMonth() };
}

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
  const { sales, loading, error, fetchSales, deleteSale } = useSales();
  const fiber = useFiberStatus();

  // Admins and owners read the whole company book; everyone else reads their own.
  // This replaced sales:approve, which used to carry the visibility switch as a
  // side effect of the approval permission.
  const canViewAll = hasPermission('sales:read:all');

  const [payView, setPayView] = useState(false);
  const [month, setMonth] = useState<MonthKey>(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const { rates, payDelayDays, hasPlan, compRole } = useCompPlan();
  const payPlan = useMemo(
    () => ({ rates, payDelayDays, hasPlan, compRole }),
    [compRole, hasPlan, payDelayDays, rates]
  );

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return month.year === now.getFullYear() && month.month === now.getMonth();
  }, [month]);

  useEffect(() => {
    if (!user) return;
    // Management fetches one month at a time; a rep's book is small enough to
    // read whole, and their pay list has to reach back past the current month
    // to sales that installed earlier.
    const filters: { salesRepId?: string; limit?: number; startDate?: string; endDate?: string } =
      canViewAll ? { limit: 500, ...monthBounds(month) } : { limit: 200, salesRepId: user.uid };
    fetchSales(filters);
  }, [canViewAll, fetchSales, month, user]);

  // Rep KPIs stay month-to-date over their own book.
  const now = useMemo(() => new Date(), []);
  const mtdSales = useMemo(
    () =>
      sales.filter((sale) => {
        const date = new Date(sale.saleDate);
        return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      }),
    [now, sales]
  );
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
                meta={canViewAll ? monthLabel(month) : `${mtdSales.length} this month`}
                actions={(
                  <Link className="sales-line-primary" href="/portal/sales/new">
                    <Plus className="sales-line-icon" aria-hidden="true" />
                    Log Sale
                  </Link>
                )}
              />

              {error && <div className="sales-line-error" role="alert">{error}</div>}

              {canViewAll ? (
                <>
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
                      disabled={isCurrentMonth}
                      aria-label="Next month"
                    >
                      ›
                    </button>
                  </div>

                  <AdminSalesBoard
                    sales={sales}
                    loading={loading}
                    onDelete={deleteSale}
                    fiber={fiber}
                    payPlan={payPlan}
                  />
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
                        <span className="sales-line-metric-note"><span className="sales-line-lime">{mtdSales.length}</span> records this month</span>
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
                          : `Across ${payableMtd.length} sale${payableMtd.length === 1 ? '' : 's'} this month`}</span>
                      </div>
                    </section>
                  </section>

                  {fiber.data?.scope === 'all' && <InstallStatusSection fiber={fiber} />}

                  {(loading || sales.length > 0) && (
                    <SalesTable
                      sales={sales}
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
