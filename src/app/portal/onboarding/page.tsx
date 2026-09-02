'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ClipboardCheck } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MemberLineShell } from '@/components/member/MemberLine';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-rep-b.css';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
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
  esignDispatch: { state?: string; attempts?: number } | null;
  esignSigningUrl: string | null;
}

interface ChecklistResponse {
  items: ChecklistItem[];
  fieldRole: string | null;
  isIBO: boolean;
  progress: { approved: number; total: number; complete: boolean };
}

// The onboarding routes verify the caller from the ID token and allow self or
// management. userId stays on the wire as the TARGET — whose checklist is read,
// whose item is submitted, whose storage folder is written.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
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
      const response = await fetch(`/api/portal/onboarding?userId=${user.uid}`, {
        headers: await authHeaders(),
      });
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

  // The upload is multipart — send only Authorization and let fetch set the
  // Content-Type boundary itself.
  const uploadHeaders = useCallback(async () => authHeaders(), []);

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
        headers: await authHeaders(true),
        body: JSON.stringify({
          userId: user.uid,
          itemId: item.id,
          reference: submittedReference,
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
                extraFields={{ userId: user?.uid ?? '' }}
                getHeaders={uploadHeaders}
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
                extraFields={{ userId: user?.uid ?? '' }}
                getHeaders={uploadHeaders}
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
              extraFields={{ userId: user?.uid ?? '' }}
              getHeaders={uploadHeaders}
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

  const total = data?.progress?.total ?? 0;
  const approved = data?.progress?.approved ?? 0;

  return (
    <ProtectedRoute roles={Object.values(FieldRoles)}>
      <MemberLineShell>
        <PageTitle title="My Onboarding" meta={`${approved} of ${total} complete`} />

        {error && (
          <div className="member-line-note warn" style={{ marginTop: 16 }}>
            <AlertCircle className="mr-1.5 inline size-3.5" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="member-line-panel grid gap-3">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : data?.items?.length ? (
          <div className="member-line-arena">
            <MemberLineOnboardingBoard
              memberLabel={user?.displayName || 'Member'}
              items={data.items}
              progress={data.progress ?? { approved: 0, total: 0, complete: false }}
              renderItemAction={renderItemAction}
              openItemId={openItemId}
              onOpenItem={setOpenItemId}
              onRefresh={fetchChecklist}
            />
            <aside className="member-line-stack">
              <section className="member-line-panel">
                <h2 style={{ margin: '0 0 14px', fontFamily: 'var(--font-archivo, "Archivo"), var(--font-sans, system-ui), Arial, sans-serif', fontWeight: 700, fontSize: 22 }}>
                  How to finish an item
                </h2>
                <div className="member-line-note">
                  <strong style={{ color: 'var(--member-line-lime)' }}>Upload</strong>
                  <br />
                  PNG / JPG / PDF · 4 MB max. License has front + back slots.
                </div>
                <div className="member-line-note warn" style={{ marginTop: 10 }}>
                  <strong style={{ color: 'var(--member-line-gold)' }}>E-sign</strong>
                  <br />
                  Check your email for the signing link. This completes automatically after you sign.
                </div>
              </section>
              <section className="member-line-panel">
                <h2 style={{ margin: 0, fontFamily: 'var(--font-archivo, "Archivo"), var(--font-sans, system-ui), Arial, sans-serif', fontWeight: 700, fontSize: 22 }}>
                  Keep sensitive data out of this page.
                </h2>
                <p className="member-line-sub">Never type raw SSN or card numbers here.</p>
              </section>
            </aside>
          </div>
        ) : (
          <Alert className="member-line-empty-card">
            <AlertDescription>No onboarding items for your account.</AlertDescription>
          </Alert>
        )}
      </MemberLineShell>
    </ProtectedRoute>
  );
}
