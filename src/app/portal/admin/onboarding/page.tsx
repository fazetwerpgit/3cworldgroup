'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Lock, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { OnboardingCategory, OnboardingCategoryLabels } from '@/types';

interface Submission {
  id: string;
  userId: string;
  itemId: string;
  itemLabel: string;
  category: OnboardingCategory;
  sensitive: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  reference: string | null;
  files: { name: string; url: string; contentType: string }[];
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
    if (!user) return;
    try {
      const response = await fetch(
        `/api/portal/onboarding/review?requestedBy=${user.uid}`
      );
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
  }, [user]);

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
      <div className="mx-auto max-w-[1500px] space-y-5">
        <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
                Onboarding Review
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">
                Review submitted onboarding items before reps move forward in the website-driven onboarding flow.
              </p>
            </div>
            <Badge
              variant="outline"
              className="w-fit rounded-md border-amber-200 bg-amber-50 px-3 py-1 text-amber-700"
            >
              {submissions.length} pending
            </Badge>
          </div>
        </section>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <Card className="rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm">
            <CardContent className="py-8">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-[#8dc63f]" />
              <p className="mt-4 text-sm text-slate-500">Loading submissions...</p>
            </CardContent>
          </Card>
        ) : submissions.length === 0 ? (
          <Card className="rounded-lg border-slate-200 bg-white py-0 text-center shadow-sm">
            <CardContent className="py-12">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#8dc63f]/10 text-[#4f7f1e]">
                <Check className="h-6 w-6" />
              </div>
              <h3 className="font-semibold text-slate-950">Review queue is clear</h3>
              <p className="mt-1 text-sm text-slate-500">
                No onboarding submissions need review right now.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {submissions.map((submission) => (
              <Card
                key={submission.id}
                className="rounded-lg border-slate-200 bg-white py-0 shadow-sm transition-colors hover:border-slate-300"
              >
                <CardContent className="p-5">
                  <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#0A1F44] text-sm font-semibold text-white">
                          {submission.userName?.charAt(0).toUpperCase() || 'U'}
                        </div>
                        <div className="min-w-0">
                          <h3 className="truncate font-semibold text-slate-950">
                            {submission.userName}
                          </h3>
                          <p className="truncate text-xs text-slate-500">
                            {submission.userEmail}
                          </p>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Item
                          </p>
                          <p className="mt-1 flex items-center gap-2 font-medium text-slate-950">
                            {submission.itemLabel}
                            {submission.sensitive && (
                              <Lock className="h-3.5 w-3.5 text-slate-400" />
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Category
                          </p>
                          <p className="mt-1 font-medium text-slate-950">
                            {OnboardingCategoryLabels[submission.category] ??
                              submission.category}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                            Submitted
                          </p>
                          <p className="mt-1 font-medium text-slate-950">
                            {formatDate(submission.submittedAt)}
                          </p>
                        </div>
                      </div>

                      {submission.referenceKind === 'storage' ? (
                        submission.files.length > 0 ? (
                          <div className="mt-4 flex flex-wrap gap-3">
                            {submission.files.map((file) => (
                              <a
                                key={file.name}
                                href={file.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block"
                              >
                                {file.contentType.startsWith('image/') ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={file.url}
                                    alt={file.name}
                                    className="h-24 w-36 rounded-md border border-slate-200 object-cover"
                                  />
                                ) : (
                                  <span className="flex h-24 w-36 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
                                    {file.name}
                                  </span>
                                )}
                              </a>
                            ))}
                            <p className="w-full text-xs text-slate-400">Links expire in 15 minutes.</p>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">
                            No files found at {submission.reference ?? 'this reference'}.
                          </div>
                        )
                      ) : (
                        submission.reference && (
                          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                            <span className="font-medium text-slate-950">Reference:</span>{' '}
                            {submission.reference}
                          </div>
                        )
                      )}
                    </div>

                    <div className="flex items-center gap-2 lg:w-32 lg:flex-col">
                      <Button
                        type="button"
                        onClick={() => review(submission, 'approved')}
                        disabled={processingId === submission.id}
                        className="flex-1 bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e] lg:w-full"
                      >
                        {processingId === submission.id ? (
                          <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                        ) : (
                          <>
                            <Check className="h-4 w-4" />
                            Approve
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setRejectModal(submission)}
                        disabled={processingId === submission.id}
                        className="flex-1 border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 lg:w-full"
                      >
                        <X className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {rejectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <Card className="w-full max-w-md rounded-lg border-slate-200 bg-white py-0 shadow-lg">
              <CardHeader className="border-b border-slate-100 p-5">
                <h3 className="text-lg font-semibold text-slate-950">
                  Reject {rejectModal.itemLabel}
                </h3>
                <p className="text-sm text-slate-600">
                  Provide a reason for rejection. This will be shared with{' '}
                  {rejectModal.userName}.
                </p>
              </CardHeader>
              <CardContent className="p-5">
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Enter rejection reason..."
                  rows={3}
                />
                <div className="mt-4 flex gap-3">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setRejectModal(null);
                      setRejectionReason('');
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => review(rejectModal, 'rejected', rejectionReason)}
                    disabled={processingId === rejectModal.id || !rejectionReason.trim()}
                    className="flex-1 bg-red-600 text-white hover:bg-red-700"
                  >
                    {processingId === rejectModal.id ? 'Rejecting...' : 'Confirm Reject'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
