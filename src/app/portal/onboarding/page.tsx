'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ClipboardCheck } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { FieldRoles, OnboardingItem, OnboardingStatus } from '@/types';
import FileUpload from '@/components/onboarding/FileUpload';
import OnboardingWizard, { type WizardItem } from '@/components/onboarding/OnboardingWizard';
import { isStorageItem, IMAGE_TYPES, DOC_TYPES } from '@/lib/onboarding/uploads';

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

export default function OnboardingPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitModal, setSubmitModal] = useState<WizardItem | null>(null);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // dl_photos requires both slots before the reference (shared folder path) is
  // set. Only read inside the setter's updater, so the value binding is unused.
  const [, setDlSlots] = useState<{ front: string; back: string }>({
    front: '',
    back: '',
  });

  const markDlSlot = (slot: 'front' | 'back', folderPath: string, reset = false) => {
    setDlSlots((prev) => {
      const base = reset ? { front: '', back: '' } : prev;
      const next = { ...base, [slot]: folderPath };
      setReference(next.front && next.back ? folderPath : '');
      return next;
    });
  };

  const fetchChecklist = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(
        `/api/portal/onboarding?userId=${user.uid}&requestedBy=${user.uid}`
      );
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load checklist');
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

  const handleSubmit = async (
    item: WizardItem | null = submitModal,
    submittedReference = reference
  ) => {
    if (!user || !item) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/portal/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.uid,
          itemId: item.id,
          reference: submittedReference,
          requestedBy: user.uid,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to submit');

      setSubmitModal(null);
      setReference('');
      setDlSlots({ front: '', back: '' });
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

  const progressPct =
    data && data.progress.total > 0
      ? Math.round((data.progress.approved / data.progress.total) * 100)
      : 0;

  const getDraftReference = (item: WizardItem) =>
    submitModal?.id === item.id ? reference : item.reference ?? '';

  const startSubmission = (item: WizardItem, nextReference = item.reference ?? '') => {
    if (submitModal?.id !== item.id) {
      setSubmitModal(item);
      setReference(nextReference);
      setDlSlots({ front: '', back: '' });
      return;
    }

    setReference(nextReference);
  };

  const renderItemAction = (item: WizardItem) => {
    if (item.status === 'approved') {
      return (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-medium text-foreground">
            <CheckCircle2 className="size-4 text-primary" />
            Approved
          </div>
          {item.reviewedAt && (
            <p className="mt-1">
              Completed {formatDate(item.reviewedAt)}
              {item.reviewerName ? ` by ${item.reviewerName}` : ''}.
            </p>
          )}
        </div>
      );
    }

    if (item.status === 'submitted') {
      return (
        <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
          This item has been submitted and is waiting for manager review.
        </div>
      );
    }

    const draftReference = getDraftReference(item);
    const buttonLabel = item.status === 'rejected' ? 'Resubmit for Review' : 'Submit for Review';

    if (isStorageItem(item.id)) {
      return (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-muted p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 font-medium text-foreground">
              <ClipboardCheck className="size-4 text-primary" />
              Upload the requested file, then submit it for review.
            </div>
            {item.sensitive && (
              <p className="mt-1">
                Do not enter card numbers, SSNs, or account numbers. The app stores a secure
                reference only.
              </p>
            )}
          </div>

          {item.id === 'dl_photos' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FileUpload
                itemId="dl_photos"
                slot="front"
                label="Front of license"
                accept="image/*"
                allowedTypes={IMAGE_TYPES}
                uploadUrl="/api/portal/onboarding/upload"
                extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                onUploaded={(path) => {
                  const isNewSubmission = submitModal?.id !== item.id;
                  if (isNewSubmission) setSubmitModal(item);
                  markDlSlot('front', path, isNewSubmission);
                }}
              />
              <FileUpload
                itemId="dl_photos"
                slot="back"
                label="Back of license"
                accept="image/*"
                allowedTypes={IMAGE_TYPES}
                uploadUrl="/api/portal/onboarding/upload"
                extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                onUploaded={(path) => {
                  const isNewSubmission = submitModal?.id !== item.id;
                  if (isNewSubmission) setSubmitModal(item);
                  markDlSlot('back', path, isNewSubmission);
                }}
              />
            </div>
          ) : (
            <FileUpload
              itemId={item.id}
              accept="image/*,application/pdf"
              allowedTypes={DOC_TYPES}
              uploadUrl="/api/portal/onboarding/upload"
              extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
              onUploaded={(path) => startSubmission(item, path)}
            />
          )}

          <Button
            type="button"
            onClick={() => handleSubmit(item, draftReference)}
            disabled={submitting || !draftReference.trim()}
            className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
          >
            {submitting && submitModal?.id === item.id ? 'Submitting...' : buttonLabel}
          </Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            {item.sensitive
              ? 'Do not enter card numbers, SSNs, or account numbers. Provide a confirmation number, document name, or reviewer note only.'
              : 'Add an optional note, document name, or confirmation number for the reviewer.'}
          </p>
          <Input
            value={draftReference}
            onFocus={() => {
              if (submitModal?.id !== item.id) startSubmission(item);
            }}
            onChange={(event) => startSubmission(item, event.target.value)}
            placeholder="Reference or note (optional)"
            maxLength={500}
          />
        </div>
        <Button
          type="button"
          onClick={() => handleSubmit(item, draftReference)}
          disabled={submitting}
          className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
        >
          {submitting && submitModal?.id === item.id ? 'Submitting...' : buttonLabel}
        </Button>
      </div>
    );
  };

  return (
    <ProtectedRoute roles={Object.values(FieldRoles)}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <PortalPageHeader
                eyebrow="Field readiness"
                title="My Onboarding"
                description={`Complete each clearance item before moving into active selling.${
                  data?.isIBO ? ' IBO business items are included.' : ''
                }`}
                stats={
                  <div className="grid min-w-[220px] gap-2 rounded-lg border border-white/15 bg-white/5 p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-white/70">Approved</span>
                      <span className="font-semibold text-white">
                        {data ? `${data.progress.approved}/${data.progress.total}` : '--'}
                      </span>
                    </div>
                    <Progress value={progressPct} className="h-2 bg-white/15" />
                    <p className="text-xs text-white/60">
                      {data?.progress.complete ? 'Clearance complete' : `${progressPct}% ready`}
                    </p>
                  </div>
                }
              />

              {error && (
                <Alert className="border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300">
                  <AlertCircle className="size-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loading ? (
                <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                  <CardContent className="space-y-4 p-5">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ) : data ? (
                <OnboardingWizard
                  items={data.items}
                  progress={data.progress}
                  renderItemAction={renderItemAction}
                />
              ) : (
                <Card className="portal-enter portal-enter-2 rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                  <CardContent className="p-5 text-sm text-muted-foreground">
                    No onboarding checklist is available.
                  </CardContent>
                </Card>
              )}
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
