'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MemberLineShell } from '@/components/member/MemberLine';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-rep-b.css';
import { Skeleton } from '@/components/ui/skeleton';
import PdfPages from '@/components/esign/PdfPages';
import SignaturePad from '@/components/esign/SignaturePad';
import {
  clearSignature,
  loadSignature,
  saveSignature,
  type SignatureMethod,
  type StoredSignature,
} from '@/components/esign/signatureStore';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { ESIGN_CONSENT_TEXT } from '@/lib/esign/documents';
import { FieldRoles } from '@/types';
import styles from './sign-page.module.css';

/** Mirrors the envelope route's response (`EnvelopeView`). */
interface EnvelopeFieldView {
  key: string;
  type: 'text' | 'checkbox';
  label: string;
  required: boolean;
  sensitive: boolean;
  value: string | boolean;
  prefilled: boolean;
  page: number;
}

interface EnvelopeView {
  envelopeId: string;
  docKey: string;
  name: string;
  status: 'sent' | 'completed';
  pageCount: number;
  signerName: string;
  signerEmail: string;
  fields: EnvelopeFieldView[];
}

type FieldValues = Record<string, string | boolean>;

/**
 * The server's one-of rules, mirrored here only so the Sign button can say what
 * is missing before the round trip. `validateFields` on the server stays the
 * authority; this never lets anything through that it would reject.
 */
const ONE_OF_RULES: Record<string, { keys: string[]; message: string }[]> = {
  w9: [
    { keys: ['ssn', 'ein'], message: 'Enter either an SSN or an EIN, not both.' },
    { keys: ['individual_sole_prop', 'llc'], message: 'Choose a tax classification.' },
  ],
  direct_deposit: [{ keys: ['checking', 'savings'], message: 'Choose checking or savings.' }],
};

const NUMERIC_KEYBOARD_FIELDS = new Set([
  'ssn',
  'ein',
  'routing_number',
  'account_number',
  'cell_phone',
  'office_phone',
]);

function isFilled(value: string | boolean | undefined): boolean {
  return typeof value === 'boolean' ? value : String(value ?? '').trim().length > 0;
}

function inputModeFor(key: string): 'numeric' | 'email' | 'text' {
  if (NUMERIC_KEYBOARD_FIELDS.has(key)) return 'numeric';
  if (key === 'email') return 'email';
  return 'text';
}

