'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Images,
  CopyCheck,
  Eraser,
  History,
  ImageUp,
  Keyboard,
  RotateCw,
  WifiOff,
} from 'lucide-react';
import { ThinkingOrb } from 'thinking-orbs';
import { getPlanById } from '@/types';
import { useCompPlan } from '@/hooks/useCompPlan';
import { useSaleFormState } from '@/hooks/useSaleFormState';
import { NO_SIGNAL_SALE_MESSAGE } from '@/hooks/useSales';
import { expectedPayForSale } from '@/lib/pay/expectedPay';
import { payoutLabelForDraft } from '@/lib/pay/payoutWindow';
import { loggedSaleHref } from '@/lib/sales/loggedSale';
import { isExtraPlanId } from '@/lib/sales/planSelection';
import { MAX_PROOF_SCREENSHOTS } from '@/lib/sales/proofPaths';
import { saleScanEnabled } from '@/lib/sales/scan/flag';
import { BULK_MAX_FILES } from '@/lib/sales/bulk/batch';
import { BodyLayer } from './BodyLayer';
import { PROOF_ACCEPT, ProofCapture, useProofUploads } from './ProofCapture';
import { useSoftKeyboardOpen } from './RepForm';
import { useHideRepTabBar } from './RepShell';
import { DEFAULT_PROVIDER, SaleFields } from './SaleFields';
import { useSaleScan, type ScanFill, type ScanTarget } from './useSaleScan';
import s from './rep.module.css';
import l from './rep-logsale.module.css';

// Log a sale, direction D. Two steps: attach the carrier's confirmation
// screenshot(s) as proof, then check the sale details. The first screenshot is
// read (useSaleScan) to prefill the fields the rep has not typed in; the rep
// checks them and submits. "Enter manually" skips the screenshot, which makes
// the order number the proof (the hasSaleProof rule).

