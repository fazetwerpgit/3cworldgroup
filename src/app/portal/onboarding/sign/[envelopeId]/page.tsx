'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CircleCheck, RotateCw } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RepBoot, RepShell, useHideRepTabBar } from '@/components/portal/rep/RepShell';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { useSoftKeyboardOpen } from '@/components/portal/rep/RepForm';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import PdfPages from '@/components/esign/PdfPages';
import {
  ConsentCheck,
  DocumentFields,
  fieldsBlocker,
  initialFieldValues,
  type FieldValues,
} from '@/components/esign/DocumentFields';
import SignaturePad from '@/components/esign/SignaturePad';
import {
  clearSignature,
  loadSignature,
  saveSignature,
  type SignatureMethod,
  type StoredSignature,
} from '@/components/esign/signatureStore';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { EnvelopeView } from '@/lib/esign/envelopeView';
import { friendlyError } from '@/lib/forms/friendlyError';
import { FieldRoles } from '@/types';
import { envelopeLoadFailure, type EnvelopeLoadFailure } from './loadFailure';
import styles from './sign-page.module.css';

const CHECKLIST_HREF = '/portal/onboarding';

function EsignSign() {
  const { envelopeId } = useParams<{ envelopeId: string }>();

  const [envelope, setEnvelope] = useState<EnvelopeView | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState<StoredSignature | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  // The Sign request in flight: a double tap never signs twice, and a page
  // restored from the back/forward cache can drop an answer that never came.
  const signRef = useRef<AbortController | null>(null);
  const [completed, setCompleted] = useState(false);
  // error: the last Sign attempt failed (shown in the sign bar's status line).
  const [error, setError] = useState('');
  const [loadFailure, setLoadFailure] = useState<EnvelopeLoadFailure | null>(null);
  // Bumped by Retry after a failed load; re-runs the same GET.
  const [attempt, setAttempt] = useState(0);
  const keyboardOpen = useSoftKeyboardOpen();

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
      if (cancelled) return;
      if (!response.ok) {
        setLoadFailure(envelopeLoadFailure(response.status));
        return;
      }

      const view = payload as EnvelopeView;
      setEnvelope(view);
      setValues(initialFieldValues(view));
      if (view.status === 'completed') setCompleted(true);
    };

    setLoading(true);
    setLoadFailure(null);
    void load()
      .catch(() => {
        // fetch itself threw: no answer from the server.
        if (!cancelled) setLoadFailure(envelopeLoadFailure(null));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [envelopeId, authHeaders, attempt]);

  // iOS Safari can freeze the page mid-sign (the rep switches apps) and later
  // restore it from the back/forward cache with the answer lost, leaving
  // "Signing…" up forever. Drop that request and ask whether the envelope was
  // signed: if so, show it done; if not, Sign is ready again. The fields and
  // the signature stay as the rep left them.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !signRef.current) return;
      signRef.current.abort();
      signRef.current = null;
      setSubmitting(false);
      void (async () => {
        const response = await fetch(`/api/portal/onboarding/esign/envelope/${envelopeId}`, {
          headers: await authHeaders(),
          cache: 'no-store',
        });
        const view = (await response.json().catch(() => null)) as EnvelopeView | null;
        if (response.ok && view?.status === 'completed') setCompleted(true);
      })().catch(() => {});
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, [envelopeId, authHeaders]);

  const setFieldValue = (key: string, value: string | boolean) => {
    setError('');
    setValues((current) => ({ ...current, [key]: value }));
  };

  // The pad reports a new PNG (or null when cleared); keep it for the next
  // document in the set so a rep signs once, not five times.
  const handleSignatureChange = useCallback((png: string | null, method: SignatureMethod) => {
    setError('');
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
    const missing = fieldsBlocker(envelope, values);
    if (missing) return missing;
    if (!signature) return 'Add your signature.';
    if (!consent) return 'Read and accept the statement above.';
    return null;
  }, [envelope, values, signature, consent]);

  const submit = async () => {
    if (!envelope || !signature || blocker || signRef.current) return;
    const sign = new AbortController();
    signRef.current = sign;
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/portal/onboarding/esign/sign', {
        method: 'POST',
        signal: sign.signal,
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
      const fallback = response.status >= 500 ? 'Server hiccup, try again.' : 'Try again.';
      throw new Error(payload?.error || fallback);
    } catch (cause: unknown) {
      // Dropped on a back/forward-cache restore: the pageshow handler took over.
      if (sign.signal.aborted) return;
      const raw = cause instanceof Error ? cause.message : '';
      setError(raw ? friendlyError(raw, 'sign').message : 'Try again.');
    } finally {
      if (signRef.current === sign) {
        signRef.current = null;
        setSubmitting(false);
      }
    }
  };

  // The sign bar takes the tab bar's place on phones while there is something to sign.
  useHideRepTabBar(Boolean(envelope) && !completed);

  // A failed Sign shows here, in the bar the rep is looking at, not at the top of the page.
  const status = submitting
    ? 'Applying your signature…'
    : error
      ? `Not signed. ${error}`
      : (blocker ?? 'Ready to sign.');
  const statusState = !submitting && error ? 'error' : undefined;
  const signButton = (
    <button
      type="button"
      className={`${s.btnPrimary} ${styles.signButton}`}
      onClick={() => void submit()}
      disabled={submitting || blocker !== null}
    >
      {submitting ? 'Signing…' : 'Sign'}
    </button>
  );
  const signStep = envelope && envelope.fields.length > 0 ? 3 : 2;

  if (loading) {
    return (
      <div className={f.page} aria-busy="true" aria-label="Loading the document">
        <div className={styles.head}>
          <span className={s.skel} style={{ width: 96, height: 14 }} />
          <span className={s.skel} style={{ width: '60%', height: 40 }} />
        </div>
        <div className={`${s.panel} ${styles.skelPanel}`}>
          <span className={s.skel} style={{ width: '40%', height: 16 }} />
          <span className={s.skel} style={{ width: '100%', height: 320 }} />
        </div>
      </div>
    );
  }

  if (completed) {
    return (
      <section className={`${s.panel} ${f.sent}`} role="status" aria-labelledby="esign-done-h">
        <CircleCheck size={40} strokeWidth={1.75} className={f.sentIcon} aria-hidden="true" />
        <h1 id="esign-done-h" className={f.sentTitle}>
          Signed
        </h1>
        <p className={f.sentMsg}>
          {envelope?.name ? `${envelope.name} is complete. ` : 'This document is complete. '}
          Your checklist already shows it approved. Nothing else is needed here.
        </p>
        <div className={styles.doneActions}>
          <Link href={CHECKLIST_HREF} className={`${s.btnPrimary} ${f.sentBtn}`}>
            Back to checklist
          </Link>
        </div>
      </section>
    );
  }

  if (!envelope) {
    const failure = loadFailure ?? envelopeLoadFailure(null);
    return (
      <div className={f.page}>
        <header className={`${f.header} ${styles.head}`}>
          <Link href={CHECKLIST_HREF} className={f.backLink}>
            <ArrowLeft size={16} aria-hidden="true" />
            Onboarding
          </Link>
          <h1 className={styles.title}>Sign document</h1>
        </header>
        <div className={`${s.panel} ${s.failed}`} role="alert">
          <span>{failure.message}</span>
          {failure.retry ? (
            <button type="button" className={s.retry} onClick={() => setAttempt((n) => n + 1)}>
              <RotateCw size={14} aria-hidden="true" />
              Retry
            </button>
          ) : (
            <Link href={CHECKLIST_HREF} className={`${s.retry} ${styles.linkBtn}`}>
              Back to checklist
            </Link>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={f.page}>
      <div className={f.frame}>
        <div className={f.body}>
          <header className={`${f.header} ${styles.head}`}>
            <Link href={CHECKLIST_HREF} className={f.backLink}>
              <ArrowLeft size={16} aria-hidden="true" />
              Onboarding
            </Link>
            <h1 className={styles.title}>{envelope.name}</h1>
            <p className={f.lede}>Read the document, fill in what is missing, then sign.</p>
          </header>

          <section className={f.section} aria-labelledby="esign-read-h">
            <h2 id="esign-read-h" className={f.sectionHead}>
              <b aria-hidden="true">1</b>
              Read
              <span className={styles.stepMeta}>
                {envelope.pageCount} {envelope.pageCount === 1 ? 'page' : 'pages'}
              </span>
            </h2>
            <div className={`${s.panel} ${styles.pages}`}>
              <PdfPages src={`/api/portal/onboarding/esign/envelope/${envelopeId}/pdf`} authHeaders={authHeaders} />
            </div>
          </section>

          {envelope.fields.length > 0 && (
            <section className={f.section} aria-labelledby="esign-fill-h">
              <h2 id="esign-fill-h" className={f.sectionHead}>
                <b aria-hidden="true">2</b>
                Fill
              </h2>
              <DocumentFields
                envelope={envelope}
                values={values}
                unlocked={unlocked}
                onChange={setFieldValue}
                onUnlock={(key) => setUnlocked((current) => ({ ...current, [key]: true }))}
              />
            </section>
          )}

          <section className={f.section} aria-labelledby="esign-sign-h">
            <h2 id="esign-sign-h" className={f.sectionHead}>
              <b aria-hidden="true">{signStep}</b>
              Sign
            </h2>
            <SignaturePad value={signature} signerName={envelope.signerName} onChange={handleSignatureChange} />
            <ConsentCheck checked={consent} onChange={setConsent} />
          </section>

          {/* Desktop, and phones with the keyboard up: in the page flow. */}
          <div className={`${f.submitInline} ${styles.bar}`} data-keyboard={keyboardOpen ? 'open' : undefined}>
            <div className={styles.barText}>
              <p className={styles.status} data-state={statusState} role={statusState ? 'alert' : undefined}>
                {status}
              </p>
              <p className={`${f.who} ${s.deskOnly}`}>
                Signing as <strong>{envelope.signerName}</strong>
              </p>
            </div>
            {signButton}
          </div>
        </div>
      </div>

      {/* Phones with the keyboard down: fixed in the tab bar's place. */}
      {keyboardOpen ? null : (
        <BodyLayer>
          <div className={`${f.submitBar} ${styles.bar}`}>
            <p className={styles.status} data-state={statusState} role={statusState ? 'alert' : undefined}>
              {status}
            </p>
            {signButton}
          </div>
        </BodyLayer>
      )}
    </div>
  );
}

export default function EsignSignPage() {
  return (
    <RepShell task="Sign document" back={{ href: CHECKLIST_HREF, label: 'onboarding' }}>
      <ProtectedRoute roles={Object.values(FieldRoles)} fallback={<RepBoot />}>
        <EsignSign />
      </ProtectedRoute>
    </RepShell>
  );
}
