'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { OnboardingCategory, OnboardingCategoryLabels } from '@/types';

interface Submission {
  id: string;
  userId: string;
  itemId: string;
  itemLabel: string;
  category: OnboardingCategory;
  sensitive: boolean;
  reference: string | null;
  userName: string;
  userEmail: string;
  submittedAt: string | null;
}

export default function OnboardingReviewPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<Submission | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const fetchQueue = useCallback(async () => {
    try {
      const response = await fetch('/api/portal/onboarding/review');
      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to load review queue');
      }
      setSubmissions(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const review = async (
    submission: Submission,
    status: 'approved' | 'rejected',
    reason?: string
  ) => {
    if (!user) return;
    setProcessingId(submission.id);
    setError('');

    try {
      const response = await fetch('/api/portal/onboarding/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: submission.userId,
          itemId: submission.itemId,
          status,
          reviewerId: user.uid,
          reviewerName: user.displayName || user.email,
          rejectionReason: reason,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || 'Failed to review submission');
      }

      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
      setRejectModal(null);
      setRejectionReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review submission');
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white">Onboarding Review</h1>
            <p className="text-white/60 text-sm mt-1">
              Review and approve onboarding submissions from new reps
            </p>
          </div>
          <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-medium">
            {submissions.length} pending
          </div>
        </div>

        {error && (
          <div className="bg-red-500/20 text-red-400 px-4 py-3 rounded-xl text-sm border border-red-500/30">
            {error}
          </div>
        )}

        {/* Queue */}
        {loading ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-white/10 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8dc63f] mx-auto"></div>
            <p className="mt-4 text-white/60">Loading submissions...</p>
          </div>
        ) : submissions.length === 0 ? (
          <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-12 border border-white/10 text-center">
            <div className="w-16 h-16 bg-[#8dc63f]/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-[#8dc63f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-white">All caught up!</h3>
            <p className="text-white/60 mt-1">No onboarding submissions to review right now.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {submissions.map((submission) => (
              <div
                key={submission.id}
                className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-[#0A1F44] border border-white/20 rounded-full flex items-center justify-center">
                        <span className="text-sm font-bold text-white">
                          {submission.userName?.charAt(0).toUpperCase() || 'U'}
                        </span>
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">{submission.userName}</h3>
                        <p className="text-xs text-white/50">{submission.userEmail}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
                      <div>
                        <p className="text-xs text-white/40 uppercase tracking-wider">Item</p>
                        <p className="font-medium text-white flex items-center gap-2">
                          {submission.itemLabel}
                          {submission.sensitive && (
                            <svg className="w-3.5 h-3.5 text-white/40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 uppercase tracking-wider">Category</p>
                        <p className="font-medium text-white">
                          {OnboardingCategoryLabels[submission.category] ?? submission.category}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 uppercase tracking-wider">Submitted</p>
                        <p className="font-medium text-white">{formatDate(submission.submittedAt)}</p>
                      </div>
                    </div>

                    {submission.reference && (
                      <div className="mt-3 p-2 bg-white/5 rounded-lg text-sm text-white/70">
                        <span className="font-medium text-white/90">Reference:</span>{' '}
                        {submission.reference}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 lg:flex-col lg:w-32">
                    <button
                      onClick={() => review(submission, 'approved')}
                      disabled={processingId === submission.id}
                      className="flex-1 lg:w-full px-4 py-2 bg-[#8dc63f] text-white rounded-lg font-medium hover:bg-[#7ab82e] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {processingId === submission.id ? (
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
                      onClick={() => setRejectModal(submission)}
                      disabled={processingId === submission.id}
                      className="flex-1 lg:w-full px-4 py-2 border border-red-400/50 text-red-400 rounded-lg font-medium hover:bg-red-500/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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

        {/* Rejection Modal */}
        {rejectModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Reject {rejectModal.itemLabel}
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                Provide a reason for rejection. This will be shared with{' '}
                {rejectModal.userName}.
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
                    setRejectModal(null);
                    setRejectionReason('');
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => review(rejectModal, 'rejected', rejectionReason)}
                  disabled={processingId === rejectModal.id || !rejectionReason.trim()}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
                >
                  {processingId === rejectModal.id ? 'Rejecting...' : 'Confirm Reject'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
