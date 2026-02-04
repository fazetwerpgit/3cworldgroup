'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Sale, SaleStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';

interface SalesTableProps {
  sales: Sale[];
  onApprove?: (saleId: string, status: 'approved' | 'rejected', reason?: string) => void;
  onDelete?: (saleId: string) => void;
  loading?: boolean;
}

const statusColors: Record<SaleStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export function SalesTable({ sales, onApprove, onDelete, loading }: SalesTableProps) {
  const { hasPermission, isRole } = useAuth();
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const canApprove = hasPermission('sales:approve');
  const isAdmin = isRole('admin');

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
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

  const handleApprove = (saleId: string) => {
    if (onApprove) {
      onApprove(saleId, 'approved');
    }
  };

  const handleReject = (saleId: string) => {
    if (onApprove && rejectionReason) {
      onApprove(saleId, 'rejected', rejectionReason);
      setShowRejectModal(null);
      setRejectionReason('');
    }
  };

  const handleDelete = (saleId: string) => {
    if (onDelete) {
      onDelete(saleId);
      setShowDeleteModal(null);
    }
  };

  if (sales.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
        <svg
          className="w-12 h-12 mx-auto mb-3 text-gray-300"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p className="text-gray-500">No sales found</p>
        <Link
          href="/portal/sales/new"
          className="inline-block mt-4 px-4 py-2 bg-[#8dc63f] text-white rounded-lg text-sm font-medium hover:bg-[#7ab82e] transition-colors"
        >
          Log New Sale
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Mobile Card Layout */}
      <div className="lg:hidden space-y-4">
        {sales.map((sale) => (
          <div key={sale.id} className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            {/* Header with customer name and status */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-gray-900">{sale.customerName}</h3>
                {sale.customerPhone && (
                  <p className="text-sm text-gray-500">{sale.customerPhone}</p>
                )}
              </div>
              <span
                className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                  statusColors[sale.status]
                }`}
              >
                {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
              </span>
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div>
                <p className="text-gray-500 text-xs">Sales Rep</p>
                <p className="text-gray-900">{sale.salesRepName}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Date</p>
                <p className="text-gray-900">{formatDate(sale.saleDate)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Value</p>
                <p className="text-gray-900 font-medium">{formatCurrency(sale.totalValue)}</p>
              </div>
              <div>
                <p className="text-gray-500 text-xs">Commission</p>
                <p className="text-[#8dc63f] font-medium">+{formatCurrency(sale.commission)}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
              <Link
                href={`/portal/sales/${sale.id}`}
                className="flex-1 px-3 py-2 text-center text-sm font-medium text-[#0A1F44] bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                View
              </Link>
              {isAdmin && (
                <>
                  <Link
                    href={`/portal/sales/${sale.id}/edit`}
                    className="flex-1 px-3 py-2 text-center text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => setShowDeleteModal(sale.id!)}
                    disabled={loading}
                    className="flex-1 px-3 py-2 text-center text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    Delete
                  </button>
                </>
              )}
              {canApprove && sale.status === 'pending' && (
                <>
                  <button
                    onClick={() => handleApprove(sale.id!)}
                    disabled={loading}
                    className="flex-1 px-3 py-2 text-center text-sm font-medium text-green-600 bg-green-50 rounded-lg hover:bg-green-100 disabled:opacity-50 transition-colors"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => setShowRejectModal(sale.id!)}
                    disabled={loading}
                    className="flex-1 px-3 py-2 text-center text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 disabled:opacity-50 transition-colors"
                  >
                    Reject
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table Layout */}
      <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sales Rep
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sales.map((sale) => (
                <tr key={sale.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {sale.customerName}
                      </div>
                      {sale.customerPhone && (
                        <div className="text-sm text-gray-500">{sale.customerPhone}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{sale.salesRepName}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">{formatDate(sale.saleDate)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatCurrency(sale.totalValue)}
                    </div>
                    <div className="text-xs text-[#8dc63f]">
                      +{formatCurrency(sale.commission)} commission
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                        statusColors[sale.status]
                      }`}
                    >
                      {sale.status.charAt(0).toUpperCase() + sale.status.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/portal/sales/${sale.id}`}
                        className="text-[#0A1F44] hover:text-[#1a3a6e]"
                      >
                        View
                      </Link>
                      {isAdmin && (
                        <>
                          <Link
                            href={`/portal/sales/${sale.id}/edit`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </Link>
                          <button
                            onClick={() => setShowDeleteModal(sale.id!)}
                            disabled={loading}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        </>
                      )}
                      {canApprove && sale.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(sale.id!)}
                            disabled={loading}
                            className="text-green-600 hover:text-green-800 disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setShowRejectModal(sale.id!)}
                            disabled={loading}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rejection Modal */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-[#0A1F44] mb-4">Reject Sale</h3>
            <p className="text-gray-600 mb-4">
              Please provide a reason for rejecting this sale:
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none resize-none"
              rows={3}
              placeholder="Enter rejection reason..."
            />
            <div className="flex justify-end gap-3 mt-4">
              <button
                onClick={() => {
                  setShowRejectModal(null);
                  setRejectionReason('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReject(showRejectModal)}
                disabled={!rejectionReason || loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Reject Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
                onClick={() => setShowDeleteModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(showDeleteModal)}
                disabled={loading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Delete Sale
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
