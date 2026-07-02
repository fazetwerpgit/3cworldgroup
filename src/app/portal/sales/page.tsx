'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { SalesTable } from '@/components/sales/SalesTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import { SaleStatus } from '@/types';

const STATUS_TABS: { value: SaleStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'cancelled', label: 'Cancelled' },
];

function TableSkeleton() {
  // Geometry-true: mirrors the real table rows so the swap is seamless.
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-border dark:bg-card">
      <div className="border-b border-slate-100 bg-slate-50/80 px-4 py-3 dark:border-border dark:bg-muted/40">
        <Skeleton className="h-3.5 w-3/4" />
      </div>
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-slate-100 px-4 py-3 last:border-0 dark:border-border"
        >
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="hidden h-6 w-6 rounded-full sm:block" />
          <Skeleton className="hidden h-4 w-24 sm:block" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-5 w-20 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function SalesContent() {
  const searchParams = useSearchParams();
  const { user, hasPermission } = useAuth();
  const { sales, loading, error, fetchSales, approveSale, deleteSale } = useSales();
  const [statusFilter, setStatusFilter] = useState<SaleStatus | ''>(
    (searchParams.get('status') as SaleStatus | null) ?? ''
  );

  const canApprove = hasPermission('sales:approve');
  const canViewAll = hasPermission('sales:read');

  useEffect(() => {
    const filters: { status?: SaleStatus; salesRepId?: string } = {};

    if (statusFilter) {
      filters.status = statusFilter;
    }

    // If user can't view all, only show their own sales
    if (!canViewAll && user) {
      filters.salesRepId = user.uid;
    }

    fetchSales(filters);
  }, [statusFilter, canViewAll, user, fetchSales]);

  const handleApprove = async (saleId: string, status: 'approved' | 'rejected', reason?: string) => {
    if (!user) return;

    await approveSale(
      saleId,
      status,
      user.uid,
      user.displayName || user.email || '',
      reason
    );
  };

  const handleDelete = async (saleId: string) => {
    await deleteSale(saleId);
  };

  const pendingInView = sales.filter((s) => s.status === 'pending').length;

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              {/* Command band — same identity as the dashboard. */}
              <section className="portal-enter relative overflow-hidden rounded-lg bg-[#0A1F44] text-white">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      'radial-gradient(ellipse 45% 90% at 8% 100%, rgba(141,198,63,0.14), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '100% 100%, 28px 28px, 28px 28px',
                  }}
                />
                <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                      Sales workspace
                    </p>
                    <h1 className="portal-display mt-1.5 text-3xl font-extrabold tracking-tight">
                      Sales
                    </h1>
                    <p className="mt-1.5 text-sm text-white/60">
                      {canViewAll
                        ? 'Review field sales activity and approval status.'
                        : 'Track your submitted sales and approval status.'}
                    </p>
                  </div>
                  <Button asChild className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]">
                    <Link href="/portal/sales/new">
                      <Plus className="size-4" />
                      Log sale
                    </Link>
                  </Button>
                </div>
              </section>

              {/* Saved-view style status tabs — lime underline marks the active view. */}
              <div className="portal-enter portal-enter-2 flex items-center gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-border [&::-webkit-scrollbar]:hidden">
                {STATUS_TABS.map((tab) => {
                  const active = statusFilter === tab.value;
                  return (
                    <button
                      key={tab.label}
                      type="button"
                      onClick={() => setStatusFilter(tab.value)}
                      className={`relative shrink-0 px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? 'font-semibold text-slate-950 dark:text-foreground'
                          : 'text-slate-500 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {tab.label}
                        {tab.value === 'pending' && canApprove && pendingInView > 0 && (
                          <span className="portal-num rounded-full bg-amber-100 px-1.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                            {pendingInView}
                          </span>
                        )}
                      </span>
                      {active && (
                        <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#8dc63f]" />
                      )}
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300">
                  {error}
                </div>
              )}

              <div className="portal-enter portal-enter-3">
                {loading && sales.length === 0 ? (
                  <TableSkeleton />
                ) : (
                  <SalesTable
                    sales={sales}
                    onApprove={canApprove ? handleApprove : undefined}
                    onDelete={handleDelete}
                    loading={loading}
                    filtered={statusFilter !== ''}
                    onClearFilter={() => setStatusFilter('')}
                  />
                )}
              </div>
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
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <div className="mx-auto max-w-[1500px] space-y-5">
            <Skeleton className="h-32 w-full rounded-lg" />
            <Skeleton className="h-10 w-80" />
            <TableSkeleton />
          </div>
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
