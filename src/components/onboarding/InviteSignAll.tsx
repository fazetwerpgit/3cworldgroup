'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Check, LoaderCircle, RotateCw } from 'lucide-react';
import { AuthShell } from '@/components/auth/AuthShell';
import PdfPages from '@/components/esign/PdfPages';
import SignaturePad from '@/components/esign/SignaturePad';
import {
  ConsentCheck,
  DocumentFields,
  fieldsBlocker,
  initialFieldValues,
  type FieldValues,
} from '@/components/esign/DocumentFields';
import {
  clearSignature,
  loadSignature,
  saveSignature,
  type SignatureMethod,
  type StoredSignature,
} from '@/components/esign/signatureStore';
import { friendlyError } from '@/lib/forms/friendlyError';
import type { EnvelopeView } from '@/lib/esign/envelopeView';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/rep/rep-forms.module.css';
import a from '@/components/auth/auth.module.css';
import o from '@/components/onboarding/onboarding.module.css';
import x from './invite-sign.module.css';

/** Mirrors the token route's header name (SIGNING_KEY_HEADER, server-only module). */
const SIGNING_KEY_HEADER = 'x-onboard-signing-key';

/** Mirrors GET /api/public/onboarding/{token}/esign. */
interface InviteSignDocument {
  itemId: string;
  label: string;
  state: 'ready' | 'signed' | 'preparing' | 'failed';
  envelope: EnvelopeView | null;
}

interface InviteSignView {
  signerName: string;
  documents: InviteSignDocument[];
}

/** Where one document stands on this screen. */
type DocResult = { kind: 'idle' } | { kind: 'signing' } | { kind: 'signed' } | { kind: 'error'; message: string };

type Phase = 'loading' | 'ready' | 'done' | 'lost' | 'loadError';

interface Props {
  token: string;
  signingKey: string;
  /** The key no longer works (expired, or the account moved on): drop it. */
  onSessionLost: () => void;
}

function signErrorMessage(status: number, raw: string): string {
  if (status >= 500) return 'Server hiccup. Try again.';
  if (raw === 'consent required') return 'Check the box to agree to sign electronically.';
  if (raw === 'invalid signature image') return 'Add your signature again.';
  return raw || 'Try again.';
}

/**
 * Step two of the invite link: every e-sign document on one screen. The hire
 * reviews each one (the same page renderer and fields as the portal sign
 * page), signs once, and one button signs them all. Documents are signed one
 * request at a time, so a failure is pinned to its document and can be
 * retried alone; anything already signed stays signed.
 */
