'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  CopyCheck,
  ImageUp,
  Keyboard,
  RotateCw,
  ScanLine,
  WifiOff,
} from 'lucide-react';
import { FIBER_COMPANIES, SALE_TYPES, getPlanById, getPlansByCompany } from '@/types';
import { useCompPlan } from '@/hooks/useCompPlan';
import { useSaleFormState, type SaleFieldKey, type SaleFormFields } from '@/hooks/useSaleFormState';
import { NO_SIGNAL_SALE_MESSAGE } from '@/hooks/useSales';
import { expectedPayForSale } from '@/lib/pay/expectedPay';
import { payoutLabelForDraft } from '@/lib/pay/payoutWindow';
import { loggedSaleHref } from '@/lib/sales/loggedSale';
import { isExtraPlanId } from '@/lib/sales/planSelection';
import { MAX_PROOF_SCREENSHOTS } from '@/lib/sales/proofPaths';
import { todaySaleDateInput } from '@/lib/sales/saleDate';
import { BodyLayer } from './BodyLayer';
import { PROOF_ACCEPT, ProofCapture, useProofUploads } from './ProofCapture';
import { useHideRepTabBar } from './RepShell';
import { useSaleScan, type ScanFill, type ScanTarget } from './useSaleScan';
import s from './rep.module.css';
import l from './rep-logsale.module.css';

// Log a sale, direction D. Two steps: attach the carrier's confirmation
// screenshot(s) as proof, then check the sale details. The first screenshot is
// read (useSaleScan) to prefill the fields the rep has not typed in; the rep
// checks them and submits. "Enter manually" skips the screenshot, which makes
// the order number the proof (the hasSaleProof rule).

const FORM_ID = 'rep-log-sale';
const DEFAULT_PROVIDER = 'tfiber';
const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const shortSaleDate = (value: Date | string) =>
  new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

/** Short provider names for the segmented control ("TFiber", not "TFiber (T-Mobile)"). */
const PROVIDER_SHORT: Record<string, string> = {
  tfiber: 'TFiber',
  att: 'AT&T Fiber',
  frontier: 'Frontier',
  xfinity: 'Xfinity',
};

// The soft keyboard is up: a text field has focus on a touch device, or the
// visual viewport has shrunk well below the layout viewport. While it is, the
// submit bar leaves the fixed layer and sits at the end of the form, so it
// never rides the keyboard or covers the field being typed in.
function subscribeKeyboard(onChange: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener('resize', onChange);
  document.addEventListener('focusin', onChange);
  document.addEventListener('focusout', onChange);
  return () => {
    vv?.removeEventListener('resize', onChange);
    document.removeEventListener('focusin', onChange);
    document.removeEventListener('focusout', onChange);
  };
}

function keyboardOpenNow(): boolean {
  const vv = window.visualViewport;
  if (vv && window.innerHeight - vv.height > 150) return true;
  const el = document.activeElement;
  const typing =
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLInputElement && !['checkbox', 'radio', 'file', 'button', 'submit'].includes(el.type));
  return typing && window.matchMedia('(pointer: coarse)').matches;
}

function useSoftKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribeKeyboard, keyboardOpenNow, () => false);
}

