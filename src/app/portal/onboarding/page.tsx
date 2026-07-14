'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ClipboardCheck } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MemberLineShell, MemberLineMasthead, MemberLineSectionIndex } from '@/components/member/MemberLine';
import { useAuth } from '@/contexts/AuthContext';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FieldRoles, OnboardingItem, OnboardingStatus } from '@/types';
import FileUpload from '@/components/onboarding/FileUpload';
import MemberLineOnboardingBoard from '@/components/onboarding/MemberLineOnboardingBoard';
import type { WizardItem } from '@/components/onboarding/OnboardingWizard';
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
  const [openItemId, setOpenItemId] = useState<string | null>(null);
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
      setOpenItemId(null);
      await fetchChecklist();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

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
    if (item.status === 'submitted') {
      return (
        <div className="member-line-note">
          This item has been submitted and is waiting for manager review.
        </div>
      );
    }

    const draftReference = getDraftReference(item);
    const buttonLabel = item.status === 'rejected' ? 'Resubmit for review' : 'Submit for review';

    if (isStorageItem(item.id)) {
      return (
        <div className="grid gap-3">
          <div className="member-line-note">
            <ClipboardCheck className="mr-1.5 inline size-3.5" />
            Upload the requested file, then submit it for review.
            {item.sensitive && (
              <>
                <br />
                Do not enter card numbers, SSNs, or account numbers. The app stores a secure
                reference only.
              </>
            )}
          </div>

          {item.id === 'dl_photos' ? (
            <div className="grid gap-2 sm:grid-cols-2">
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
      <div className="grid gap-3">
        <p className="member-line-sub">
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

  const total = data?.progress.total ?? 0;
  const approved = data?.progress.approved ?? 0;
  const remaining = total - approved;
  const reviewCount = data?.items.filter((i) => i.status === 'submitted').length ?? 0;
  const attentionCount = data?.items.filter((i) => i.status === 'rejected').length ?? 0;
  const todoCount = data?.items.filter((i) => i.status === 'not_started').length ?? 0;

  return (
    <ProtectedRoute roles={Object.values(FieldRoles)}>
      <MemberLineShell>
        <MemberLineMasthead
          kicker="onboarding broadcast / live board"
          headingLead={`${remaining} line${remaining === 1 ? '' : 's'} open.`}
          headingRest={`${approved} ${approved === 1 ? 'is' : 'are'} clear.`}
          intro={`The full ${total || ''}-item board stays in frame. Read the state, take the next action, move the signal forward.${
            data?.isIBO ? ' IBO business items are included.' : ''
          }`}
          numeral={remaining}
          numeralAriaLabel={`${remaining} items left`}
          tools={
            <>
              <span className="member-line-chip lime">
                {approved} approved / {total} total
              </span>
              <span className="member-line-chip">
                {reviewCount} review / {attentionCount} attention / {todoCount} to do
              </span>
            </>
          }
        />

        {error && (
          <div className="member-line-note warn" style={{ marginTop: 16 }}>
            <AlertCircle className="mr-1.5 inline size-3.5" />
            {error}
          </div>
        )}

        <MemberLineSectionIndex index="01" label="live onboarding board" />

        {loading ? (
          <div className="member-line-panel grid gap-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : data ? (
          <div className="member-line-arena">
            <MemberLineOnboardingBoard
              memberLabel={user?.displayName || 'Member'}
              items={data.items}
              progress={data.progress}
              renderItemAction={renderItemAction}
              openItemId={openItemId}
              onOpenItem={setOpenItemId}
            />
            <aside className="member-line-stack">
              <section className="member-line-panel">
                <p className="member-line-eyebrow">02 / action type</p>
                <h2 style={{ margin: '8px 0 14px', fontFamily: 'var(--member-line-serif)', fontWeight: 600, fontSize: 22 }}>
                  Upload or e-sign.
                </h2>
                <div className="member-line-note">
                  <strong style={{ color: 'var(--member-line-lime)' }}>UPLOAD</strong>
                  <br />
                  PNG / JPG / PDF · 4 MB max. License has front + back slots.
                </div>
                <div className="member-line-note warn" style={{ marginTop: 10 }}>
                  <strong style={{ color: 'var(--member-line-gold)' }}>E-SIGN</strong>
                  <br />
                  Check your email for the signing link — this completes automatically after you sign.
                </div>
              </section>
              <section className="member-line-panel">
                <p className="member-line-eyebrow">03 / sensitive items</p>
                <h2 style={{ margin: '8px 0 0', fontFamily: 'var(--member-line-serif)', fontWeight: 600, fontSize: 22 }}>
                  Keep raw data off-air.
                </h2>
                <p className="member-line-sub">Never type raw SSN or card numbers here.</p>
              </section>
            </aside>
          </div>
        ) : (
          <Alert className="border-rose-200 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 text-rose-800 dark:text-rose-300">
            <AlertDescription>No onboarding checklist is available.</AlertDescription>
          </Alert>
        )}
      </MemberLineShell>
    </ProtectedRoute>
  );
}