export default function EsignSignPage() {
  const { envelopeId } = useParams<{ envelopeId: string }>();

  const [envelope, setEnvelope] = useState<EnvelopeView | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState<StoredSignature | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState('');

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await getIdToken();
    return { Authorization: `Bearer ${token ?? ''}` };
  }, []);

  // sessionStorage only exists in the browser, so read it after mount rather
  // than in the initial state (which also runs during prerender).
  useEffect(() => {
    setSignature(loadSignature());
  }, []);

  useEffect(() => {
    if (!envelopeId) return;
    let cancelled = false;

    const load = async () => {
      const response = await fetch(`/api/portal/onboarding/esign/envelope/${envelopeId}`, {
        headers: await authHeaders(),
        cache: 'no-store',
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const detail = (payload as { error?: string } | null)?.error;
        throw new Error(detail || 'We could not open this document.');
      }
      if (cancelled) return;

      const view = payload as EnvelopeView;
      setEnvelope(view);
      setValues(Object.fromEntries(view.fields.map((field) => [field.key, field.value])));
      if (view.status === 'completed') setCompleted(true);
    };

    setLoading(true);
    void load()
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : 'We could not open this document.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [envelopeId, authHeaders]);

  const setFieldValue = (key: string, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  // The pad reports a new PNG (or null when cleared); keep it for the next
  // document in the set so a rep signs once, not five times.
  const handleSignatureChange = useCallback((png: string | null, method: SignatureMethod) => {
    if (!png) {
      setSignature(null);
      clearSignature();
      return;
    }
    const next: StoredSignature = { png, method };
    setSignature(next);
    saveSignature(next);
  }, []);

  /** The one thing still standing between the rep and a signed document. */
  const blocker = useMemo(() => {
    if (!envelope) return 'Loading this document.';
    for (const field of envelope.fields) {
      if (field.type === 'text' && field.required && !isFilled(values[field.key])) {
        return `Fill in ${field.label.toLowerCase()}.`;
      }
    }
    for (const rule of ONE_OF_RULES[envelope.docKey] ?? []) {
      if (rule.keys.filter((key) => isFilled(values[key])).length !== 1) return rule.message;
    }
    if (!signature) return 'Add your signature.';
    if (!consent) return 'Read and accept the statement above.';
    return null;
  }, [envelope, values, signature, consent]);

  const submit = async () => {
    if (!envelope || !signature || blocker) return;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/portal/onboarding/esign/sign', {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          envelopeId,
          fields: values,
          signaturePng: signature.png,
          signatureMethod: signature.method,
          consent: true,
        }),
      });
      // 409 means this envelope was already signed - the rep is done either way.
      if (response.ok || response.status === 409) {
        setCompleted(true);
        return;
      }
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || 'We could not complete the signature.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'We could not complete the signature.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderField = (field: EnvelopeFieldView) => {
    if (field.type === 'checkbox') {
      return (
        <label key={field.key} className={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={values[field.key] === true}
            onChange={(event) => setFieldValue(field.key, event.target.checked)}
          />
          <span>{field.label}</span>
        </label>
      );
    }

    // Prefilled values come from the rep's own profile; they stay read-only
    // until the rep asks to change them, so a stray tap cannot blank a name.
    const readOnly = field.prefilled && !unlocked[field.key];
    return (
      <div key={field.key} className={styles.field}>
        <label className={styles.fieldLabel} htmlFor={`esign-${field.key}`}>
          <span>
            {field.label}
            {field.required ? '' : ' (optional)'}
          </span>
          {readOnly && (
            <button
              type="button"
              className={styles.editButton}
              onClick={() => setUnlocked((current) => ({ ...current, [field.key]: true }))}
            >
              Edit
            </button>
          )}
        </label>
        <input
          id={`esign-${field.key}`}
          className={styles.input}
          value={String(values[field.key] ?? '')}
          readOnly={readOnly}
          onChange={(event) => setFieldValue(field.key, event.target.value)}
          inputMode={inputModeFor(field.key)}
          autoComplete="off"
          autoCapitalize={field.sensitive ? 'off' : 'sentences'}
          spellCheck={field.sensitive ? false : undefined}
          maxLength={200}
        />
        {field.sensitive && (
          <p className={styles.hint}>Written into this signed document only. Never saved to your profile.</p>
        )}
      </div>
    );
  };

  return (
    <ProtectedRoute roles={Object.values(FieldRoles)}>
      <MemberLineShell>
        <div className={styles.page}>
          <PageTitle
            title={envelope?.name ?? 'Sign document'}
            back={
              <Link href="/portal/onboarding" className="member-line-sub">
                Back to checklist
              </Link>
            }
            subtitle={completed ? undefined : 'Read the document, fill in what is missing, then sign.'}
          />

          {error && (
            <div className="member-line-note warn" role="alert" style={{ marginTop: 16 }}>
              <AlertCircle className="mr-1.5 inline size-3.5" />
              {error}
            </div>
          )}

          {completed ? (
            <section className="member-line-panel" style={{ marginTop: 18 }}>
              <div className={styles.done}>
                <h2 className={styles.sectionTitle}>
                  <CheckCircle2 className="mr-2 inline size-5 text-[#5a8f1f]" />
                  Signed. This document is complete.
                </h2>
                <p className="member-line-sub">
                  Your checklist already shows it approved. Nothing else is needed here.
                </p>
                <Link href="/portal/onboarding" className={styles.doneLink}>
                  Back to checklist
                </Link>
              </div>
            </section>
          ) : loading ? (
            <div className="member-line-panel grid gap-3" style={{ marginTop: 18 }}>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : envelope ? (
            <>
              <section className={`member-line-panel ${styles.section}`}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Read</h2>
                  <span className={styles.step}>
                    Step 1 · {envelope.pageCount} {envelope.pageCount === 1 ? 'page' : 'pages'}
                  </span>
                </div>
                <div className={styles.pages}>
                  <PdfPages
                    src={`/api/portal/onboarding/esign/envelope/${envelopeId}/pdf`}
                    authHeaders={authHeaders}
                  />
                </div>
              </section>

              {envelope.fields.length > 0 && (
                <section className={`member-line-panel ${styles.section}`}>
                  <div className={styles.sectionHead}>
                    <h2 className={styles.sectionTitle}>Fill</h2>
                    <span className={styles.step}>Step 2</span>
                  </div>
                  <div className={styles.fields}>{envelope.fields.map(renderField)}</div>
                </section>
              )}

              <section className={`member-line-panel ${styles.section}`}>
                <div className={styles.sectionHead}>
                  <h2 className={styles.sectionTitle}>Sign</h2>
                  <span className={styles.step}>
                    Step {envelope.fields.length > 0 ? 3 : 2}
                  </span>
                </div>
                <SignaturePad
                  value={signature}
                  signerName={envelope.signerName}
                  onChange={handleSignatureChange}
                />
                <label className={styles.consent}>
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(event) => setConsent(event.target.checked)}
                  />
                  <span>{ESIGN_CONSENT_TEXT}</span>
                </label>
              </section>

              <div className={styles.signBar}>
                <p className={styles.hint}>
                  {submitting ? 'Applying your signature...' : blocker ?? 'Ready to sign.'}
                </p>
                <button
                  type="button"
                  className={styles.signButton}
                  onClick={() => void submit()}
                  disabled={submitting || blocker !== null}
                >
                  {submitting ? 'Signing...' : 'Sign'}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </MemberLineShell>
    </ProtectedRoute>
  );
}