const FORM_ID = 'rep-log-sale';
/** An amount with a muted, top-aligned dollar sign (reads as "$130"). */
const Amount = ({ value }: { value: number }) => (
  <>
    <span className={l.cur}>$</span>
    {Math.round(value).toLocaleString('en-US')}
  </>
);
const shortSaleDate = (value: Date | string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** "Already logged by Dana W. on Sep 14." — "you" when it is the rep's own sale. */
export function orderDuplicateHeadline(dup: {
  existingRepName: string;
  existingSaleDate: string | null;
  existingIsMine: boolean;
}): string {
  const who = dup.existingIsMine ? 'you' : dup.existingRepName || 'another rep';
  return dup.existingSaleDate
    ? `Already logged by ${who} on ${shortSaleDate(dup.existingSaleDate)}.`
    : `Already logged by ${who}.`;
}

function Steps({ onDetails }: { onDetails: boolean }) {
  return <p className={l.steps}>{onDetails ? 'Step 2 of 2 · Details' : 'Step 1 of 2 · Proof'}</p>;
}

/** How long "Logged" shows on the button before Sales opens. */
export const LOGGED_HOLD_MS = 320;

/**
 * The submit button's label, stacked over "Logged" in one grid cell so the
 * swap crossfades in place (rep-logsale.module.css) with no change of width.
 */
export function SubmitLabel({ logged, children }: { logged: boolean; children: ReactNode }) {
  return (
    <span className={l.submitSwap}>
      <span aria-hidden={logged || undefined}>{children}</span>
      <span aria-hidden={!logged || undefined}>
        <Check size={20} strokeWidth={2.75} aria-hidden="true" />
        Logged
      </span>
    </span>
  );
}

export function RepLogSale() {
  const router = useRouter();
  const { formRef, errorRef, ...form } = useSaleFormState();
  const { rates, hasPlan, error: planError, retry: retryPlan } = useCompPlan();
  const [step, setStep] = useState<'entry' | 'details'>('entry');
  // Which way the rep last moved between the steps; the page slides in from
  // that side. Null until they move, so a first paint or a restored draft stays put.
  const [stepMove, setStepMove] = useState<'forward' | 'back' | null>(null);
  const goToStep = (next: 'entry' | 'details') => {
    setStep(next);
    setStepMove(next === 'details' ? 'forward' : 'back');
  };
  // Fields the screenshot filled, for the tint as each value lands.
  const [scanFilled, setScanFilled] = useState<ReadonlySet<ScanTarget>>(() => new Set());
  const [providerChoice, setProviderChoice] = useState<string | null>(null);

  const hasInternetPlan = form.products.some((p) => !isExtraPlanId(p.productId));
  const scanOn = saleScanEnabled();
  const scan = useSaleScan({
    enabled: scanOn,
    paths: form.proofPaths,
    isEmpty: (target) =>
      target === 'plan' ? !hasInternetPlan : !form.formData[target].trim(),
    apply: (fills: ScanFill[]) => {
      setScanFilled((prev) => new Set([...prev, ...fills.map((fill) => fill.target)]));
      for (const fill of fills) {
        if (fill.target === 'plan') {
          setProviderChoice(fill.provider);
          form.keepProvider(fill.provider);
          const plan = fill.planId ? getPlanById(fill.planId) : undefined;
          if (plan) form.addPlan(plan);
        } else {
          form.setField(fill.target, fill.value);
        }
      }
    },
  });
  const uploads = useProofUploads({
    paths: form.proofPaths,
    // An upload can finish long after it started, so this may run from an old
    // render: both calls are stable and read the latest state themselves.
    onAdd: (path) => {
      form.addProofPath(path);
      scan.proofAdded(path);
    },
    onRemove: form.removeProofPath,
    slotKey: form.proofUploadId,
  });
  const [moreOpen, setMoreOpen] = useState(false);
  // Start over was tapped on an entry with something in it: ask before clearing.
  const [confirmClear, setConfirmClear] = useState(false);
  const keyboardOpen = useSoftKeyboardOpen();
  const pickId = useId();

  // A restored draft goes straight back to the details.
  const onDetails = step === 'details' || form.fromDraft;
  useHideRepTabBar(onDetails);

  const { formData, products } = form;
  const provider = form.provider ?? providerChoice ?? DEFAULT_PROVIDER;
  const screenshotCount = form.proofPaths.length;
  const proofTiles = uploads.tiles.length;
  const orderRequired = screenshotCount === 0;

  const est = hasPlan && products.length > 0 ? expectedPayForSale({ products }, rates) : null;
  // T-Fiber + an install date: the estimated payout window, live as the date changes.
  const payoutLabel = payoutLabelForDraft(products, formData.installDate);

  const pickFiles = (files: FileList | null) => {
    const taken = uploads.addFiles(Array.from(files ?? []));
    if (taken > 0) goToStep('details');
  };

  const chooseProvider = (company: string) => {
    scan.edited('plan');
    setProviderChoice(company);
    form.keepProvider(company);
  };

  // A new sale opens Sales on the month it was sold in, confirmed by name. So
  // does a retry that finds this same entry already stored (the form reports it
  // as a plain success). A duplicate left over is a different entry: it stays.
  // The button confirms "Logged" for a beat (LOGGED_HOLD_MS) before Sales opens.
  const [logged, setLogged] = useState(false);
  const loggedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (loggedTimer.current) clearTimeout(loggedTimer.current);
  }, []);
  const afterSubmit = (result: Awaited<ReturnType<typeof form.submit>>, saleDate: string) => {
    if (!result || result.orderDuplicate || result.duplicate) return;
    const href = result.sale.id ? loggedSaleHref(result.sale.id, saleDate) : '/portal/sales';
    setLogged(true);
    loggedTimer.current = setTimeout(() => router.push(href), LOGGED_HOLD_MS);
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saleDate = formData.saleDate;
    afterSubmit(await form.submit({ pendingUploads: uploads.uploadingCount }), saleDate);
  };

  const logAsNew = async () => {
    const saleDate = formData.saleDate;
    afterSubmit(await form.logAsNew({ pendingUploads: uploads.uploadingCount }), saleDate);
  };

  // The order number is already on a live sale and the rep says this one is
  // separate: the same entry goes again with the override.
  const logOrderAnyway = async () => {
    const saleDate = formData.saleDate;
    afterSubmit(await form.logOrderAnyway({ pendingUploads: uploads.uploadingCount }), saleDate);
  };

  // A restored draft keeps its "Picking up where you left off" bar for as long
  // as the entry lasts: hiding it on the first keystroke would shift the form
  // up under the rep's thumb. Start over clears it all and goes back to Proof.
  const startOverRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const confirmShown = useRef(false);
  useEffect(() => {
    if (confirmClear) keepRef.current?.focus();
    else if (confirmShown.current) startOverRef.current?.focus();
    confirmShown.current = confirmClear;
  }, [confirmClear]);

  const clearSale = () => {
    for (const tile of uploads.tiles) if (tile.kind !== 'done') uploads.discard(tile.key);
    form.startOver();
    scan.reset();
    setScanFilled(new Set());
    goToStep('entry');
    setProviderChoice(null);
    setMoreOpen(false);
    setConfirmClear(false);
  };

  const startOver = () => {
    if (form.hasContent || proofTiles > 0) setConfirmClear(true);
    else clearSale();
  };

  const duplicate = form.duplicateOf;
  const duplicateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (duplicate) duplicateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [duplicate]);
  const orderDuplicate = form.orderDuplicate;
  const orderDuplicateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (orderDuplicate) orderDuplicateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [orderDuplicate]);

  const blockError = form.blockError;
  const offline = blockError === NO_SIGNAL_SALE_MESSAGE;

  const submitBar = (fixed: boolean) => (
    <div className={fixed ? l.submitBar : l.submitInline} data-keyboard={keyboardOpen ? 'open' : undefined}>
      {planError ? (
        // The rates failed to load. That is not "no plan", so say so and retry.
        <button type="button" className={`${l.estPay} ${l.estRetry}`} onClick={retryPlan}>
          <span className={s.kicker}>Est. pay</span>
          <span className={l.estNone}>Couldn&apos;t load pay rates</span>
          <span className={l.estRetryLabel}>
            <RotateCw size={12} strokeWidth={2.5} aria-hidden="true" />
            Retry
          </span>
        </button>
      ) : (
        <p className={l.estPay}>
          <span className={s.kicker}>Est. pay</span>
          {/* A 0 means the plan has no contracted rate for it yet — the Sales
              rows say "Rate pending" for that, never a confident $0. */}
          {est === 0 ? (
            <span className={l.estNone}>Rate pending</span>
          ) : est !== null ? (
            <span className={l.estNum}>
              <Amount value={est} />
            </span>
          ) : (
            <span className={l.estNone}>{hasPlan ? 'Pick a plan' : '—'}</span>
          )}
          <span className={l.estWhen}>
            {payoutLabel ? `est. payout ${payoutLabel}` : est !== null ? 'Once it installs' : ' '}
          </span>
        </p>
      )}
      <button
        type="submit"
        form={FORM_ID}
        className={`${s.btnPrimary} ${l.submit}`}
        disabled={form.submitting || logged}
        aria-disabled={uploads.uploadingCount > 0 || undefined}
        data-logged={logged || undefined}
      >
        <SubmitLabel logged={logged}>
          {form.submitting ? 'Submitting…' : uploads.uploadingCount > 0 ? 'Uploading…' : 'Submit sale'}
        </SubmitLabel>
      </button>
    </div>
  );

  if (!onDetails) {
    return (
      <div className={`${l.main} ${l.mainEntry}`} data-step-move={stepMove ?? undefined}>
        <Steps onDetails={false} />
        <div className={l.defaultGrid}>
          <section className={l.entry} aria-labelledby="entry-h">
            <div className={l.entryBody}>
              <h1 id="entry-h" className={l.entryTitle}>
                {scanOn ? 'Add the order confirmation' : 'Attach order confirmation'}
              </h1>
              <p className={l.entryLede}>
                {scanOn
                  ? "Screenshot it and we'll fill in the details. You check them and submit."
                  : "Attach the carrier's confirmation page as proof. You type the details next."}
              </p>
              <div className={l.entryActions}>
                <label className={`${s.btnPrimary} ${s.btnBlock} ${s.phoneOnly}`}>
                  <input
                    type="file"
                    accept={PROOF_ACCEPT}
                    multiple
                    className={s.srOnly}
                    onChange={(e) => {
                      pickFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <ImageUp size={20} strokeWidth={2.25} aria-hidden="true" />
                  Choose screenshot
                </label>
                <label className={`${s.btnPrimary} ${s.deskOnly}`} htmlFor={`${pickId}-desk`}>
                  <input
                    id={`${pickId}-desk`}
                    type="file"
                    accept={PROOF_ACCEPT}
                    multiple
                    className={s.srOnly}
                    onChange={(e) => {
                      pickFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <ImageUp size={20} strokeWidth={2.25} aria-hidden="true" />
                  Choose screenshot
                </label>
              </div>
            </div>
            <p className={l.entryWorks}>Whole confirmation page, up to {MAX_PROOF_SCREENSHOTS} screenshots.</p>
          </section>

          <div className={l.side}>
            <button type="button" className={l.manual} onClick={() => goToStep('details')}>
              <Keyboard size={20} strokeWidth={1.75} aria-hidden="true" className={l.manualIcon} />
              <span className={l.manualText}>
                <span className={l.manualTitle}>Enter manually</span>
                <span className={l.manualSub}>No screenshot? Type it in with the order number.</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className={l.manualIcon} />
            </button>
            {scanOn ? (
              <Link href="/portal/sales/new/bulk" className={l.manual}>
                <Images size={20} strokeWidth={1.75} aria-hidden="true" className={l.manualIcon} />
                <span className={l.manualText}>
                  <span className={l.manualTitle}>Log several from screenshots</span>
                  <span className={l.manualSub}>Catching up? Pick up to {BULK_MAX_FILES} order screenshots at once.</span>
                </span>
                <ChevronRight size={20} aria-hidden="true" className={l.manualIcon} />
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${l.main} ${l.mainDetails}`} data-step-move={stepMove ?? undefined}>
      <Steps onDetails />
      {form.fromDraft ? (
        confirmClear ? (
          <div className={`${l.dupe} ${l.draftConfirm}`} role="group" aria-labelledby="clear-h">
            <Eraser size={20} strokeWidth={2} aria-hidden="true" />
            <div className={l.dupeBody}>
              <p id="clear-h">
                <strong>Clear this sale?</strong>
              </p>
              <p className={l.dupeMeta}>Everything typed and attached goes. This can&apos;t be undone.</p>
              <div className={l.dupeActions}>
                <button type="button" className={s.btnSecondary} onClick={clearSale}>
                  Clear
                </button>
                <button ref={keepRef} type="button" className={l.dupeNew} onClick={() => setConfirmClear(false)}>
                  Keep
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className={l.draftBar}>
            <History size={18} strokeWidth={2} aria-hidden="true" />
            <p>Picking up where you left off</p>
            <button ref={startOverRef} type="button" className={l.draftStartOver} onClick={startOver}>
              Start over
            </button>
          </div>
        )
      ) : null}
      <form id={FORM_ID} ref={formRef} className={l.reviewGrid} onSubmit={onSubmit} noValidate>
        <ProofCapture
          uploads={uploads}
          orderRequired={orderRequired && proofTiles === 0}
          autofill={scanOn}
          reading={scan.status === 'reading'}
        />

        <div className={l.reviewMain}>
          <header>
            <h1 className={l.title}>Sale details</h1>
            {scan.status === 'reading' ? (
              <div className={l.scanRow}>
                <p className={`${l.lede} ${l.scanReading}`} role="status">
                  <ThinkingOrb state="working" size={20} theme="dark" aria-hidden="true" />
                  Reading your screenshot…
                </p>
                <button type="button" className={l.scanSkip} onClick={scan.skip}>
                  Skip
                </button>
              </div>
            ) : (
              <p className={l.lede} role="status">
                {scan.status === 'filled'
                  ? 'Filled from your screenshot. Check before you submit.'
                  : scan.status === 'failed'
                    ? "Couldn't read it. Fill it in below."
                    : orderRequired && proofTiles === 0
                      ? 'No screenshot, so the order number is the proof.'
                      : 'Type it in from the confirmation.'}
              </p>
            )}
          </header>

          {duplicate ? (
            <div ref={duplicateRef} className={l.dupe} role="alert">
              <CopyCheck size={20} strokeWidth={2} aria-hidden="true" />
              <div className={l.dupeBody}>
                <p>
                  <strong>This sale was already logged.</strong>
                </p>
                <p className={l.dupeMeta}>
                  {[
                    duplicate.customerName || duplicate.customerAddress || 'Customer',
                    duplicate.saleDate ? `sold ${shortSaleDate(duplicate.saleDate)}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className={l.dupeActions}>
                  <Link
                    href={duplicate.id ? `/portal/sales/${duplicate.id}` : '/portal/sales'}
                    className={s.btnSecondary}
                    onClick={form.discardDraft}
                  >
                    View it
                  </Link>
                  <button type="button" className={l.dupeNew} onClick={logAsNew} disabled={form.submitting}>
                    Log as a new sale
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {orderDuplicate ? (
            <div ref={orderDuplicateRef} className={l.dupe} role="alert" data-part="order-duplicate">
              <CopyCheck size={20} strokeWidth={2} aria-hidden="true" />
              <div className={l.dupeBody}>
                <p>
                  <strong>{orderDuplicateHeadline(orderDuplicate)}</strong>
                </p>
                <p className={l.dupeMeta}>
                  {[
                    'Same order number',
                    // Another rep's customer stays theirs: named only when the
                    // rep may open that sale.
                    orderDuplicate.existingSaleId ? orderDuplicate.existingCustomerFirstName : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className={l.dupeActions}>
                  {orderDuplicate.existingSaleId ? (
                    <Link href={`/portal/sales/${orderDuplicate.existingSaleId}`} className={s.btnSecondary}>
                      View it
                    </Link>
                  ) : null}
                  <button
                    type="button"
                    className={l.dupeNew}
                    onClick={logOrderAnyway}
                    disabled={form.submitting}
                  >
                    Log as a new sale
                  </button>
                  <button type="button" className={l.dupeNew} onClick={form.dismissOrderDuplicate}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {blockError ? (
            <div ref={errorRef} className={l.alert} role="alert">
              {offline ? (
                <WifiOff size={20} strokeWidth={2} aria-hidden="true" />
              ) : (
                <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
              )}
              <p>
                <strong>{offline ? 'Not sent.' : 'Not submitted.'}</strong> {blockError}
              </p>
            </div>
          ) : null}

          <SaleFields
            form={form}
            provider={provider}
            onProvider={chooseProvider}
            orderRequired={orderRequired}
            scan={{ pending: scan.pending, edited: scan.edited, seen: scan.seen, flags: scan.flags, filled: scanFilled }}
            moreOpen={moreOpen}
            onMoreOpen={setMoreOpen}
          />
        </div>

        {/* Desktop, and phones while the keyboard is up: in the page flow. */}
        {submitBar(false)}
      </form>

      {/* Phones with the keyboard down: fixed in the tab bar's place. */}
      {keyboardOpen ? null : <BodyLayer>{submitBar(true)}</BodyLayer>}
    </div>
  );
}
