'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ElementType } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  LockKeyhole,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { OnboardingItem, OnboardingStatus, OnboardingStatusConfig, OnboardingCategoryLabels, OnboardingCategory } from '@/types';
import FileUpload from '@/components/onboarding/FileUpload';
import { isStorageItem, IMAGE_TYPES, DOC_TYPES } from '@/lib/onboarding/uploads';
import { isEsignItem, ESIGN_HELPER_TEXT } from '@/lib/onboarding/esign';

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

const statusStyle: Record<OnboardingStatus, string> = {
  not_started: 'border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-slate-600 dark:text-muted-foreground',
  submitted: 'border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300',
  approved: 'border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  rejected: 'border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 text-rose-700 dark:text-rose-300',
};

const statusIcon: Record<OnboardingStatus, ElementType> = {
  not_started: Clock3,
  submitted: RotateCcw,
  approved: CheckCircle2,
  rejected: AlertCircle,
};

export default function OnboardingPage() {
  const { user } = useAuth();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [submitModal, setSubmitModal] = useState<ChecklistItem | null>(null);
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // dl_photos requires both slots before the reference (shared folder path) is
  // set. Only read inside the setter's updater, so the value binding is unused.
  const [, setDlSlots] = useState<{ front: string; back: string }>({
    front: '',
    back: '',
  });

  const markDlSlot = (slot: 'front' | 'back', folderPath: string) => {
    setDlSlots((prev) => {
      const next = { ...prev, [slot]: folderPath };
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

  const handleSubmit = async () => {
    if (!user || !submitModal) return;
    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/portal/onboarding/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.uid, itemId: submitModal.id, reference, requestedBy: user.uid }),
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

  const grouped = (data?.items ?? []).reduce<Record<string, ChecklistItem[]>>((acc, item) => {
    (acc[item.category] = acc[item.category] || []).push(item);
    return acc;
  }, {});

  const progressPct =
    data && data.progress.total > 0
      ? Math.round((data.progress.approved / data.progress.total) * 100)
      : 0;

  return (
    <ProtectedRoute roles={['entry_rep', 'l1_manager', 'l2_manager']}>
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
              ) : (
                Object.entries(grouped).map(([category, items], groupIndex) => (
                  <section
                    key={category}
                    className={`space-y-3 portal-enter ${groupIndex === 0 ? 'portal-enter-2' : 'portal-enter-3'}`}
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-muted-foreground">
                        {OnboardingCategoryLabels[category as OnboardingCategory] ?? category}
                      </h2>
                      <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-500 dark:text-muted-foreground">
                        {items.filter((item) => item.status === 'approved').length}/{items.length}
                      </Badge>
                    </div>
                    <div className="grid gap-3">
                      {items.map((item) => {
                        const StatusIcon = statusIcon[item.status];
                        return (
                          <Card
                            key={item.id}
                            className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm transition-[border-color,transform,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:border-[#8dc63f]/60 hover:shadow-md motion-reduce:transform-none"
                          >
                            <CardContent className="p-5">
                              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex gap-4">
                                  <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-[#0A1F44] dark:text-foreground">
                                    {item.sensitive ? <LockKeyhole className="size-5" /> : <ClipboardCheck className="size-5" />}
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <h3 className="font-semibold text-slate-950 dark:text-foreground">{item.label}</h3>
                                      <Badge variant="outline" className={statusStyle[item.status]}>
                                        <StatusIcon className="mr-1 size-3" />
                                        {OnboardingStatusConfig[item.status].name}
                                      </Badge>
                                      {item.sensitive && (
                                        <Badge variant="outline" className="border-slate-200 dark:border-border text-slate-500 dark:text-muted-foreground">
                                          <ShieldCheck className="mr-1 size-3" />
                                          Secure reference only
                                        </Badge>
                                      )}
                                    </div>

                                    {item.status === 'submitted' && item.submittedAt && (
                                      <p className="mt-2 text-xs text-slate-500 dark:text-muted-foreground">
                                        Submitted {formatDate(item.submittedAt)} - awaiting review
                                      </p>
                                    )}
                                    {item.status === 'approved' && item.reviewedAt && (
                                      <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
                                        Approved {formatDate(item.reviewedAt)}
                                        {item.reviewerName ? ` by ${item.reviewerName}` : ''}
                                      </p>
                                    )}
                                    {item.status === 'rejected' && item.rejectionReason && (
                                      <div className="mt-3 rounded-md border border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
                                        <span className="font-medium">Reason:</span> {item.rejectionReason}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {(item.status === 'not_started' || item.status === 'rejected') && (
                                  <Button
                                    onClick={() => {
                                      setSubmitModal(item);
                                      setReference(item.reference ?? '');
                                      setDlSlots({ front: '', back: '' });
                                    }}
                                    className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
                                  >
                                    {item.status === 'rejected' ? 'Resubmit' : 'Submit'}
                                  </Button>
                                )}
                                {item.status === 'approved' && (
                                  <div className="flex size-9 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle2 className="size-5" />
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </main>
        </div>

        <Dialog open={!!submitModal} onOpenChange={(open) => {
          if (!open) {
            setSubmitModal(null);
            setReference('');
            setDlSlots({ front: '', back: '' });
          }
        }}>
          <DialogContent className="rounded-lg">
            <DialogHeader>
              <DialogTitle className="text-[#0A1F44] dark:text-foreground">
                Submit {submitModal?.label}
              </DialogTitle>
              <DialogDescription>
                {submitModal?.sensitive
                  ? 'Do not enter card numbers, SSNs, or account numbers. Provide a confirmation number, document name, or reviewer note only.'
                  : 'Add an optional note, document name, or confirmation number for the reviewer.'}
              </DialogDescription>
            </DialogHeader>
            {submitModal && isStorageItem(submitModal.id) ? (
              submitModal.id === 'dl_photos' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FileUpload
                    itemId="dl_photos"
                    slot="front"
                    label="Front of license"
                    accept="image/*"
                    allowedTypes={IMAGE_TYPES}
                    uploadUrl="/api/portal/onboarding/upload"
                    extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                    onUploaded={(path) => markDlSlot('front', path)}
                  />
                  <FileUpload
                    itemId="dl_photos"
                    slot="back"
                    label="Back of license"
                    accept="image/*"
                    allowedTypes={IMAGE_TYPES}
                    uploadUrl="/api/portal/onboarding/upload"
                    extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                    onUploaded={(path) => markDlSlot('back', path)}
                  />
                </div>
              ) : (
                <FileUpload
                  itemId={submitModal.id}
                  accept="image/*,application/pdf"
                  allowedTypes={DOC_TYPES}
                  uploadUrl="/api/portal/onboarding/upload"
                  extraFields={{ userId: user?.uid ?? '', requestedBy: user?.uid ?? '' }}
                  onUploaded={(path) => setReference(path)}
                />
              )
            ) : submitModal && isEsignItem(submitModal.id) ? (
              <div className="space-y-2">
                <Badge variant="outline" className="border-[#0A1F44]/30 bg-[#0A1F44]/5 dark:bg-slate-800 text-[#0A1F44] dark:text-foreground">
                  Adobe Sign
                </Badge>
                <p className="text-xs text-slate-500 dark:text-muted-foreground">{ESIGN_HELPER_TEXT}</p>
                <Input
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                  placeholder="Adobe Sign confirmation"
                  maxLength={500}
                />
              </div>
            ) : (
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Reference or note (optional)"
                maxLength={500}
              />
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setSubmitModal(null);
                  setReference('');
                  setDlSlots({ front: '', back: '' });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  submitting ||
                  (!!submitModal &&
                    isStorageItem(submitModal.id) &&
                    !reference.trim())
                }
                className="bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]"
              >
                {submitting ? 'Submitting...' : 'Submit for Review'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
