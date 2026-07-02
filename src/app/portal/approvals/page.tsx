'use client';

import { useEffect, useState } from 'react';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { Sale, FIBER_COMPANIES } from '@/types';

export default function ApprovalsPage() {
  const { user } = useAuth();
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [showRejectModal, setShowRejectModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchPendingSales = async () => {
    try {
      // The sales list endpoint requires a verified login.
      const token = await getIdToken();
      const response = await fetch('/api/portal/sales?status=pending&limit=100', {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
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
      const token = await getIdToken();
      const response = await fetch('/api/portal/sales/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          saleId,
          status: 'approved',
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
      const token = await getIdToken();
      const response = await fetch('/api/portal/sales/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          saleId: showRejectModal,
          status: 'rejected',
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
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              {/* Header — navy command band */}
              <PortalPageHeader
                compact
                eyebrow="Review queue"
                title="Pending Approvals"
                description="Review sales submissions with the customer, plan, value, and points in one pass."
                actions={
                  <div
                    className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold ${
                      sales.length > 0
                        ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300'
                        : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-border dark:bg-muted dark:text-muted-foreground'
                    }`}
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    {sales.length} pending
                  </div>
                }
              />

              {/* Sales List */}
              {loading ? (
                <div className="portal-enter portal-enter-2 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-8 text-center shadow-sm">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-slate-500 dark:text-muted-foreground">Loading pending sales...</p>
                </div>
              ) : sales.length === 0 ? (
                <div className="portal-enter portal-enter-2 rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-12 text-center shadow-sm">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-md bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <Check className="h-7 w-7" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-950 dark:text-foreground">All caught up</h3>
                  <p className="mt-1 text-slate-500 dark:text-muted-foreground">No pending sales to review right now.</p>
                </div>
              ) : (
                <div className="portal-enter portal-enter-2 space-y-3">
                  {sales.map((sale) => (
                    <div
                      key={sale.id}
                      className="rounded-lg border border-slate-200 dark:border-border bg-white dark:bg-card p-5 shadow-sm transition-colors hover:border-slate-300 dark:hover:border-border"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0A1F44]">
                              <span className="text-sm font-bold text-white">
                                {sale.salesRepName?.charAt(0).toUpperCase() || 'U'}
                              </span>
                            </div>
                            <div>
                              <h3 className="font-semibold text-slate-950 dark:text-foreground">{sale.salesRepName}</h3>
                              <p className="text-xs text-slate-500 dark:text-muted-foreground">{formatDate(sale.saleDate)}</p>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
                            <div>
                              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Address</p>
                              <p className="truncate font-medium text-slate-950 dark:text-foreground">{sale.customerAddress}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Plans</p>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {sale.products.map((product, idx) => (
                                  <span
                                    key={idx}
                                    className="rounded border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted px-2 py-0.5 text-xs text-slate-700 dark:text-muted-foreground"
                                  >
                                    {getCompanyLabel(product.company)}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Monthly Value</p>
                              <p className="font-medium text-slate-950 dark:text-foreground">${sale.totalValue.toFixed(2)}</p>
                            </div>
                            <div>
                              <p className="text-xs uppercase tracking-wider text-slate-500 dark:text-muted-foreground">Points</p>
                              <p className="font-bold text-[#8dc63f]">+{sale.totalPoints} pts</p>
                            </div>
                          </div>

                          {sale.notes && (
                            <div className="mt-3 rounded-md bg-slate-50 dark:bg-muted p-2 text-sm text-slate-600 dark:text-muted-foreground">
                              <span className="font-medium">Notes:</span> {sale.notes}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 lg:flex-col lg:w-32">
                          <button
                            onClick={() => handleApprove(sale.id!)}
                            disabled={processingId === sale.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-[#8dc63f] px-4 py-2 font-semibold text-[#0A1F44] transition-colors hover:bg-[#7ab82e] disabled:opacity-50 lg:w-full"
                          >
                            {processingId === sale.id ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            ) : (
                              <>
                                <Check className="h-4 w-4" />
                                Approve
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => setShowRejectModal(sale.id!)}
                            disabled={processingId === sale.id}
                            className="flex flex-1 items-center justify-center gap-2 rounded-md border border-red-200 dark:border-red-500/30 px-4 py-2 font-semibold text-red-700 dark:text-red-300 transition-colors hover:bg-red-50 dark:hover:bg-red-500/15 disabled:opacity-50 lg:w-full"
                          >
                            <X className="h-4 w-4" />
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
            <div className="w-full max-w-md rounded-lg bg-white dark:bg-card p-6 shadow-lg">
              <h3 className="mb-4 text-lg font-semibold text-slate-950 dark:text-foreground">Reject Sale</h3>
              <p className="mb-4 text-sm text-slate-600 dark:text-muted-foreground">
                Please provide a reason for rejection. This will be shared with the sales rep.
              </p>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                className="w-full resize-none rounded-md border border-slate-300 dark:border-border bg-white dark:bg-card px-4 py-3 text-slate-950 dark:text-foreground placeholder:text-slate-500 dark:placeholder:text-muted-foreground outline-none focus:border-transparent focus:ring-2 focus:ring-[#8dc63f]"
                rows={3}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setShowRejectModal(null);
                    setRejectionReason('');
                  }}
                  className="flex-1 rounded-md border border-slate-300 dark:border-border px-4 py-2 font-medium text-slate-700 dark:text-muted-foreground transition-colors hover:bg-slate-50 dark:hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReject}
                  disabled={processingId === showRejectModal || !rejectionReason.trim()}
                  className="flex-1 rounded-md bg-red-600 px-4 py-2 font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
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
