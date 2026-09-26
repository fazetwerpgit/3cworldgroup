import Image from 'next/image';
import Link from 'next/link';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ImageUp,
  Keyboard,
  RotateCcw,
  ScanLine,
} from 'lucide-react';
import { providers, recentSales, scanResult } from '../../_mock';
import { Shell, TabBar, TopBar, auraFrom, href, navFrom, type Aura, type Nav } from '../Chrome';
import { money } from '../format';
import proof from '../proof.jpg';
import s from '../scoreboard.module.css';
import l from '../logsale.module.css';

export const metadata = { title: 'Log a sale · Scoreboard navy (D)' };

type View = 'default' | 'scan' | 'review';
type Props = {
  searchParams: Promise<{ state?: string | string[]; nav?: string | string[]; aura?: string | string[] }>;
};

const FIELDS = [
  { key: 'provider', label: 'Provider' },
  { key: 'orderNumber', label: 'Order number' },
  { key: 'customerName', label: 'Customer' },
  { key: 'phone', label: 'Phone' },
  { key: 'address', label: 'Service address' },
  { key: 'plan', label: 'Plan' },
  { key: 'installDate', label: 'Install date' },
] as const;

const READ_SO_FAR = 4;

export default async function LogSalePage({ searchParams }: Props) {
  const { state, nav: navParam, aura: auraParam } = await searchParams;
  const nav = navFrom(navParam);
  const aura = auraFrom(auraParam);
  const view: View = state === 'scan' ? 'scan' : state === 'review' ? 'review' : 'default';
  // Review has its own fixed submit bar in the tab bar's place.
  const withTabs = view !== 'review';

  return (
    <Shell withTabbar={withTabs} aura={aura}>
      <TopBar section="log" nav={nav} aura={aura} task={{ title: 'Log a sale' }} />
      <main className={`${s.main} ${l.main} ${view === 'review' ? l.mainReview : ''}`}>
        <Steps view={view} />
        {view === 'default' ? <DefaultView /> : null}
        {view === 'scan' ? <ScanView nav={nav} aura={aura} /> : null}
        {view === 'review' ? <ReviewView nav={nav} aura={aura} /> : null}
      </main>
      {withTabs ? <TabBar section="log" nav={nav} aura={aura} /> : null}
    </Shell>
  );
}

/* ------------------------------------------------------------------ */

