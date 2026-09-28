import type { Metadata } from 'next';
import Link from 'next/link';
import {
  AlertTriangle,
  Camera,
  Check,
  ChevronDown,
  ImageUp,
  LoaderCircle,
  Paperclip,
  PenLine,
  ScanText,
} from 'lucide-react';
import { recentSales, scanResult } from '../../_mock';
import n from '../native.module.css';
import s from '../sheet.module.css';
import { B_BASE, Shell } from '../_components/Shell';
import { DashboardView } from '../_components/DashboardView';
import { SaleForm } from '../_components/SaleForm';
import { Shot, type Mark } from '../_components/Shot';
import { money } from '../_components/format';

export const metadata: Metadata = { title: 'Log sale · B Native · Design lab' };

type State = 'default' | 'scan' | 'review';

const HERE = `${B_BASE}/log-sale`;

/* Screenshot order: provider, order #, customer, phone, address, plan, install date */
const SCAN_FIELDS = [
  { label: 'Provider', value: scanResult.provider.value },
  { label: 'Order number', value: scanResult.orderNumber.value },
  { label: 'Customer', value: scanResult.customerName.value },
  { label: 'Phone', value: null },
  { label: 'Service address', value: null },
  { label: 'Plan', value: null },
  { label: 'Install date', value: null },
];
const FOUND = SCAN_FIELDS.filter((f) => f.value).length;
const SCAN_MARKS: Mark[] = SCAN_FIELDS.map((f, i) => (f.value ? 'found' : i === FOUND ? 'reading' : undefined));
const REVIEW_MARKS: Mark[] = [
  scanResult.provider,
  scanResult.orderNumber,
  scanResult.customerName,
  scanResult.phone,
  scanResult.address,
  scanResult.plan,
  scanResult.installDate,
].map((f) => (f.confidence === 'high' ? 'found' : 'check'));

function DefaultBody() {
  return (
    <>
      <div className={s.scanCard}>
        <span className={s.scanIcon} aria-hidden>
          <ScanText size={30} strokeWidth={1.75} />
        </span>
        <h2 className={s.scanTitle}>Scan the order confirmation</h2>
        <p className={s.scanLede}>
          Photo or screenshot of the carrier&rsquo;s confirmation page. We fill in the sale, you check it and submit.
        </p>
        <div className={s.scanActions}>
          <Link href={`${HERE}?state=scan`} className={n.btnPrimary}>
            <Camera size={20} strokeWidth={2.25} aria-hidden />
            Take photo
          </Link>
          <Link href={`${HERE}?state=scan`} className={n.btnSecondary}>
            <ImageUp size={20} strokeWidth={2.25} aria-hidden />
            Choose screenshot
          </Link>
        </div>
      </div>
      <p className={`${n.groupFoot} ${s.scanFoot}`}>
        Reads the provider, order number, customer, phone, address, plan and install date.
      </p>

      <details className={`${n.group} ${s.manual}`}>
        <summary className={`${n.row} ${n.rowTiled} ${s.manualSummary}`}>
          <span className={`${n.tile} ${n.tileGray}`} aria-hidden>
            <PenLine size={18} strokeWidth={2} />
          </span>
          <span className={n.rowText}>
            <span className={n.rowTitle}>Enter manually</span>
            <span className={n.rowSub}>No screenshot? Type the sale in.</span>
          </span>
          <ChevronDown size={20} className={`${n.chevron} ${s.manualChevron}`} aria-hidden />
        </summary>
        <div className={s.manualBody}>
          <SaleForm prefilled={false} />
          <button type="button" className={n.btnPrimary}>
            Submit sale
          </button>
        </div>
      </details>
    </>
  );
}