export function InviteSignAll({ token, signingKey, onSessionLost }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [view, setView] = useState<InviteSignView | null>(null);
  const [values, setValues] = useState<Record<string, FieldValues>>({});
  const [unlocked, setUnlocked] = useState<Record<string, Record<string, boolean>>>({});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [results, setResults] = useState<Record<string, DocResult>>({});
  const [signature, setSignature] = useState<StoredSignature | null>(null);
  const [consent, setConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  // The sign run in flight: a double tap never signs twice, and a page restored
  // from the back/forward cache drops the answers it lost.
  const runRef = useRef<AbortController | null>(null);

  const headers = useCallback(
    async (): Promise<Record<string, string>> => ({ [SIGNING_KEY_HEADER]: signingKey }),
    [signingKey]
  );

  useEffect(() => {
    setSignature(loadSignature());
  }, []);

  const applyView = useCallback((next: InviteSignView) => {
    setView(next);
    setValues((current) => {
      const merged = { ...current };
      for (const doc of next.documents) {
        if (doc.envelope && !merged[doc.itemId]) merged[doc.itemId] = initialFieldValues(doc.envelope);
      }
      return merged;
    });
    setResults((current) => {
      const merged = { ...current };
      for (const doc of next.documents) {
        if (doc.state === 'signed') merged[doc.itemId] = { kind: 'signed' };
      }
      return merged;
    });
  }, []);

  const load = useCallback(async (): Promise<InviteSignView | 'done' | 'lost' | null> => {
    const response = await fetch(`/api/public/onboarding/${token}/esign`, {
      headers: await headers(),
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => null)) as (InviteSignView & { done?: boolean }) | null;
    if (response.status === 409 && payload?.done) return 'done';
    if ([401, 403, 404].includes(response.status)) return 'lost';
    if (!response.ok || !payload) return null;
    return payload;
  }, [token, headers]);

  useEffect(() => {
    let cancelled = false;
    setPhase('loading');
    load()
      .then((result) => {
        if (cancelled) return;
        if (result === 'done') setPhase('done');
        else if (result === 'lost') setPhase('lost');
        else if (!result) setPhase('loadError');
        else {
          applyView(result);
          setPhase('ready');
        }
      })
      .catch(() => {
        if (!cancelled) setPhase('loadError');
      });
    return () => {
      cancelled = true;
    };
  }, [load, applyView, attempt]);

  useEffect(() => {
    if (phase === 'lost') onSessionLost();
  }, [phase, onSessionLost]);

  // iOS Safari can freeze the page mid-run and restore it with the answers
  // lost. Drop the run and re-read where every document stands.
  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted || !runRef.current) return;
      runRef.current.abort();
      runRef.current = null;
      setSigning(false);
      setResults((current) =>
        Object.fromEntries(
          Object.entries(current).map(([id, result]) => [id, result.kind === 'signing' ? { kind: 'idle' } : result])
        )
      );
      setAttempt((n) => n + 1);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  const handleSignatureChange = useCallback((png: string | null, method: SignatureMethod) => {
    setNotice('');
    if (!png) {
      setSignature(null);
      clearSignature();
      return;
    }
    const next: StoredSignature = { png, method };
    setSignature(next);
    saveSignature(next);
  }, []);

  const signable = useMemo(
    () => (view?.documents ?? []).filter((doc) => doc.envelope && doc.state !== 'signed'),
    [view]
  );
  const unsigned = signable.filter((doc) => results[doc.itemId]?.kind !== 'signed');
  const signedCount = (view?.documents ?? []).filter(
    (doc) => doc.state === 'signed' || results[doc.itemId]?.kind === 'signed'
  ).length;
  const total = view?.documents.length ?? 0;
  const notReady = (view?.documents ?? []).filter((doc) => !doc.envelope && doc.state !== 'signed');

  const blockerFor = (doc: InviteSignDocument): string | null =>
    doc.envelope ? fieldsBlocker(doc.envelope, values[doc.itemId] ?? {}) : null;

  const setField = (itemId: string) => (key: string, value: string | boolean) => {
    setNotice('');
    setResults((current) =>
      current[itemId]?.kind === 'error' ? { ...current, [itemId]: { kind: 'idle' } } : current
    );
    setValues((current) => ({ ...current, [itemId]: { ...current[itemId], [key]: value } }));
  };

  const reveal = (itemId: string) => {
    setOpen((current) => ({ ...current, [itemId]: true }));
    requestAnimationFrame(() =>
      document.getElementById(`sign-doc-${itemId}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    );
  };

  /** Signs the given documents one at a time. Returns once every request has answered. */
  const run = async (docs: InviteSignDocument[]) => {
    if (runRef.current || docs.length === 0) return;
    for (const doc of docs) {
      const missing = blockerFor(doc);
      if (missing) {
        setNotice(`${doc.label}: ${missing}`);
        reveal(doc.itemId);
        return;
      }
    }
    if (!signature) {
      setNotice('Add your signature.');
      return;
    }
    if (!consent) {
      setNotice('Check the box to agree to sign electronically.');
      return;
    }

    const controller = new AbortController();
    runRef.current = controller;
    setSigning(true);
    setNotice('');
    let lost = false;
    let finished = false;
    const outcome: Record<string, DocResult> = {};
    try {
      for (const doc of docs) {
        if (controller.signal.aborted) return;
        setResults((current) => ({ ...current, [doc.itemId]: { kind: 'signing' } }));
        let result: DocResult;
        try {
          const response = await fetch(`/api/public/onboarding/${token}/esign/sign`, {
            method: 'POST',
            signal: controller.signal,
            headers: { ...(await headers()), 'Content-Type': 'application/json' },
            body: JSON.stringify({
              envelopeId: doc.envelope!.envelopeId,
              fields: values[doc.itemId] ?? {},
              signaturePng: signature.png,
              signatureMethod: signature.method,
              consent: true,
            }),
          });
          const payload = (await response.json().catch(() => null)) as
            | { error?: string; done?: boolean; allSigned?: boolean }
            | null;
          if (response.ok || (response.status === 409 && payload?.error === 'already completed')) {
            result = { kind: 'signed' };
            if (payload?.allSigned) finished = true;
          } else if (response.status === 409 && payload?.done) {
            result = { kind: 'signed' };
            finished = true;
          } else if (response.status === 401 || response.status === 403) {
            lost = true;
            result = { kind: 'idle' };
          } else {
            result = { kind: 'error', message: signErrorMessage(response.status, payload?.error ?? '') };
          }
        } catch (cause: unknown) {
          if (controller.signal.aborted) return;
          const raw = cause instanceof Error ? cause.message : '';
          result = { kind: 'error', message: raw ? friendlyError(raw, 'sign').message : 'Try again.' };
        }
        outcome[doc.itemId] = result;
        setResults((current) => ({ ...current, [doc.itemId]: result }));
        if (lost || finished) break;
      }
    } finally {
      if (runRef.current === controller) {
        runRef.current = null;
        setSigning(false);
      }
    }

    if (lost) {
      setPhase('lost');
      return;
    }
    const stillUnsigned = signable.filter(
      (doc) => (outcome[doc.itemId] ?? results[doc.itemId])?.kind !== 'signed'
    );
    if (finished || stillUnsigned.length === 0) {
      setPhase('done');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const failed = stillUnsigned.filter((doc) => outcome[doc.itemId]?.kind === 'error');
    if (failed.length > 0) {
      setNotice(
        failed.length === 1
          ? `${failed[0].label} was not signed. Everything else is signed. Try that one again.`
          : `${failed.map((doc) => doc.label).join(' and ')} were not signed. Everything else is signed. Try again.`
      );
    }
  };

  if (phase === 'loading') {
    return (
      <AuthShell tag="Onboarding">
        <h1 className={a.title}>Sign your documents</h1>
        <p className={a.sub} role="status">
          Getting your documents ready…
        </p>
        <div className={a.stack} aria-hidden="true">
          <span className={s.skel} style={{ width: '75%', height: 12 }} />
          <span className={s.skel} style={{ width: '50%', height: 12 }} />
          <span className={s.skel} style={{ height: 52 }} />
        </div>
      </AuthShell>
    );
  }

  if (phase === 'done') {
    return (
      <AuthShell tag="Onboarding">
        <span className={a.statusIcon} aria-hidden="true">
          <Check size={22} />
        </span>
        <span className={o.state} data-state="approved">
          Signed
        </span>
        <h1 className={a.title}>You&rsquo;re all set</h1>
        <p className={a.sub}>
          Your packet is in and your documents are signed. Your manager reviews the rest, and we email you when your
          account is active.
          {notReady.length > 0
            ? ` ${notReady.length === 1 ? 'One document is' : `${notReady.length} documents are`} still being prepared. We email you when it is ready to sign.`
            : ''}
        </p>
        <div className={a.actions}>
          <Link href="/portal" className={`${s.btnPrimary} ${a.btn}`}>
            Go to the portal
          </Link>
        </div>
      </AuthShell>
    );
  }

  if (phase === 'lost' || phase === 'loadError') {
    return (
      <AuthShell tag="Onboarding">
        <span className={`${a.statusIcon} ${phase === 'loadError' ? a.statusIconWarn : ''}`} aria-hidden="true">
          {phase === 'loadError' ? <AlertTriangle size={22} /> : <Check size={22} />}
        </span>
        <h1 className={a.title}>
          {phase === 'loadError' ? 'Your documents did not load' : 'Your onboarding packet is sent'}
        </h1>
        <p className={a.sub} role={phase === 'loadError' ? 'alert' : undefined}>
          {phase === 'loadError'
            ? 'Your packet is in. Try loading your documents again, or sign them later from the portal.'
            : 'Sign in to the portal to sign your documents. Your manager reviews the rest.'}
        </p>
        <div className={a.actions}>
          {phase === 'loadError' ? (
            <button type="button" className={`${s.btnPrimary} ${a.btn}`} onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          ) : null}
          <Link href="/portal" className={`${phase === 'loadError' ? s.btnSecondary : s.btnPrimary} ${a.btn}`}>
            Sign in to the portal
          </Link>
        </div>
      </AuthShell>
    );
  }

  const count = unsigned.length;
  const buttonLabel = signing
    ? 'Signing'
    : count === 1
      ? 'Sign 1 document'
      : `Sign all ${count} documents`;

  return (
    <AuthShell tag="Onboarding" wide>
      <div className={o.invite}>
        <header>
          <h1 className={a.title}>Sign your documents</h1>
          <p className={a.sub}>
            Your packet is in. Review each document and fill in what it asks for. Then sign once and every document is
            signed.
          </p>
        </header>

        <aside className={o.inviteAside} aria-labelledby="sign-progress-h">
          <section className={s.panel}>
            <div className={o.progress}>
              <h2 id="sign-progress-h" className={s.kicker}>
                Documents
              </h2>
              <p className={o.score}>
                <span className={`${o.scoreNum} ${total && signedCount === total ? o.progressDone : ''}`}>
                  {signedCount}
                </span>
                <span className={o.scoreOf}>/{total}</span>
                <span className={o.scoreLabel}>signed</span>
              </p>
              <span className={s.track} aria-hidden="true">
                <span className={s.fill} style={{ width: total ? `${(signedCount / total) * 100}%` : '0%' }} />
              </span>
            </div>
          </section>
          <p className={o.note}>
            Bank and tax numbers you type here go into the signed document only. They are never saved to your profile.
          </p>
        </aside>

        <div className={f.form}>
          <section className={f.section} aria-labelledby="sign-docs-h">
            <h2 id="sign-docs-h" className={f.sectionHead}>
              <b aria-hidden="true">1</b>
              Review
            </h2>
            <ol className={o.inviteItems}>
              {(view?.documents ?? []).map((doc, index) => {
                const result = results[doc.itemId] ?? { kind: 'idle' };
                const signed = doc.state === 'signed' || result.kind === 'signed';
                const missing = signed ? null : blockerFor(doc);
                const expanded = !!open[doc.itemId] && !!doc.envelope && !signed;
                const pill = signed
                  ? { state: 'approved', text: 'Signed' }
                  : !doc.envelope
                    ? { state: undefined, text: 'Preparing' }
                    : result.kind === 'error'
                      ? { state: 'rejected', text: 'Not signed' }
                      : result.kind === 'signing'
                        ? { state: 'submitted', text: 'Signing' }
                        : missing
                          ? { state: undefined, text: 'Needs your info' }
                          : { state: 'submitted', text: 'Ready to sign' };
                const description = signed
                  ? 'Signed. A copy is kept with your onboarding records.'
                  : !doc.envelope
                    ? 'Still being prepared. It will be on your portal checklist to sign.'
                    : missing ?? 'Everything this document needs is filled in.';
                return (
                  <li key={doc.itemId} id={`sign-doc-${doc.itemId}`} className={`${s.panel} ${o.inviteItem}`}>
                    <div className={x.docHead}>
                      <div className={o.rowText}>
                        <span className={o.state} data-state={pill.state}>
                          {pill.text}
                        </span>
                        <h3 className={o.rowName}>
                          {String(index + 1).padStart(2, '0')}. {doc.envelope?.name ?? doc.label}
                        </h3>
                        <p className={o.rowDesc}>{description}</p>
                      </div>
                      {doc.envelope && !signed ? (
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${o.rowBtn}`}
                          aria-expanded={expanded}
                          aria-controls={`sign-doc-body-${doc.itemId}`}
                          onClick={() => setOpen((current) => ({ ...current, [doc.itemId]: !current[doc.itemId] }))}
                        >
                          {expanded ? 'Close' : 'Review'}
                        </button>
                      ) : null}
                    </div>

                    {result.kind === 'error' ? (
                      <div className={x.docHead}>
                        <p className={x.docError} role="alert">
                          Not signed. {result.message}
                        </p>
                        <button
                          type="button"
                          className={s.retry}
                          disabled={signing}
                          onClick={() => void run([doc])}
                        >
                          <RotateCw size={14} aria-hidden="true" />
                          Retry
                        </button>
                      </div>
                    ) : null}

                    {expanded && doc.envelope ? (
                      <div id={`sign-doc-body-${doc.itemId}`} className={x.docBody}>
                        <div className={x.pages}>
                          <PdfPages
                            src={`/api/public/onboarding/${token}/esign/${doc.envelope.envelopeId}/pdf`}
                            authHeaders={headers}
                          />
                        </div>
                        {doc.envelope.fields.length > 0 ? (
                          <DocumentFields
                            envelope={doc.envelope}
                            values={values[doc.itemId] ?? {}}
                            unlocked={unlocked[doc.itemId] ?? {}}
                            onChange={setField(doc.itemId)}
                            onUnlock={(key) =>
                              setUnlocked((current) => ({
                                ...current,
                                [doc.itemId]: { ...current[doc.itemId], [key]: true },
                              }))
                            }
                            idPrefix={`sign-${doc.itemId}`}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </section>

          {count > 0 ? (
            <section className={`${f.section} ${x.signSection}`} aria-labelledby="sign-sign-h">
              <h2 id="sign-sign-h" className={f.sectionHead}>
                <b aria-hidden="true">2</b>
                Sign
              </h2>
              <SignaturePad value={signature} signerName={view?.signerName ?? ''} onChange={handleSignatureChange} />
              <ConsentCheck
                checked={consent}
                onChange={(checked) => {
                  setNotice('');
                  setConsent(checked);
                }}
              />
            </section>
          ) : null}

          <div className={`${o.inviteActions} ${x.actions}`}>
            {notice ? (
              <p className={x.status} data-state="error" role="alert">
                {notice}
              </p>
            ) : (
              <p className={x.status} role="status">
                {signing
                  ? `Signing ${signedCount + 1} of ${total}…`
                  : count > 0
                    ? `Signing as ${view?.signerName || 'you'}. Each document gets your signature and today's date.`
                    : 'Nothing left to sign here.'}
              </p>
            )}
            {count > 0 ? (
              <button
                type="button"
                className={`${s.btnPrimary} ${o.submit}`}
                disabled={signing}
                onClick={() => void run(unsigned)}
              >
                {signing ? <LoaderCircle size={18} className={f.spin} aria-hidden="true" /> : null}
                {buttonLabel}
              </button>
            ) : (
              <Link href="/portal" className={`${s.btnPrimary} ${o.submit}`}>
                Go to the portal
              </Link>
            )}
          </div>
        </div>
      </div>
    </AuthShell>
  );
}

export default InviteSignAll;