function Steps({ view }: { view: View }) {
  const toCheck = FIELDS.filter((f) => scanResult[f.key].confidence !== 'high').length;
  const steps = [
    {
      label: 'Scan',
      pct: view === 'default' ? 0 : view === 'scan' ? (READ_SO_FAR / FIELDS.length) * 100 : 100,
      current: view !== 'review',
    },
    {
      label: 'Check & submit',
      pct: view === 'review' ? ((FIELDS.length - toCheck) / FIELDS.length) * 100 : 0,
      current: view === 'review',
    },
  ];
  return (
    <ol className={l.steps} aria-label="Progress">
      {steps.map((st, i) => (
        <li key={st.label} className={st.current ? l.stepOn : l.step} aria-current={st.current ? 'step' : undefined}>
          <span className={s.track}>
            <span className={`${s.fill} ${view === 'scan' && i === 0 ? l.fillLive : ''}`} style={{ width: `${st.pct}%` }} />
          </span>
          <span className={l.stepLabel}>
            <b>{i + 1}</b> {st.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */

function DefaultView() {
  return (
    <div className={l.defaultGrid}>
      <section className={`${s.panel} ${l.entry}`} aria-labelledby="scan-h">
        <ScanLine size={36} strokeWidth={1.75} className={l.entryIcon} aria-hidden />
        <h1 id="scan-h" className={l.entryTitle}>
          Scan order confirmation
        </h1>
        <p className={l.entryLede}>
          Screenshot the carrier&apos;s confirmation page. We fill in the sale, you check it and submit.
        </p>
        <div className={l.entryActions}>
          <label className={`${s.btnPrimary} ${s.btnBlock} ${s.phoneOnly}`}>
            <input type="file" accept="image/*" capture="environment" className={s.srOnly} />
            <Camera size={20} strokeWidth={2.25} aria-hidden />
            Take photo
          </label>
          <label className={`${s.btnSecondary} ${s.btnBlock} ${s.phoneOnly}`}>
            <input type="file" accept="image/*" className={s.srOnly} />
            <ImageUp size={18} aria-hidden />
            Choose screenshot
          </label>
          <label className={`${s.btnPrimary} ${s.deskOnly}`}>
            <input type="file" accept="image/*" className={s.srOnly} />
            <ImageUp size={20} strokeWidth={2.25} aria-hidden />
            Choose screenshot
          </label>
        </div>
        <p className={l.entryWorks}>Works with {providers.join(', ')}</p>
      </section>

      <div className={l.side}>
        <section className={l.tips} aria-labelledby="tips-h">
          <h2 id="tips-h" className={s.kicker}>
            For a clean read
          </h2>
          <ul>
            <li>
              <Check size={16} strokeWidth={2.5} aria-hidden />
              Whole page in frame, order number down to install date
            </li>
            <li>
              <Check size={16} strokeWidth={2.5} aria-hidden />
              A screenshot reads better than a photo of a screen
            </li>
            <li>
              <Check size={16} strokeWidth={2.5} aria-hidden />
              Blurry spots get flagged for you to check, not guessed
            </li>
          </ul>
        </section>

        <details className={`${s.panel} ${l.manual}`}>
          <summary className={l.manualSummary}>
            <Keyboard size={20} strokeWidth={1.75} aria-hidden className={l.manualIcon} />
            <span className={l.manualText}>
              <span className={l.manualTitle}>Enter manually</span>
              <span className={l.manualSub}>No screenshot? Type the order in.</span>
            </span>
            <ChevronDown size={20} aria-hidden className={l.manualChev} />
          </summary>
          <form className={l.manualForm}>
            <ProviderPicker />
            <Field id="m-plan" label="Plan" placeholder="e.g. TFiber 1 Gig" />
            <Field id="m-order" label="Order number" placeholder="From the confirmation" />
            <Field id="m-name" label="Customer name" autoComplete="off" />
            <Field id="m-phone" label="Phone" inputMode="tel" />
            <Field id="m-address" label="Service address" />
            <Field id="m-date" label="Install date" placeholder="e.g. Sep 26" />
            <button type="button" className={`${s.btnPrimary} ${s.btnBlock}`}>
              Submit sale
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ScanView({ nav, aura }: { nav: Nav; aura: Aura }) {
  const pct = Math.round((READ_SO_FAR / FIELDS.length) * 100);
  return (
    <div className={l.scanGrid}>
      <figure className={l.proofLive}>
        <Image src={proof} alt="Order confirmation screenshot" className={l.proofImg} sizes="(min-width: 1024px) 340px, 120px" priority />
        <span className={l.sweep} aria-hidden />
      </figure>

      <div className={l.readout}>
        <h1 className={l.title}>Reading your screenshot</h1>
        <p className={l.lede} role="status">
          Found {READ_SO_FAR} of {FIELDS.length} fields. Keep this screen open, it takes a few seconds.
        </p>
        <div className={l.meter}>
          <span className={s.track}>
            <span className={`${s.fill} ${l.fillLive}`} style={{ width: `${pct}%` }} />
          </span>
          <span className={l.meterNum}>
            {READ_SO_FAR}
            <span>/{FIELDS.length}</span>
          </span>
        </div>
      </div>

      <ol className={`${s.panel} ${l.readList}`}>
        {FIELDS.map((f, i) => {
          const done = i < READ_SO_FAR;
          const reading = i === READ_SO_FAR;
          return (
            <li key={f.key} className={`${l.readRow} ${done ? l.readDone : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
              <span className={l.readLabel}>{f.label}</span>
              {done ? (
                <span className={l.readValue}>{scanResult[f.key].value}</span>
              ) : (
                <span className={`${l.skel} ${reading ? l.skelLive : ''}`} aria-label={reading ? 'Reading' : 'Waiting'} />
              )}
              <span className={l.readMark} aria-hidden>
                {done ? <Check size={16} strokeWidth={2.75} /> : null}
              </span>
            </li>
          );
        })}
      </ol>

      <Link href={href('log-sale', nav, undefined, aura)} className={`${s.btnSecondary} ${l.cancel}`}>
        Cancel
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ReviewView({ nav, aura }: { nav: Nav; aura: Aura }) {
  const r = scanResult;
  const flagged = FIELDS.filter((f) => r[f.key].confidence !== 'high');
  const planOptions = [...new Set(recentSales.filter((x) => x.provider === r.provider.value).map((x) => x.plan))];
  const estPay = recentSales.find((x) => x.plan === r.plan.value)?.estPay;

  return (
    <form className={l.reviewGrid} action={href('log-sale', 'dock')}>
      <input type="hidden" name="state" value="review" />
      {nav === 'float' ? <input type="hidden" name="nav" value="b" /> : null}
      {aura === 1 ? null : <input type="hidden" name="aura" value={aura} />}
      <aside className={l.proofCard}>
        <Image src={proof} alt="Order confirmation screenshot, attached as proof" className={l.proofImg} sizes="(min-width: 1024px) 340px, 64px" priority />
        <div className={l.proofMeta}>
          <p className={s.kicker}>Proof attached</p>
          <p className={l.proofName}>{r.provider.value} confirmation</p>
        </div>
        <Link href={href('log-sale', nav, undefined, aura)} className={`${s.btnSecondary} ${l.retake}`}>
          <RotateCcw size={16} aria-hidden />
          Retake
        </Link>
      </aside>

      <div className={l.reviewMain}>
        <header>
          <h1 className={l.title}>Check and submit</h1>
          <p className={l.lede}>Filled in from your screenshot. Fix anything that&apos;s off.</p>
        </header>

        <div className={l.alert} role="note">
          <AlertTriangle size={20} strokeWidth={2} aria-hidden />
          <p>
            <strong>{flagged.length} to check:</strong>{' '}
            {flagged.map((f, i) => (
              <span key={f.key}>
                {i > 0 ? ' and ' : ''}
                <a href={`#r-${f.key}`}>{f.label.toLowerCase()}</a>
              </span>
            ))}
          </p>
        </div>

        <div className={l.formGrid}>
          <ProviderPicker chosen={r.provider.value} wide />
          <div className={l.field}>
            <label htmlFor="r-plan" className={l.label}>
              Plan
            </label>
            <span className={l.selectWrap}>
              <select id="r-plan" className={l.input} defaultValue={r.plan.value}>
                {planOptions.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <ChevronDown size={18} aria-hidden />
            </span>
          </div>
          <Field id="r-orderNumber" label="Order number" value={r.orderNumber.value} />
          <Field id="r-customerName" label="Customer name" value={r.customerName.value} />
          <Field
            id="r-phone"
            label="Phone"
            value={r.phone.value}
            inputMode="tel"
            flag="medium"
            hint="One digit was hard to read. Match it to the screenshot."
          />
          <Field id="r-address" label="Service address" value={r.address.value} />
          <Field
            id="r-installDate"
            label="Install date"
            value={r.installDate.value}
            flag="low"
            hint="Marked tentative on the confirmation. Confirm with the customer."
          />
        </div>
      </div>

      <div className={l.submitBar}>
        {estPay ? (
          <p className={l.estPay}>
            <span className={s.kicker}>Est. pay</span>
            <span className={l.estNum}>{money(estPay)}</span>
            <span className={l.estWhen}>~2 wks after install</span>
          </p>
        ) : null}
        <button type="submit" className={`${s.btnPrimary} ${l.submit}`}>
          Submit sale
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */

function ProviderPicker({ chosen, wide }: { chosen?: string; wide?: boolean }) {
  const name = chosen ? 'r-provider' : 'm-provider';
  return (
    <fieldset className={`${l.field} ${l.fieldset} ${wide ? l.wide : ''}`}>
      <legend className={l.label}>Provider</legend>
      <div className={s.segmented}>
        {providers.map((p) => (
          <label key={p} className={s.chip}>
            <input type="radio" name={name} value={p} defaultChecked={p === chosen} />
            {p}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Field({
  id,
  label,
  value,
  placeholder,
  inputMode,
  autoComplete,
  flag,
  hint,
  wide,
}: {
  id: string;
  label: string;
  value?: string;
  placeholder?: string;
  inputMode?: 'tel' | 'text';
  autoComplete?: string;
  flag?: 'low' | 'medium';
  hint?: string;
  wide?: boolean;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div
      id={id}
      className={`${l.field} ${flag ? l[`flag_${flag}`] : ''} ${wide ? l.wide : ''}`}
    >
      <label htmlFor={`${id}-in`} className={l.label}>
        {label}
        {flag ? (
          <span className={l.flagTag}>
            <AlertTriangle size={14} strokeWidth={2.25} aria-hidden />
            Check this
          </span>
        ) : null}
      </label>
      <input
        id={`${id}-in`}
        className={l.input}
        defaultValue={value}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete={autoComplete}
        aria-describedby={hintId}
        aria-invalid={flag === 'low' ? true : undefined}
      />
      {hint ? (
        <p id={hintId} className={l.hint}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
