'use client';

import { useCallback, useEffect, useState } from 'react';
import { LoaderCircle, RotateCw } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RepBoot, RepShell } from '@/components/portal/rep/RepShell';
import { Attachment, FormAlert } from '@/components/portal/rep/RepForm';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import o from '@/components/onboarding/onboarding.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { FieldRoles, OnboardingItem, OnboardingStatus } from '@/types';
import MemberLineOnboardingBoard from '@/components/onboarding/MemberLineOnboardingBoard';
import type { WizardItem } from '@/components/onboarding/OnboardingWizard';
import { isStorageItem, IMAGE_TYPES, DOC_TYPES } from '@/lib/onboarding/uploads';
import { uploadFormAttachment } from '@/lib/forms/uploadFormAttachment';

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

function OnboardingChecklist() {
  const { user } = useAuth();
  const [data, setData] = useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // loadError: the checklist itself failed. error: a submit failed (shown in the sheet).
  const [loadError, setLoadError] = useState(false);
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
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchChecklist();
  }, [fetchChecklist]);

  const retryLoad = () => {
    setLoading(true);
    void fetchChecklist();
  };

  // The upload is multipart: send only Authorization and let fetch set the
  // Content-Type boundary itself. userId is the TARGET whose folder is written.
  const uploadFile = (item: WizardItem, file: File, allowedTypes: string[], slot?: string) =>
    uploadFormAttachment({
      file,
      itemId: item.id,
      slot,
      uploadUrl: '/api/portal/onboarding/upload',
      fields: { userId: user?.uid ?? '' },
      allowedTypes,
      getHeaders: () => authHeaders(),
    });

  const handleSubmit = async (item: WizardItem | null = submitModal, submittedReference = reference) => {
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

  const getDraftReference = (item: WizardItem) => (submitModal?.id === item.id ? reference : (item.reference ?? ''));

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
      return <p className={o.note}>Submitted. Your manager is reviewing it.</p>;
    }

    const draftReference = getDraftReference(item);
    const buttonLabel = item.status === 'rejected' ? 'Resubmit for review' : 'Submit for review';
    const busy = submitting && submitModal?.id === item.id;
    const sendError = error && submitModal?.id === item.id ? <FormAlert message={error} /> : null;
    const submitButton = (disabled: boolean) => (
      <button
        type="button"
        onClick={() => handleSubmit(item, draftReference)}
        disabled={disabled}
        className={`${s.btnPrimary} ${o.submit}`}
      >
        {busy ? (
          <>
            <LoaderCircle size={18} className={f.spin} aria-hidden="true" />
            Submitting
          </>
        ) : (
          buttonLabel
        )}
      </button>
    );

    if (isStorageItem(item.id)) {
      // Sensitive documents (license, W-9) never show a thumbnail or a View link.
      return (
        <>
          <p className={o.note}>
            <strong>Upload, then submit</strong>
            {item.id === 'dl_photos'
              ? 'Add both sides of your license, then submit it for review.'
              : 'Add the requested file, then submit it for review.'}
            {item.sensitive
              ? ' Never type card numbers, SSNs or account numbers. The app stores a secure reference only.'
              : ''}
          </p>

          {item.id === 'dl_photos' ? (
            <div className={o.slots}>
              <Attachment
                id="dl-front"
                label="Front of license"
                accept="image/*"
                kinds="Photo"
                preview={false}
                upload={(file) => uploadFile(item, file, IMAGE_TYPES, 'front')}
                onUploaded={(path) => {
                  const isNewSubmission = submitModal?.id !== item.id;
                  if (isNewSubmission) setSubmitModal(item);
                  markDlSlot('front', path, isNewSubmission);
                }}
              />
              <Attachment
                id="dl-back"
                label="Back of license"
                accept="image/*"
                kinds="Photo"
                preview={false}
                upload={(file) => uploadFile(item, file, IMAGE_TYPES, 'back')}
                onUploaded={(path) => {
                  const isNewSubmission = submitModal?.id !== item.id;
                  if (isNewSubmission) setSubmitModal(item);
                  markDlSlot('back', path, isNewSubmission);
                }}
              />
            </div>
          ) : (
            <Attachment
              id={`upload-${item.id}`}
              label={item.label}
              accept="image/*,application/pdf"
              preview={!item.sensitive}
              upload={(file) => uploadFile(item, file, DOC_TYPES)}
              onUploaded={(path) => startSubmission(item, path)}
            />
          )}

          {sendError}
          {submitButton(submitting || !draftReference.trim())}
        </>
      );
    }

    return (
      <>
        <div className={f.field}>
          <label htmlFor={`reference-${item.id}`} className={f.label}>
            Reference or note
            <span className={f.req}>Optional</span>
          </label>
          <input
            id={`reference-${item.id}`}
            className={f.input}
            value={draftReference}
            onFocus={() => {
              if (submitModal?.id !== item.id) startSubmission(item);
            }}
            onChange={(event) => startSubmission(item, event.target.value)}
            maxLength={500}
            autoComplete="off"
            aria-describedby={`reference-${item.id}-hint`}
          />
          <p id={`reference-${item.id}-hint`} className={f.hint}>
            {item.sensitive
              ? 'A confirmation number, document name or note for the reviewer. Never card numbers, SSNs or account numbers.'
              : 'A note, document name or confirmation number for the reviewer.'}
          </p>
        </div>
        {sendError}
        {submitButton(submitting)}
      </>
    );
  };

  return (
    <>
      <header className={f.hubHead}>
        <h1 className={f.hubTitle}>Onboarding</h1>
      </header>
      <p className={f.hubLede}>Finish each item. Your manager reviews every one.</p>

      <div className={f.hubWrap}>
        <div>
          {loading ? (
            <div className={s.panel} aria-busy="true" aria-label="Loading your checklist">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={o.skelRow}>
                  <span className={s.skel} style={{ width: 72, height: 12 }} />
                  <span className={s.skel} style={{ width: '55%', height: 18 }} />
                  <span className={s.skel} style={{ width: '80%', height: 14 }} />
                </div>
              ))}
            </div>
          ) : loadError && !data ? (
            <div className={`${s.panel} ${s.failed}`} role="alert">
              <span>Couldn&apos;t load your checklist</span>
              <button type="button" className={s.retry} onClick={retryLoad}>
                <RotateCw size={14} aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : data?.items?.length ? (
            <MemberLineOnboardingBoard
              memberLabel={user?.displayName || 'you'}
              items={data.items}
              progress={data.progress ?? { approved: 0, total: 0, complete: false }}
              renderItemAction={renderItemAction}
              openItemId={openItemId}
              onOpenItem={(id) => {
                setOpenItemId(id);
                setError('');
              }}
              onRefresh={fetchChecklist}
            />
          ) : (
            <p className={`${s.panel} ${o.empty}`}>No onboarding items for your account yet. Your manager adds them.</p>
          )}
        </div>

        <aside className={`${s.panel} ${f.aside} ${f.hubAside}`} aria-labelledby="onboarding-how-h">
          <h2 id="onboarding-how-h" className={s.kicker}>
            How to finish an item
          </h2>
          <div className={o.asideItem}>
            <h3>Upload</h3>
            <p>PNG, JPG or PDF, 4 MB max. Your license has a front and a back slot.</p>
          </div>
          <div className={o.asideItem}>
            <h3>E-sign</h3>
            <p>Tap Sign now on the item. It completes by itself after you sign.</p>
          </div>
          <div className={o.asideItem}>
            <h3>Keep numbers out</h3>
            <p>Never type an SSN, card or account number on this page.</p>
          </div>
        </aside>
      </div>
    </>
  );
}

export default function OnboardingPage() {
  return (
    <RepShell>
      <ProtectedRoute roles={Object.values(FieldRoles)} fallback={<RepBoot />}>
        <OnboardingChecklist />
      </ProtectedRoute>
    </RepShell>
  );
}
