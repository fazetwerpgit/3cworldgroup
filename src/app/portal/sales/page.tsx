'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Filter, Plus } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { SalesTable } from '@/components/sales/SalesTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import { SaleStatus } from '@/types';

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

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Sales Workspace</h1>
                    <p className="mt-2 max-w-2xl text-sm text-slate-600">
                      {canViewAll ? 'Review field sales activity and approval status' : 'Track your submitted sales and approval status'}
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

              <Card className="rounded-lg border-slate-200 py-4 shadow-sm">
                <CardContent className="px-4">
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                      <Filter className="size-4 text-[#5a8f1f]" />
                      Filters
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-slate-700">Status:</label>
                      <NativeSelect
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as SaleStatus | '')}
                        className="min-w-40"
                      >
                        <option value="">All</option>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="cancelled">Cancelled</option>
                      </NativeSelect>
                    </div>
                    {canApprove && statusFilter === 'pending' && (
                      <Badge variant="outline" className="rounded-md border-amber-200 bg-amber-50 text-amber-700">
                        {sales.filter((s) => s.status === 'pending').length} pending approval
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              {loading && sales.length === 0 ? (
                <Card className="rounded-lg border-slate-200 p-8 text-center shadow-sm">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-slate-500">Loading sales workspace...</p>
                </Card>
              ) : (
                <SalesTable
                  sales={sales}
                  onApprove={canApprove ? handleApprove : undefined}
                  onDelete={handleDelete}
                  loading={loading}
                />
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
      <div className="h-16 border-b border-slate-200 bg-white"></div>
      <div className="flex">
        <div className="min-h-[calc(100vh-4rem)] w-[258px] bg-[#0A1F44]"></div>
        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-[1500px]">
            <div>
              <Skeleton className="h-8 w-1/4 mb-4" />
              <Skeleton className="h-4 w-1/3 mb-8" />
              <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
                <Skeleton className="h-64 w-full" />
              </div>
            </div>
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
