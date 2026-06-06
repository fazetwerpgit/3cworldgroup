'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import {
  OnboardingItem,
  OnboardingStatus,
  OnboardingStatusConfig,
  OnboardingCategoryLabels,
  OnboardingCategory,
} from '@/types';

interface ChecklistItem extends OnboardingItem {
  status: OnboardingStatus;
  reference: string | null;
  rejectionReason: string | null;
  reviewerName: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
}

interface ChecklistResponse {
  items: ChecklistItem[];
  fieldRole: string | null;
  isIBO: boolean;
  progress: { approved: number; total: number; complete: boolean };
}

const STATUS_BADGE: Record<OnboardingStatus, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  submitted: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

export default function OnboardingPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitModal, setSubmitModal] = useState<ChecklistItem | null>(null);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchChecklist = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/portal/onboarding?userId=${user.uid}`);
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to load checklist');
      }
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checklist');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchChecklist();
  }, [fetchChecklist]);

  const handleSubmit = async () => {
    if (!user || !submitModal) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/portal/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          itemId: submitModal.id,
          reference,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to submit');
      }

      setSubmitModal(null);
      setReference('');
      await fetchChecklist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return '';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  // Group items by category, preserving item order within each group
  const grouped = (data?.items ?? []).reduce<Record<string, ChecklistItem[]>>(
    (acc, item) => {
      (acc[item.category] = acc[item.category] || []).push(item);
      return acc;
    },
    {}
  );

  const progressPct =
    data && data.progress.total > 0
      ? Math.round((data.progress.approved / data.progress.total) * 100)
      : 0;

  return (
    <ProtectedRoute roles={['entry_rep', 'l1_manager', 'l2_manager']}>
      <div className="min-h-screen bg-gray-50">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-4xl mx-auto space-y-6">
              {/* Header */}
              <div>
                <h1 className="text-2xl font-bold text-[#0A1F44]">My Onboarding</h1>
                <p className="text-gray-500 mt-1">
                  Complete every item below to get cleared to sell
                  {data?.isIBO ? ' (includes IBO business items)' : ''}
                </p>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-xl text-sm border border-red-200">
                  {error}
                </div>
              )}

              {/* Progress bar */}
              {data && (
                <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-semibold text-gray-900">
                      {data.progress.complete
                        ? 'Onboarding complete! 🎉'
                        : 'Onboarding Progress'}
                    </span>
                    <span className="text-sm font-medium text-gray-600">
                      {data.progress.approved} / {data.progress.total} approved
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-3">
                    <div
                      className="bg-[#8dc63f] h-3 rounded-full transition-all duration-500"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Checklist */}
              {loading ? (
                <div className="bg-white rounded-xl p-8 shadow-sm border border-gray-100 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
                  <p className="mt-4 text-gray-500">Loading your checklist...</p>
                </div>
              ) : (
                Object.entries(grouped).map(([category, items]) => (
                  <div key={category} className="space-y-3">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
                      {OnboardingCategoryLabels[category as OnboardingCategory] ?? category}
                    </h2>
                    {items.map((item) => (
                      <div
                        key={item.id}
                        className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3">
                              <h3 className="font-semibold text-gray-900">{item.label}</h3>
                              <span
                                className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_BADGE[item.status]}`}
                              >
                                {OnboardingStatusConfig[item.status].name}
                              </span>
                              {item.sensitive && (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  Secure
                                </span>
                              )}
                            </div>

                            {item.status === 'submitted' && item.submittedAt && (
                              <p className="text-xs text-gray-500 mt-1">
                                Submitted {formatDate(item.submittedAt)} — awaiting review
                              </p>
                            )}
                            {item.status === 'approved' && item.reviewedAt && (
                              <p className="text-xs text-green-600 mt-1">
                                Approved {formatDate(item.reviewedAt)}
                                {item.reviewerName ? ` by ${item.reviewerName}` : ''}
                              </p>
                            )}
                            {item.status === 'rejected' && item.rejectionReason && (
                              <div className="mt-2 p-2 bg-red-50 rounded-lg text-sm text-red-700">
                                <span className="font-medium">Reason:</span>{' '}
                                {item.rejectionReason}
                              </div>
                            )}
                          </div>

                          {(item.status === 'not_started' || item.status === 'rejected') && (
                            <button
                              onClick={() => {
                                setSubmitModal(item);
                                setReference(item.reference ?? '');
                              }}
                              className="px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors text-sm whitespace-nowrap"
                            >
                              {item.status === 'rejected' ? 'Resubmit' : 'Submit'}
                            </button>
                          )}
                          {item.status === 'approved' && (
                            <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </main>
        </div>

        {/* Submit Modal */}
        {submitModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Submit {submitModal.label}
              </h3>
              {submitModal.sensitive ? (
                <p className="text-sm text-gray-600 mb-4">
                  For your security, do <span className="font-semibold">not</span> enter
                  card numbers, SSNs, or account numbers here. Provide a reference only
                  (e.g. the confirmation number from the secure vendor form, or the
                  document name you uploaded).
                </p>
              ) : (
                <p className="text-sm text-gray-600 mb-4">
                  Add an optional note or reference for the reviewer (e.g. document
                  name, confirmation number).
                </p>
              )}
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Reference or note (optional)"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#8dc63f] focus:border-transparent outline-none"
                maxLength={500}
              />
              <div className="flex gap-3 mt-4">
                <button
                  onClick={() => {
                    setSubmitModal(null);
                    setReference('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
