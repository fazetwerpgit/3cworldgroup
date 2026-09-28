import Image from 'next/image';
import Link from 'next/link';
import { Camera, Check, ChevronDown, ChevronLeft, CircleAlert, ImageUp } from 'lucide-react';
import { providers, recentSales, scanResult } from '../../_mock';
import { Frame, money } from '../_ui/Chrome';
import confirmation from '../_ui/order-confirmation.jpg';
import n from '../night.module.css';
import s from '../logSale.module.css';

export const metadata = { title: 'Log a sale — A · Night Editorial' };

type State = 'default' | 'scan' | 'review';
type FieldKey = keyof typeof scanResult;

const HREF = '/design-lab/a/log-sale';

/* The order the reader fills fields in, and what a rep calls each one. */
const FIELDS: { key: Exclude<FieldKey, 'provider' | 'plan'>; label: string; inputMode?: 'tel' | 'text' }[] = [
  { key: 'orderNumber', label: 'Order number' },
  { key: 'customerName', label: 'Customer name' },
  { key: 'phone', label: 'Customer phone', inputMode: 'tel' },
  { key: 'address', label: 'Service address' },
  { key: 'installDate', label: 'Install date' },
];

const SCAN_ORDER: { key: FieldKey; label: string }[] = [
  { key: 'provider', label: 'Provider' },
  { key: 'orderNumber', label: 'Order number' },
  { key: 'customerName', label: 'Customer' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Address' },
  { key: 'plan', label: 'Plan' },
  { key: 'installDate', label: 'Install date' },
];
const READ_SO_FAR = 4;

/* Why the reader was unsure — written for the rep, not about the model. */
const CHECK_NOTE: Partial<Record<FieldKey, string>> = {
  phone: 'One digit was hard to read. Read it back to the customer.',
  installDate: 'The date sat under Safari’s toolbar in your screenshot. Confirm it on the order.',
};

/* Plans offered for the chosen provider, taken from sales already logged. */
const plansFor = (provider: string) => [...new Set(recentSales.filter((x) => x.provider === provider).map((x) => x.plan))];

/* Reps are paid ~14 days after install. */
const payDateFrom = (installDate: string) => {
  const d = new Date(`${installDate}, 2026`);
  d.setDate(d.getDate() + 14);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export default async function LogSaleA({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { state: raw } = await searchParams;
  const state: State = raw === 'scan' || raw === 'review' ? raw : 'default';

  return (
    <Frame current="log" bottomNav={false}>
      <div className={s.topBar}>
        <Link href="/design-lab/a/dashboard" className={s.back}>
          <ChevronLeft size={22} strokeWidth={1.75} aria-hidden />
          Home
        </Link>
      </div>
      {state === 'default' && <Entry />}
      {state === 'scan' && <Reading />}
      {state === 'review' && <Review />}
    </Frame>
  );
}

/* ---- default: scan first, manual folded away ------------------------------ */

function Entry() {
  return (
    <div className={s.layout}>
      <header className={s.intro}>
        <p className={n.kicker}>Log a sale</p>
        <h1 className={`${n.displayTitle} ${s.title}`}>Scan the order confirmation</h1>
        <p className={`${n.lede} ${s.lede}`}>
          Screenshot the carrier’s confirmation page. We read the order off it, you check it and submit.
        </p>
      </header>

      <div className={s.work}>
        <section className={s.scan} aria-label="Scan order confirmation">
          <div className={s.drop}>
            <ImageUp className={s.dropIcon} size={32} strokeWidth={1.5} aria-hidden />
            <p className={s.dropHint}>Drop the screenshot here</p>
            <div className={s.scanActions}>
              <label className={`${n.btnPrimary} ${s.scanPrimary}`}>
                <ImageUp size={22} strokeWidth={2} aria-hidden />
                Choose screenshot
                <input className={n.srOnly} type="file" accept="image/*" />
              </label>
              <label className={n.btnSecondary}>
                <Camera size={22} strokeWidth={1.75} aria-hidden />
                Take a photo
                <input className={n.srOnly} type="file" accept="image/*" capture="environment" />
              </label>
            </div>
          </div>
          <p className={s.reads}>
            Works with {providers.slice(0, -1).join(', ')} and {providers.at(-1)}. Reads provider, order number,
            customer, phone, address, plan and install date.
          </p>
        </section>

        <details className={s.manual}>
          <summary className={s.manualSummary}>
            <span>
              <span className={s.manualTitle}>Enter manually</span>
              <span className={s.manualNote}>No screenshot? Type it in, about two minutes.</span>
            </span>
            <ChevronDown className={s.manualChev} size={22} strokeWidth={1.75} aria-hidden />
          </summary>
          <form className={s.form} action={HREF}>
            <ProviderPlan provider="" plan="" />
            {FIELDS.map((f) => (
              <label key={f.key} className={n.field}>
                <span className={n.fieldLabel}>{f.label}</span>
                <input className={n.input} name={f.key} inputMode={f.inputMode} autoComplete="off" />
              </label>
            ))}
            <button type="submit" className={`${n.btnPrimary} ${s.formSubmit}`}>
              Submit sale
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}

/* ---- scan: reading, fields arriving one at a time ------------------------- */

function Reading() {
  const pct = Math.round((READ_SO_FAR / SCAN_ORDER.length) * 100);
  const reading = SCAN_ORDER[READ_SO_FAR];
  return (
    <div className={s.layout}>
      <header className={s.intro}>
        <p className={n.kicker}>New sale · Step 1 of 2</p>
        <h1 className={`${n.displayTitle} ${s.title}`}>Reading your screenshot</h1>
        <p className={`${n.lede} ${s.lede}`}>Stay on this screen. It usually takes under ten seconds.</p>
      </header>

      <aside className={s.aside}>
        <Thumb dim />
        <div className={s.progressBlock}>
          <div className={s.progressHead}>
            <p className={s.progressCount}>
              {READ_SO_FAR}
              <span> of {SCAN_ORDER.length}</span>
            </p>
            <p className={s.progressNow} aria-live="polite">
              Reading {reading.label.toLowerCase()}
            </p>
          </div>
          <div
            className={s.progress}
            role="progressbar"
            aria-label="Reading screenshot"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <span style={{ transform: `scaleX(${pct / 100})` }} />
          </div>
        </div>
      </aside>

      <div className={s.work}>
        <dl className={s.readList}>
          {SCAN_ORDER.map((f, i) => {
            const done = i < READ_SO_FAR;
            return (
              <div key={f.key} className={s.readRow} data-state={done ? 'done' : i === READ_SO_FAR ? 'now' : 'wait'}>
                <dt className={s.readLabel}>{f.label}</dt>
                <dd className={s.readValue}>
                  {done ? (
                    <>
                      {scanResult[f.key].value}
                      <Check className={s.readTick} size={18} strokeWidth={2} aria-label="read" />
                    </>
                  ) : (
                    <span className={s.skeleton} aria-label="Not read yet" />
                  )}
                </dd>
              </div>
            );
          })}
        </dl>

        <Link href={HREF} className={`${n.btnSecondary} ${s.cancel}`}>
          Cancel
        </Link>
      </div>
    </div>
  );
}

/* ---- review: prefilled, flagged, one submit ------------------------------- */

function Review() {
  const flagged = FIELDS.filter((f) => scanResult[f.key].confidence !== 'high');
  const plan = scanResult.plan.value;
  const estPay = recentSales.find((x) => x.plan === plan)?.estPay;
  const install = scanResult.installDate.value;

  return (
    <div className={`${s.layout} ${s.reviewLayout}`}>
      <header className={s.intro}>
        <p className={n.kicker}>New sale · Step 2 of 2</p>
        <h1 className={`${n.displayTitle} ${s.title}`}>Check and submit</h1>
        <p className={`${n.lede} ${s.lede}`}>
          {flagged.length} fields need a look:{' '}
          {flagged.map((f, i) => (
            <span key={f.key}>
              {i > 0 && ' and '}
              <a href={`#f-${f.key}`} className={s.flagLink}>
                {f.label.replace('Customer ', '').toLowerCase()}
              </a>
            </span>
          ))}
          . Everything else matches the screenshot.
        </p>
      </header>

      <aside className={`${s.aside} ${s.reviewAside}`}>
        <Thumb />
        <div className={s.proofText}>
          <p className={s.proofTitle}>Order confirmation</p>
          <p className={s.proofNote}>Attached to this sale as proof.</p>
          <Link href={HREF} className={n.quietLink}>
            Use a different screenshot
          </Link>
        </div>
      </aside>

      <form className={`${s.work} ${s.reviewForm}`} action={HREF}>
        <ProviderPlan provider={scanResult.provider.value} plan={plan} />

        {FIELDS.map((f) => {
          const check = scanResult[f.key].confidence !== 'high';
          return (
            <label key={f.key} id={`f-${f.key}`} className={n.field} data-check={check ? '' : undefined}>
              <span className={n.fieldTop}>
                <span className={n.fieldLabel}>{f.label}</span>
                {check && (
                  <span className={s.checkTag}>
                    <CircleAlert size={16} strokeWidth={2} aria-hidden />
                    Check this
                  </span>
                )}
              </span>
              <input
                className={`${n.input} ${check ? s.inputCheck : ''}`}
                name={f.key}
                defaultValue={scanResult[f.key].value}
                inputMode={f.inputMode}
                aria-describedby={check ? `note-${f.key}` : undefined}
                autoComplete="off"
              />
              {check && (
                <span id={`note-${f.key}`} className={s.checkNote}>
                  {CHECK_NOTE[f.key]}
                </span>
              )}
            </label>
          );
        })}

        <div className={n.actionBar}>
          {estPay !== undefined && (
            <p className={s.payLine}>
              Est. <b>{money(estPay)}</b> · pays around {payDateFrom(install)} if it installs {install}
            </p>
          )}
          <button type="submit" className={n.btnPrimary}>
            Submit sale
          </button>
        </div>
      </form>
    </div>
  );
}

/* ---- shared bits ---------------------------------------------------------- */

function ProviderPlan({ provider, plan }: { provider: string; plan: string }) {
  const plans = provider ? plansFor(provider) : [];
  return (
    <>
      <fieldset className={s.choice}>
        <legend className={n.fieldLabel}>Provider</legend>
        <div className={n.chipSet}>
          {providers.map((p) => (
            <label key={p} className={n.chip}>
              <input type="radio" name="provider" value={p} defaultChecked={p === provider} />
              {p}
            </label>
          ))}
        </div>
      </fieldset>
      {plans.length > 0 ? (
        <fieldset className={s.choice}>
          <legend className={n.fieldLabel}>Plan</legend>
          <div className={n.chipSet}>
            {plans.map((p) => (
              <label key={p} className={n.chip}>
                <input type="radio" name="plan" value={p} defaultChecked={p === plan} />
                {p}
              </label>
            ))}
          </div>
        </fieldset>
      ) : (
        <label className={n.field}>
          <span className={n.fieldLabel}>Plan</span>
          <input className={n.input} name="plan" placeholder="e.g. TFiber 1 Gig" autoComplete="off" />
        </label>
      )}
    </>
  );
}

function Thumb({ dim = false }: { dim?: boolean }) {
  return (
    <figure className={s.thumb} data-dim={dim ? '' : undefined}>
      <Image
        src={confirmation}
        alt="Screenshot of the TFiber order confirmation for Alicia Martinez"
        sizes="(min-width: 1024px) 240px, 112px"
        className={s.thumbImg}
        placeholder="empty"
      />
    </figure>
  );
}
