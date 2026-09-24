'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Check, CircleCheck, RotateCw } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { RepBoot, RepShell, useHideRepTabBar } from '@/components/portal/rep/RepShell';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { useSoftKeyboardOpen } from '@/components/portal/rep/RepForm';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import PdfPages from '@/components/esign/PdfPages';
import { fieldLabelWithOptional } from '@/components/esign/fieldLabel';
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
import { friendlyError } from '@/lib/forms/friendlyError';
import { FieldRoles } from '@/types';
import { envelopeLoadFailure, type EnvelopeLoadFailure } from './loadFailure';
import styles from './sign-page.module.css';

const CHECKLIST_HREF = '/portal/onboarding';

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
 * `none` shows while nothing is filled, `many` while more than one is.
 */
const ONE_OF_RULES: Record<string, { keys: string[]; none: string; many: string }[]> = {
  w9: [
    { keys: ['ssn', 'ein'], none: 'Enter your SSN or EIN.', many: 'Enter either an SSN or an EIN, not both.' },
    {
      keys: ['individual_sole_prop', 'llc'],
      none: 'Choose a tax classification.',
      many: 'Choose one tax classification.',
    },
  ],
  direct_deposit: [{ keys: ['checking', 'savings'], none: 'Choose checking or savings.', many: 'Choose checking or savings, not both.' }],
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

function EsignSign() {
  const { envelopeId } = useParams<{ envelopeId: string }>();

  const [envelope, setEnvelope] = useState<EnvelopeView | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [unlocked, setUnlocked] = useState<Record<string, boolean>>({});
  const [signature, setSignature] = useState<StoredSignature | null>(null);
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
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
      setValues(Object.fromEntries(view.fields.map((field) => [field.key, field.value])));
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
    for (const field of envelope.fields) {
      if (field.type === 'text' && field.required && !isFilled(values[field.key])) {
        return `Fill in ${field.label.toLowerCase()}.`;
      }
    }
    for (const rule of ONE_OF_RULES[envelope.docKey] ?? []) {
      const filled = rule.keys.filter((key) => isFilled(values[key])).length;
      if (filled === 0) return rule.none;
      if (filled > 1) return rule.many;
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
      const fallback = response.status >= 500 ? 'Server hiccup, try again.' : 'Try again.';
      throw new Error(payload?.error || fallback);
    } catch (cause: unknown) {
      const raw = cause instanceof Error ? cause.message : '';
      setError(raw ? friendlyError(raw, 'sign').message : 'Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // The sign bar takes the tab bar's place on phones while there is something to sign.
  useHideRepTabBar(Boolean(envelope) && !completed);

  const renderCheckbox = (field: EnvelopeFieldView) => (
    <label key={field.key} className={styles.check}>
      <input
        type="checkbox"
        checked={values[field.key] === true}
        onChange={(event) => setFieldValue(field.key, event.target.checked)}
      />
      <span className={styles.box} aria-hidden="true">
        {values[field.key] === true ? <Check size={14} strokeWidth={3} /> : null}
      </span>
      <span>{field.label}</span>
    </label>
  );

  const renderField = (field: EnvelopeFieldView) => {
    // Prefilled values come from the rep's own profile; they stay read-only
    // until the rep asks to change them, so a stray tap cannot blank a name.
    const readOnly = field.prefilled && !unlocked[field.key];
    return (
      <div key={field.key} className={f.field}>
        <div className={f.label}>
          <label htmlFor={`esign-${field.key}`}>{fieldLabelWithOptional(field.label, field.required)}</label>
          {readOnly && (
            <button
              type="button"
              className={styles.editButton}
              onClick={() => setUnlocked((current) => ({ ...current, [field.key]: true }))}
            >
              Edit
            </button>
          )}
        </div>
        <input
          id={`esign-${field.key}`}
          className={`${f.input} ${styles.input}`}
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
          <p className={f.hint}>Written into this signed document only. Never saved to your profile.</p>
        )}
      </div>
    );
  };

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
  const textFields = envelope?.fields.filter((field) => field.type !== 'checkbox') ?? [];
  const checkFields = envelope?.fields.filter((field) => field.type === 'checkbox') ?? [];
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
              {textFields.length > 0 && <div className={f.grid}>{textFields.map(renderField)}</div>}
              {checkFields.length > 0 && <div className={styles.checks}>{checkFields.map(renderCheckbox)}</div>}
            </section>
          )}

          <section className={f.section} aria-labelledby="esign-sign-h">
            <h2 id="esign-sign-h" className={f.sectionHead}>
              <b aria-hidden="true">{signStep}</b>
              Sign
            </h2>
            <SignaturePad value={signature} signerName={envelope.signerName} onChange={handleSignatureChange} />
            <label className={`${styles.check} ${styles.consent}`}>
              <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
              <span className={styles.box} aria-hidden="true">
                {consent ? <Check size={14} strokeWidth={3} /> : null}
              </span>
              <span>{ESIGN_CONSENT_TEXT}</span>
            </label>
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
