'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Sale, SaleStatusConfig, FIBER_COMPANIES } from '@/types';

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchPendingSales = async () => {
    try {
      const response = await fetch('/api/portal/sales?status=pending&limit=100');
      if (response.ok) {
        const data = await response.json();
        setSales(data.sales);
      }
    } catch (error) {
      console.error('Error fetching pending sales:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingSales();
  }, []);

  const handleApprove = async (saleId: string) => {
    if (!user) return;
    setProcessingId(saleId);

    try {
      const response = await fetch('/api/portal/sales/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId,
          status: 'approved',
          approverId: user.uid,
          approverName: user.displayName || user.email,
        }),
      });

      if (response.ok) {
        setSales((prev) => prev.filter((s) => s.id !== saleId));
      }
    } catch (error) {
      console.error('Error approving sale:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!user || !showRejectModal) return;
    setProcessingId(showRejectModal);

    try {
      const response = await fetch('/api/portal/sales/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saleId: showRejectModal,
          status: 'rejected',
          approverId: user.uid,
          approverName: user.displayName || user.email,
          rejectionReason,
        }),
      });

      if (response.ok) {
        setSales((prev) => prev.filter((s) => s.id !== showRejectModal));
        setShowRejectModal(null);
        setRejectionReason('');
      }
    } catch (error) {
      console.error('Error rejecting sale:', error);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (date: Date | string | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getCompanyLabel = (companyId: string) => {
    const company = FIBER_COMPANIES.find((c) => c.value === companyId);
    return company?.label || companyId;
  };

  return (
    <ProtectedRoute permissions={['sales:approve']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-6xl mx-auto space-y-6">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-[#0A1F44]">Pending Approvals</h1>
                  <p className="text-gray-500 mt-1">
                    Review and approve sales submissions from your team
                  </p>
                </div>
                <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-medium">
                  {sales.length} pending
                </div>
              </div>

              {/* Sales List */}
              {loading ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading pending sales...</p>
                </div>
              ) : sales.length === 0 ? (
                <div className="bg-white rounded-xl p-12 shadow-sm border border-gray-100 text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900">All caught up!</h3>
                  <p className="text-gray-500 mt-1">No pending sales to review right now.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-[#0A1F44] rounded-full flex items-center justify-center">
                              <span className="text-sm font-bold text-white">
                                {sale.salesRepName?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <div>
                              <h3 className="font-semibold text-gray-900">{sale.salesRepName}</h3>
                              <p className="text-xs text-gray-500">{formatDate(sale.saleDate)}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wider">Address</p>
                              <p className="font-medium text-gray-900 truncate">{sale.customerAddress}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wider">Plans</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {sale.products.map((product, idx) => (
                                  <span
                                    key={idx}
                                    className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded"
                                  >
                                    {getCompanyLabel(product.company)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wider">Monthly Value</p>
                              <p className="font-medium text-gray-900">${sale.totalValue.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 uppercase tracking-wider">Points</p>
                              <p className="font-bold text-[#8dc63f]">+{sale.totalPoints} pts</p>
                            </div>
                          </div>

                          {sale.notes && (
                            <div className="mt-3 p-2 bg-gray-50 rounded text-sm text-gray-600">
                              <span className="font-medium">Notes:</span> {sale.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 lg:flex-col lg:w-32">
                          <button
                            onClick={() => handleApprove(sale.id!)}
                            disabled={processingId === sale.id}
                            className="flex-1 lg:w-full px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {processingId === sale.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <>
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Approve
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setShowRejectModal(sale.id!)}
                            disabled={processingId === sale.id}
                            className="flex-1 lg:w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg font-medium hover:bg-red-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </main>
        </div>

        {/* Rejection Modal */}
        {showRejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Reject Sale</h3>
              <p className="text-sm text-gray-600 mb-4">
                Please provide a reason for rejection. This will be shared with the sales rep.
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none resize-none"
                rows={3}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowRejectModal(null);
                    setRejectionReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processingId === showRejectModal || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {processingId === showRejectModal ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
