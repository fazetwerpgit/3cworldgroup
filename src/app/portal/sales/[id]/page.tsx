'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useSales } from '@/hooks/useSales';
import { useAuth } from '@/contexts/AuthContext';
import { Sale } from '@/types';

export default function SaleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isRole } = useAuth();
  const { fetchSale, deleteSale, loading, error } = useSales();
  const [sale, setSale] = useState<Sale | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isAdmin = isRole('admin');
  const saleId = params.id as string;

  useEffect(() => {
    async function loadSale() {
      const saleData = await fetchSale(saleId);
      setSale(saleData);
    }
    if (saleId) {
      loadSale();
    }
  }, [saleId, fetchSale]);

  const handleDelete = async () => {
    setDeleting(true);
    const success = await deleteSale(saleId);
    if (success) {
      router.push('/portal/sales');
    }
    setDeleting(false);
    setShowDeleteModal(false);
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'rejected':
        return 'bg-red-100 text-red-800 border-red-200';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  if (loading && !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#8dc63f] mx-auto"></div>
            <p className="mt-4 text-gray-500">Loading sale details...</p>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  if (error || !sale) {
    return (
      <ProtectedRoute permissions={['sales:read']}>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-gray-900 font-semibold">Sale not found</p>
            <p className="text-gray-500 mt-1">{error || 'The sale you are looking for does not exist.'}</p>
            <Link
              href="/portal/sales"
              className="inline-block mt-4 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e]"
            >
              Back to Sales
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute permissions={['sales:read']}>
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-4xl mx-auto p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/portal/sales"
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-[#0A1F44]">Sale Details</h1>
                <p className="text-gray-500 text-sm">ID: {sale.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(sale.status)}`}>
                {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
              </span>
              {isAdmin && (
                <>
                  <Link
                    href={`/portal/sales/${sale.id}/edit`}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </Link>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Customer Information */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-[#0A1F44] mb-4 flex items-center gap-2">
              <span className="text-xl">👤</span> Customer Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">Address</label>
                <p className="font-medium text-gray-900">{sale.customerAddress || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Name</label>
                <p className="font-medium text-gray-900">{sale.customerName || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Phone</label>
                <p className="font-medium text-gray-900">{sale.customerPhone || 'Not provided'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Email</label>
                <p className="font-medium text-gray-900">{sale.customerEmail || 'Not provided'}</p>
              </div>
            </div>
          </div>

          {/* Sale Information */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-[#0A1F44] mb-4 flex items-center gap-2">
              <span className="text-xl">📊</span> Sale Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-gray-500">Sales Rep</label>
                <p className="font-medium text-gray-900">{sale.salesRepName}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Sale Date</label>
                <p className="font-medium text-gray-900">{formatDate(sale.saleDate)}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Sale Type</label>
                <p className="font-medium text-gray-900 capitalize">{sale.saleType?.replace('_', ' ') || 'N/A'}</p>
              </div>
              <div>
                <label className="text-sm text-gray-500">Created</label>
                <p className="font-medium text-gray-900">{formatDate(sale.createdAt)}</p>
              </div>
            </div>
            {sale.notes && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <label className="text-sm text-gray-500">Notes</label>
                <p className="font-medium text-gray-900">{sale.notes}</p>
              </div>
            )}
          </div>

          {/* Products/Plans */}
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-lg font-semibold text-[#0A1F44] mb-4 flex items-center gap-2">
              <span className="text-xl">📦</span> Plans Sold
            </h2>
            <div className="space-y-3">
              {sale.products?.map((product, index) => (
                <div key={index} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium text-gray-900">{product.productName}</p>
                    <p className="text-sm text-gray-500">{product.company}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gray-900">{formatCurrency(product.unitPrice)}/mo</p>
                    <p className="text-sm text-[#8dc63f] font-medium">+{product.points} pts</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gradient-to-br from-[#0A1F44] to-[#1a3a6e] rounded-xl p-6 text-white">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <span className="text-xl">💰</span> Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="text-white/60 text-sm">Total Value</label>
                <p className="text-2xl font-bold">{formatCurrency(sale.totalValue || 0)}</p>
                <p className="text-white/60 text-xs">/month</p>
              </div>
              <div>
                <label className="text-white/60 text-sm">Commission</label>
                <p className="text-2xl font-bold">{formatCurrency(sale.commission || 0)}</p>
              </div>
              <div>
                <label className="text-white/60 text-sm">Points Earned</label>
                <p className="text-2xl font-bold text-[#8dc63f]">+{sale.totalPoints || 0}</p>
              </div>
              <div>
                <label className="text-white/60 text-sm">Plans</label>
                <p className="text-2xl font-bold">{sale.products?.length || 0}</p>
              </div>
            </div>
          </div>

          {/* Approval Information */}
          {(sale.status === 'approved' || sale.status === 'rejected') && sale.approvedBy && (
            <div className={`rounded-xl p-6 ${sale.status === 'approved' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <h2 className={`text-lg font-semibold mb-2 ${sale.status === 'approved' ? 'text-green-800' : 'text-red-800'}`}>
                {sale.status === 'approved' ? '✅ Approved' : '❌ Rejected'}
              </h2>
              <p className={sale.status === 'approved' ? 'text-green-700' : 'text-red-700'}>
                By: {sale.approverName || sale.approvedBy} on {formatDate(sale.approvedAt)}
              </p>
              {sale.rejectionReason && (
                <p className="mt-2 text-red-700">
                  <span className="font-medium">Reason:</span> {sale.rejectionReason}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 bg-red-100 rounded-full">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#0A1F44]">Delete Sale</h3>
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete this sale? This action cannot be undone and will permanently remove the sale record.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete Sale'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
