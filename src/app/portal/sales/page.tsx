'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { SalesTable } from '@/components/sales/SalesTable';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import { Sale, SaleStatus } from '@/types';

const STATUS_VALUES: SaleStatus[] = ['pending', 'approved', 'rejected', 'cancelled'];

function monthKey(value: Date | string | undefined) {
  if (!value) return '';
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}`;
}

function sumValue(sales: Sale[]) {
  return sales.reduce((sum, sale) => sum + (sale.totalValue || 0), 0);
}

function formatSubmittedDate(value: Date | string | undefined) {
  if (!value) return 'N/A';
  return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthlyValue(value: number) {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function daysWaiting(value: Date | string | undefined) {
  if (!value) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function InReviewSection({ sales }: { sales: Sale[] }) {
  const ordered = useMemo(
    () => [...sales].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [sales]
  );

  return (
    <section className="sales-line-inreview" aria-label="Submitted, in review">
      <div className="sales-line-inreview-head">
        <div>
          <p className="sales-line-eyebrow">Submitted / in review</p>
          <h2>Waiting on a decision</h2>
        </div>
        <p className="sales-line-inreview-count">{ordered.length} pending</p>
      </div>

      {ordered.length ? (
        <div className="sales-line-inreview-list">
          {ordered.map((sale) => {
            const waiting = daysWaiting(sale.createdAt);
            return (
              <Link
                className="sales-line-inreview-row"
                key={sale.id}
                href={`/portal/sales/${sale.id}`}
              >
                <div className="sales-line-inreview-primary">
                  <strong>{sale.customerName || sale.customerAddress || 'Customer pending'}</strong>
                  {sale.productSold && <span>{sale.productSold}</span>}
                </div>
                <span className="sales-line-inreview-value portal-metallic-num">{formatMonthlyValue(sale.totalValue || 0)}<small>/mo</small></span>
                <span className="sales-line-inreview-date">{sale.installDate ? `Install ${formatSubmittedDate(sale.installDate)}` : 'Install —'}</span>
                <span className="sales-line-inreview-wait">{waiting === 0 ? 'Today' : `${waiting}d waiting`}</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <p className="sales-line-inreview-empty">Nothing waiting on review. Everything you&apos;ve sent in has been decided.</p>
      )}
    </section>
  );
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
      <div className="sales-line-mast sales-skeleton-line" />
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user, hasPermission } = useAuth();
  const { sales, loading, error, fetchSales, approveSale, deleteSale } = useSales();
  const queryStatus = searchParams.get('status');
  const statusFilter: SaleStatus | '' = queryStatus && STATUS_VALUES.includes(queryStatus as SaleStatus)
      ? (queryStatus as SaleStatus)
      : '';

  const canApprove = hasPermission('sales:approve');
  const canViewAll = hasPermission('sales:approve');
  const now = useMemo(() => new Date(), []);
  const currentMonth = monthKey(now);
  const mtdSales = sales.filter((sale) => monthKey(sale.saleDate) === currentMonth);
  const pendingSales = sales.filter((sale) => sale.status === 'pending');
  const approvedMtd = mtdSales.filter((sale) => sale.status === 'approved').length;
  const oldestIdle = pendingSales.reduce((oldest, sale) => {
    const days = Math.max(0, Math.floor((now.getTime() - new Date(sale.saleDate).getTime()) / 86_400_000));
    return Math.max(oldest, days);
  }, 0);
  const commissionCount = sales.filter((sale) => typeof sale.commission === 'number').length;
  const dateLabel = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
    .format(now)
    .toUpperCase();
  const weekdayLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long' })
    .format(now)
    .toUpperCase();

  useEffect(() => {
    const filters: { salesRepId?: string; limit?: number } = { limit: 100 };
    if (!canViewAll && user) filters.salesRepId = user.uid;
    if (user) fetchSales(filters);
  }, [canViewAll, fetchSales, user]);

  const setFilter = (next: SaleStatus | '') => {
    router.replace(next ? `${pathname}?status=${next}` : pathname, { scroll: false });
  };

  const handleApproval = async (
    saleId: string,
    status: 'approved' | 'rejected',
    reason?: string
  ) => {
    if (!user) return false;
    return approveSale(saleId, status, user.uid, user.displayName || user.email || '', reason);
  };

  const managerCopy = canApprove;
  const boardCount = mtdSales.length;
  const boardValue = sumValue(mtdSales);
  const contextCopy = managerCopy
    ? `${pendingSales.length} submission${pendingSales.length === 1 ? '' : 's'} in flight. Start with the oldest, then let the ledger carry the rest of the month.`
    : 'Your sales are on the board. Pending statuses stay visible, but review decisions remain with management.';

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="sales-line-main flex-1 overflow-auto">
            <div className="sales-line">
              <div className="sales-line-mast">
                <span className="sales-line-mark">3C WORLD GROUP / THE LINE / SALES</span>
                <span className="sales-line-mast-meta">{dateLabel} · {weekdayLabel}</span>
              </div>

              <header className="sales-line-command">
                <div className="sales-line-command-top">
                  <div>
                    <p className="sales-line-eyebrow">{managerCopy ? 'Management / priority flow' : 'Field sales / your flow'}</p>
                    <h1><span>{boardCount} sales</span> on the board.</h1>
                    <p className="sales-line-context">{contextCopy}</p>
                    <Link className="sales-line-primary" href="/portal/sales/new">
                      <Plus className="sales-line-icon" aria-hidden="true" />
                      Log sale
                    </Link>
                  </div>
                  <div className="sales-line-hero-number">
                    <strong className="sales-line-display portal-metallic-num"><AnimatedNumber value={boardValue} /></strong>
                    <small>Monthly value · $ / mo</small>
                  </div>
                </div>

                <section className="sales-line-broadcast" aria-label="Sales KPIs">
                  <div className="sales-line-metric">
                    <span className="sales-line-metric-label">Value MTD</span>
                    <strong className="sales-line-metric-value portal-metallic-num"><AnimatedNumber value={boardValue} /><small>$ / mo</small></strong>
                    <span className="sales-line-metric-note"><span className="sales-line-lime">{mtdSales.length}</span> records this month</span>
                  </div>
                  <div className="sales-line-metric">
                    <span className="sales-line-metric-label">Sales on board</span>
                    <strong className="sales-line-metric-value portal-metallic-num"><AnimatedNumber value={boardCount} /><small>SALES</small></strong>
                    <span className="sales-line-metric-note">{approvedMtd} approved · {pendingSales.length} pending</span>
                  </div>
                  <div className="sales-line-metric">
                    <span className="sales-line-metric-label">Pending review</span>
                    <strong className="sales-line-metric-value portal-metallic-num"><AnimatedNumber value={pendingSales.length} /><small>OPEN</small></strong>
                    <span className="sales-line-metric-note">Oldest <span className="sales-line-lime">{oldestIdle ? `${oldestIdle} days` : 'today'}</span> idle</span>
                  </div>
                  <div className="sales-line-metric">
                    <span className="sales-line-metric-label">Commission MTD</span>
                    <strong className="sales-line-metric-value portal-metallic-num">—</strong>
                    <span className="sales-line-metric-note">{commissionCount ? `${commissionCount} recorded value${commissionCount === 1 ? '' : 's'}` : 'No commission values recorded'}</span>
                  </div>
                </section>
              </header>

              {error && <div className="sales-line-error" role="alert">{error}</div>}

              {!canApprove && !loading && <InReviewSection sales={pendingSales} />}

              <SalesTable
                sales={sales}
                statusFilter={statusFilter}
                onStatusFilterChange={setFilter}
                onApprove={canApprove ? handleApproval : undefined}
                onDelete={deleteSale}
                loading={loading}
              />
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