function ScanBody() {
  const pct = Math.round((FOUND / SCAN_FIELDS.length) * 100);
  return (
    <div className={s.reviewGrid}>
      <aside className={s.readCard} aria-label="Screenshot">
        <div className={s.proofShot}>
          <Shot size={5} marks={SCAN_MARKS} />
        </div>
        <div className={s.proofShotLg}>
          <Shot size={13.5} marks={SCAN_MARKS} />
        </div>
        <div className={s.readText}>
          <p className={s.readTitle}>Reading your screenshot</p>
          <p className={n.rowSub}>
            Found {FOUND} of {SCAN_FIELDS.length} fields
          </p>
          <div
            className={s.progress}
            role="progressbar"
            aria-label="Reading screenshot"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct}
          >
            <i style={{ width: `${pct}%` }} />
          </div>
          <p className={s.readHint}>Takes a few seconds. You can keep this open or come back.</p>
        </div>
      </aside>

      <div className={`${n.group} ${s.scanList}`} aria-live="polite">
        {SCAN_FIELDS.map((f, i) => (
          <div key={f.label} className={s.scanRow}>
            <span className={s.fieldLabel}>{f.label}</span>
            {f.value ? (
              <span className={s.scanValue}>{f.value}</span>
            ) : (
              <span className={s.skeleton} style={{ width: `${[0, 0, 0, 52, 78, 44, 36][i]}%` }} />
            )}
            <span className={s.scanState} aria-hidden>
              {f.value ? (
                <Check size={18} strokeWidth={2.75} className={s.scanDone} />
              ) : i === FOUND ? (
                <LoaderCircle size={18} strokeWidth={2.5} className={s.spin} />
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewBody() {
  const flagged = Object.values(scanResult).filter((f) => f.confidence !== 'high').length;
  return (
    <div className={s.reviewGrid}>
      <aside className={s.proof} aria-label="Screenshot">
        <div className={s.proofShot}>
          <Shot size={3.4} marks={REVIEW_MARKS} />
        </div>
        <div className={s.proofShotLg}>
          <Shot size={13.5} marks={REVIEW_MARKS} />
        </div>
        <div className={s.proofText}>
          <span className={n.rowTitle}>Order confirmation</span>
          <span className={s.proofSub}>
            <Paperclip size={14} strokeWidth={2.25} aria-hidden />
            Attached as proof
          </span>
        </div>
        <Link href={HERE} className={`${n.textAction} ${s.proofReplace}`}>
          Replace
        </Link>
      </aside>

      <div className={s.reviewMain}>
        <div className={s.callout} role="note">
          <AlertTriangle size={20} strokeWidth={2.25} className={s.calloutIcon} aria-hidden />
          <div>
            <p className={s.calloutTitle}>Check {flagged} fields before you submit</p>
            <p className={s.calloutText}>Phone and install date were hard to read. Everything else matched.</p>
          </div>
        </div>
        <SaleForm prefilled />
      </div>
    </div>
  );
}

export default async function NativeLogSalePage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string | string[] }>;
}) {
  const { state: raw } = await searchParams;
  const state: State = raw === 'scan' || raw === 'review' ? raw : 'default';
  const estPay = recentSales.find((x) => x.plan === scanResult.plan.value)?.estPay;

  return (
    <div className={n.root}>
      <div className={s.stage}>
        {/* The screen the sheet was opened from, pushed back (desktop) */}
        <div className={s.behind} aria-hidden inert>
          <Shell active="home">
            <DashboardView />
          </Shell>
        </div>
        <div className={s.peek} aria-hidden />

        <section
          className={state === 'default' ? s.sheet : `${s.sheet} ${s.sheetWide}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="b-sheet-title"
        >
          <div className={s.grabber} aria-hidden />
          <header className={s.navBar}>
            <Link href={`${B_BASE}/dashboard`} className={n.textAction}>
              Cancel
            </Link>
            <h1 id="b-sheet-title" className={s.navTitle}>
              {state === 'review' ? 'Review sale' : 'Log sale'}
            </h1>
            <span />
          </header>

          <div className={s.body}>
            {state === 'default' && <DefaultBody />}
            {state === 'scan' && <ScanBody />}
            {state === 'review' && <ReviewBody />}
          </div>

          {state === 'scan' && (
            <footer className={s.footer}>
              <Link href={HERE} className={n.btnSecondary}>
                Stop and enter manually
              </Link>
            </footer>
          )}
          {state === 'review' && (
            <footer className={`${s.footer} ${s.footerSplit}`}>
              {estPay !== undefined && (
                <p className={s.footerPay}>
                  <span>Est. pay</span>
                  <strong>{money(estPay)}</strong>
                  <span>· pays 14 days after install</span>
                </p>
              )}
              <button type="button" className={n.btnPrimary}>
                Submit sale
              </button>
            </footer>
          )}
        </section>
      </div>
    </div>
  );
}
