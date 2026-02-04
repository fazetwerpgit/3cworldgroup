'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { SalesTable } from '@/components/sales/SalesTable';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import { SaleStatus } from '@/types';

function SalesContent() {
  const searchParams = useSearchParams();
  const { user, hasPermission } = useAuth();
  const { sales, loading, error, fetchSales, approveSale, deleteSale } = useSales();
  const [statusFilter, setStatusFilter] = useState<SaleStatus | ''>('');

  const canApprove = hasPermission('sales:approve');
  const canViewAll = hasPermission('sales:read');

  useEffect(() => {
    const status = searchParams.get('status') as SaleStatus | null;
    if (status) {
      setStatusFilter(status);
    }
  }, [searchParams]);

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
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-7xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-bold text-[#0A1F44]">Sales</h1>
                  <p className="text-gray-500 mt-1">
                    {canViewAll ? 'View and manage all sales' : 'View and manage your sales'}
                  </p>
                </div>
                <Link
                  href="/portal/sales/new"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Log New Sale
                </Link>
              </div>

              {/* Filters */}
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700">Status:</label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as SaleStatus | '')}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                    >
                      <option value="">All</option>
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  {canApprove && statusFilter === 'pending' && (
                    <span className="text-sm text-yellow-600 bg-yellow-50 px-3 py-1 rounded-full">
                      {sales.filter((s) => s.status === 'pending').length} pending approval
                    </span>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* Loading */}
              {loading && sales.length === 0 ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading sales...</p>
                </div>
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
    <div className="min-h-screen bg-gray-50">
      <div className="h-16 bg-white border-b border-gray-200"></div>
      <div className="flex">
        <div className="w-64 bg-[#0A1F44] min-h-[calc(100vh-4rem)]"></div>
        <main className="flex-1 p-6">
          <div className="max-w-7xl mx-auto">
            <div className="animate-pulse">
              <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/3 mb-8"></div>
              <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100">
                <div className="h-64 bg-gray-100 rounded"></div>
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