function Steps({ onDetails, detailPct }: { onDetails: boolean; detailPct: number }) {
  const steps = [
    { label: 'Proof', pct: onDetails ? 100 : 0, current: !onDetails },
    { label: 'Details', pct: onDetails ? detailPct : 0, current: onDetails },
  ];
  return (
    <ol className={l.steps} aria-label="Progress">
      {steps.map((st, i) => (
        <li key={st.label} className={st.current ? l.stepOn : l.step} aria-current={st.current ? 'step' : undefined}>
          <span className={s.track}>
            <span className={s.fill} style={{ width: `${st.pct}%` }} />
          </span>
          <span className={l.stepLabel}>
            <b>{i + 1}</b> {st.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  required,
  wide,
  flag,
  reading,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  wide?: boolean;
  /** Filled from the screenshot without full confidence: the rep should check it. */
  flag?: 'low' | 'medium';
  /** The screenshot is being read and may fill this field. */
  reading?: boolean;
  children: ReactNode;
}) {
  const flagClass = flag === 'low' ? l.flagLow : flag === 'medium' ? l.flagMedium : '';
  return (
    <div className={`${l.field} ${error ? l.fieldInvalid : flagClass} ${wide ? l.wide : ''}`}>
      <label htmlFor={id} className={l.label}>
        {label}
        {flag && !error ? (
          <span className={l.flagTag}>
            <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />
            Check this
          </span>
        ) : required ? (
          <span className={l.req}>Required</span>
        ) : null}
      </label>
      {reading ? (
        <span className={l.readWrap}>
          {children}
          <span className={`${s.skel} ${l.readSkel}`} aria-hidden="true" />
        </span>
      ) : (
        children
      )}
      {error ? (
        <p id={`${id}-error`} className={l.fieldError}>
          <AlertTriangle size={14} strokeWidth={2.25} aria-hidden="true" />
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className={l.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** aria props for an input whose Field may show an error or a hint. */
function describe(id: string, error: string | undefined, hasHint: boolean) {
  return {
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hasHint ? `${id}-hint` : undefined,
  } as const;
}

export function RepLogSale() {
  const router = useRouter();
  const { formRef, errorRef, ...form } = useSaleFormState();
  const { rates, hasPlan, error: planError, retry: retryPlan } = useCompPlan();
  const [step, setStep] = useState<'entry' | 'details'>('entry');
  const [providerChoice, setProviderChoice] = useState<string | null>(null);

  const hasInternetPlan = form.products.some((p) => !isExtraPlanId(p.productId));
  const scan = useSaleScan({
    paths: form.proofPaths,
    isEmpty: (target) =>
      target === 'plan' ? !hasInternetPlan : !form.formData[target].trim(),
    apply: (fills: ScanFill[]) => {
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
  const keyboardOpen = useSoftKeyboardOpen();
  const pickId = useId();

  // A restored draft goes straight back to the details.
  const onDetails = step === 'details' || form.fromDraft;
  useHideRepTabBar(onDetails);

  const { formData, errors, products } = form;
  const provider = form.provider ?? providerChoice ?? DEFAULT_PROVIDER;
  const internetPlans = getPlansByCompany(provider).filter((plan) => plan.category !== 'extra');
  const extras = getPlansByCompany(provider).filter((plan) => plan.category === 'extra');
  const internetId = products.find((p) => !isExtraPlanId(p.productId))?.productId ?? '';
  const screenshotCount = form.proofPaths.length;
  const proofTiles = uploads.tiles.length;
  const orderRequired = screenshotCount === 0;
  const showMore = moreOpen || Boolean(errors.saleDate);

  const est = hasPlan && products.length > 0 ? expectedPayForSale({ products }, rates) : null;
  // T-Fiber + an install date: the estimated payout window, live as the date changes.
  const payoutLabel = payoutLabelForDraft(products, formData.installDate);

  const requiredDone = [
    Boolean(internetId || products.length),
    Boolean(formData.customerAddress.trim()),
    Boolean(formData.installDate),
    Boolean(screenshotCount || formData.orderNumberOrBtn.trim()),
  ].filter(Boolean).length;

  const pickFiles = (files: FileList | null) => {
    const taken = uploads.addFiles(Array.from(files ?? []));
    if (taken > 0) setStep('details');
  };

  const chooseProvider = (company: string) => {
    scan.edited('plan');
    setProviderChoice(company);
    form.keepProvider(company);
  };

  // A new sale opens Sales on the month it was sold in, confirmed by name. So
  // does a retry that finds this same entry already stored (the form reports it
  // as a plain success). A duplicate left over is a different entry: it stays.
  const afterSubmit = (result: Awaited<ReturnType<typeof form.submit>>, saleDate: string) => {
    if (!result || result.duplicate) return;
    router.push(result.sale.id ? loggedSaleHref(result.sale.id, saleDate) : '/portal/sales');
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

  const duplicate = form.duplicateOf;
  const duplicateRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (duplicate) duplicateRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [duplicate]);

  const input = (
    name: keyof SaleFormFields,
    options: { error?: SaleFieldKey; hint?: boolean } = {}
  ) => {
    const reading = scan.pending(name as ScanTarget);
    return {
      id: name,
      name,
      value: formData[name],
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
        scan.edited(name as ScanTarget);
        form.handleChange(e);
      },
      onFocus: () => scan.seen(name as ScanTarget),
      className: reading ? `${l.input} ${l.inputReading}` : l.input,
      'aria-busy': reading || undefined,
      ...describe(name, options.error ? errors[options.error] : undefined, Boolean(options.hint)),
    };
  };
  /** Field props for a field the screenshot reader can fill. */
  const scanned = (target: ScanTarget) => ({ flag: scan.flags[target], reading: scan.pending(target) });

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
          {est !== null ? (
            <span className={l.estNum}>{money(est)}</span>
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
        disabled={form.submitting}
        aria-disabled={uploads.uploadingCount > 0 || undefined}
      >
        {form.submitting ? 'Submitting…' : uploads.uploadingCount > 0 ? 'Uploading…' : 'Submit sale'}
      </button>
    </div>
  );

  if (!onDetails) {
    return (
      <div className={l.main}>
        <Steps onDetails={false} detailPct={0} />
        <div className={l.defaultGrid}>
          <section className={`${s.panel} ${l.entry}`} aria-labelledby="entry-h">
            <ScanLine size={36} strokeWidth={1.75} className={l.entryIcon} aria-hidden="true" />
            <h1 id="entry-h" className={l.entryTitle}>
              Attach order confirmation
            </h1>
            <p className={l.entryLede}>
              Attach the carrier&apos;s confirmation page as proof. You type the details next.
            </p>
            <div className={l.entryActions}>
              <label className={`${s.btnPrimary} ${s.btnBlock} ${s.phoneOnly}`}>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className={s.srOnly}
                  onChange={(e) => {
                    pickFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
                <Camera size={20} strokeWidth={2.25} aria-hidden="true" />
                Take photo
              </label>
              <label className={`${s.btnSecondary} ${s.btnBlock} ${s.phoneOnly}`}>
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
                <ImageUp size={18} aria-hidden="true" />
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
            <p className={l.entryWorks}>
              Up to {MAX_PROOF_SCREENSHOTS} screenshots. TFiber, AT&amp;T Fiber, Frontier, Xfinity.
            </p>
          </section>

          <div className={l.side}>
            <section className={l.tips} aria-labelledby="tips-h">
              <h2 id="tips-h" className={s.kicker}>
                For good proof
              </h2>
              <ul>
                <li>
                  <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                  Whole page in frame, order number down to install date
                </li>
                <li>
                  <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                  A screenshot is sharper than a photo of a screen
                </li>
                <li>
                  <Check size={16} strokeWidth={2.5} aria-hidden="true" />
                  Confirmation runs long? Attach up to {MAX_PROOF_SCREENSHOTS} screenshots
                </li>
              </ul>
            </section>
            <button type="button" className={`${s.panel} ${l.manual}`} onClick={() => setStep('details')}>
              <Keyboard size={20} strokeWidth={1.75} aria-hidden="true" className={l.manualIcon} />
              <span className={l.manualText}>
                <span className={l.manualTitle}>Enter manually</span>
                <span className={l.manualSub}>No screenshot? Type it in with the order number.</span>
              </span>
              <ChevronRight size={20} aria-hidden="true" className={l.manualIcon} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${l.main} ${l.mainDetails}`}>
      <Steps onDetails detailPct={(requiredDone / 4) * 100} />
      <form id={FORM_ID} ref={formRef} className={l.reviewGrid} onSubmit={onSubmit} noValidate>
        <ProofCapture uploads={uploads} orderRequired={orderRequired && proofTiles === 0} />

        <div className={l.reviewMain}>
          <header>
            <h1 className={l.title}>Sale details</h1>
            {scan.status === 'reading' ? (
              <div className={l.scanRow}>
                <p className={l.lede} role="status">
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

          <div className={l.formGrid}>
            <fieldset className={`${l.field} ${l.fieldset} ${l.wide}`}>
              <legend className={l.label}>Provider</legend>
              <div className={l.segmented}>
                {FIBER_COMPANIES.map((company) => (
                  <label key={company.value} className={l.chip}>
                    <input
                      type="radio"
                      name="provider"
                      value={company.value}
                      checked={provider === company.value}
                      onChange={() => chooseProvider(company.value)}
                    />
                    {PROVIDER_SHORT[company.value] ?? company.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <Field id="plan" label="Plan" error={errors.plan} required {...scanned('plan')}>
              <span className={l.selectWrap}>
                <select
                  id="plan"
                  className={scan.pending('plan') ? `${l.input} ${l.inputReading}` : l.input}
                  value={internetId}
                  onChange={(e) => {
                    scan.edited('plan');
                    const plan = getPlanById(e.target.value);
                    if (plan) form.addPlan(plan);
                  }}
                  onFocus={() => scan.seen('plan')}
                  aria-busy={scan.pending('plan') || undefined}
                  {...describe('plan', errors.plan, false)}
                >
                  <option value="" disabled>
                    Choose a plan
                  </option>
                  {internetPlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={18} aria-hidden="true" />
              </span>
            </Field>

            <Field
              id="orderNumberOrBtn"
              label="Order number or BTN"
              required={orderRequired}
              error={errors.orderNumberOrBtn}
              hint={orderRequired ? 'Needed when there is no screenshot.' : undefined}
              {...scanned('orderNumberOrBtn')}
            >
              <input
                {...input('orderNumberOrBtn', { error: 'orderNumberOrBtn', hint: orderRequired })}
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
              />
            </Field>

            {extras.length > 0 ? (
              <fieldset className={`${l.field} ${l.fieldset} ${l.wide}`}>
                <legend className={l.label}>Extras sold</legend>
                <ul className={l.extras}>
                  {extras.map((plan) => {
                    const on = products.some((p) => p.productId === plan.id);
                    return (
                      <li key={plan.id}>
                        <label className={l.extra}>
                          <input type="checkbox" checked={on} onChange={() => form.toggleExtra(plan)} />
                          <span className={l.extraBox} aria-hidden="true">
                            {on ? <Check size={14} strokeWidth={3} /> : null}
                          </span>
                          <span className={l.extraName}>{plan.name}</span>
                          <span className={l.extraKind}>{plan.speed}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ) : null}

            <Field id="customerName" label="Customer name" {...scanned('customerName')}>
              <input {...input('customerName')} type="text" autoComplete="off" autoCapitalize="words" />
            </Field>

            <Field id="customerPhone" label="Phone" {...scanned('customerPhone')}>
              <input {...input('customerPhone')} type="tel" inputMode="tel" autoComplete="off" />
            </Field>

            <Field
              id="customerAddress"
              label="Service address"
              required
              error={errors.customerAddress}
              {...scanned('customerAddress')}
            >
              <input
                {...input('customerAddress', { error: 'customerAddress' })}
                type="text"
                autoComplete="off"
                placeholder="Street, city, state, ZIP"
              />
            </Field>

            <Field id="installDate" label="Install date" required error={errors.installDate} {...scanned('installDate')}>
              <input {...input('installDate', { error: 'installDate' })} type="date" />
            </Field>

            <details
              className={`${l.more} ${l.wide}`}
              open={showMore}
              onToggle={(e) => setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}
            >
              <summary className={l.moreSummary}>
                <span>More details</span>
                <span className={l.moreSub}>Email, sale type, sale date, notes</span>
                <ChevronDown size={20} aria-hidden="true" className={l.moreChev} />
              </summary>
              <div className={l.moreGrid}>
                <Field id="customerEmail" label="Email">
                  <input {...input('customerEmail')} type="email" inputMode="email" autoComplete="off" />
                </Field>
                <Field id="saleType" label="Sale type">
                  <span className={l.selectWrap}>
                    <select {...input('saleType')}>
                      {SALE_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={18} aria-hidden="true" />
                  </span>
                </Field>
                <Field
                  id="saleDate"
                  label="Sale date"
                  error={errors.saleDate}
                  hint={
                    form.saleDateFromInstall
                      ? 'Dated to the install day. Change it if the sale happened earlier.'
                      : 'The day the customer signed up, not the install day.'
                  }
                >
                  <input {...input('saleDate', { error: 'saleDate', hint: true })} type="date" max={todaySaleDateInput()} />
                </Field>
                <Field id="notes" label="Notes">
                  <textarea
                    id="notes"
                    name="notes"
                    value={formData.notes}
                    onChange={(e) => {
                      scan.edited('notes');
                      form.handleChange(e);
                    }}
                    className={`${l.input} ${l.textarea}`}
                    rows={3}
                    placeholder="Anything the reviewer should know"
                  />
                </Field>
              </div>
            </details>
          </div>
        </div>

        {/* Desktop, and phones while the keyboard is up: in the page flow. */}
        {submitBar(false)}
      </form>

      {/* Phones with the keyboard down: fixed in the tab bar's place. */}
      {keyboardOpen ? null : <BodyLayer>{submitBar(true)}</BodyLayer>}
    </div>
  );
}
