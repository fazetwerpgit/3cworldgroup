'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  CopyCheck,
  History,
  ImageIcon,
  ImageUp,
  Mail,
  Pencil,
  Phone,
  Trash2,
  X,
} from 'lucide-react';
import { AuthProvider } from '@/contexts/AuthContext';
import { RepLogSale } from '@/components/portal/rep/RepLogSale';
import { RepBulkLog } from '@/components/portal/rep/RepBulkLog';
import { RepPlanPicker } from '@/components/portal/rep/RepPlanPicker';
import { EscalinkPanel } from '@/components/portal/rep/EscalinkPanel';
import s from '@/components/portal/rep/rep.module.css';
import l from '@/components/portal/rep/rep-logsale.module.css';
import b from '@/components/portal/rep/rep-bulklog.module.css';
import x from '@/components/portal/rep/rep-sale.module.css';
import pg from '@/components/portal/rep/rep-page.module.css';
import e from '@/app/portal/escalink/escalink.module.css';
import { ESCALINK_ISSUE_TYPES } from '@/lib/escalink';

// Package P1 harness (taste pass, Sell flow). Signed out: nothing is read or
// written, and no form here submits. ?screen= log | log-states | bulk |
// bulk-rows | detail | edit | escalink. Static screens copy the live components' markup
// with sample data (the live ones need a signed-in sale).

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={x.kv}>
      <span className={x.kvLabel}>{label}</span>
      <div className={x.kvValue}>{children}</div>
    </div>
  );
}

function LogStates() {
  return (
    <div className={`${l.main} ${l.mainDetails}`}>
      <p className={l.steps}>Step 2 of 2 · Details</p>
      <div className={l.draftBar}>
        <History size={18} strokeWidth={2} aria-hidden="true" />
        <p>Picking up where you left off</p>
        <button type="button" className={l.draftStartOver}>
          Start over
        </button>
      </div>
      <div className={l.reviewGrid}>
        <section className={l.proofCard}>
          <div className={l.proofMeta}>
            <h2 className={l.proofTitle}>Proof attached</h2>
            <p className={l.proofName}>2 screenshots attached</p>
          </div>
          <ul className={l.thumbs}>
            <li className={l.thumb}>
              <button type="button" className={l.thumbView}>
                <span className={l.thumbIcon}>
                  <ImageIcon size={20} aria-hidden="true" />
                </span>
              </button>
              <button type="button" className={l.thumbRemove}>
                <X size={14} aria-hidden="true" />
              </button>
            </li>
            <li className={`${l.thumb} ${l.thumbFailed}`}>
              <span className={l.thumbView}>
                <span className={l.thumbState}>
                  <AlertTriangle size={18} aria-hidden="true" />
                  <button type="button" className={l.thumbRetry}>
                    Retry
                  </button>
                </span>
              </span>
            </li>
            <li className={l.thumb}>
              <label className={l.thumbAdd}>
                <ImageUp size={18} aria-hidden="true" />
                Add another
              </label>
            </li>
          </ul>
        </section>
        <div className={l.reviewMain}>
          <header>
            <h1 className={l.title}>Sale details</h1>
            <p className={l.lede}>Filled from your screenshot. Check before you submit.</p>
          </header>
          <div className={l.dupe} role="alert">
            <CopyCheck size={20} strokeWidth={2} aria-hidden="true" />
            <div className={l.dupeBody}>
              <p>
                <strong>This sale was already logged.</strong>
              </p>
              <p className={l.dupeMeta}>Dana Whitfield · sold Oct 14</p>
              <div className={l.dupeActions}>
                <a href="#" className={s.btnSecondary}>
                  View it
                </a>
                <button type="button" className={l.dupeNew}>
                  Log as a new sale
                </button>
              </div>
            </div>
          </div>
          <div className={l.alert} role="alert">
            <AlertTriangle size={20} strokeWidth={2} aria-hidden="true" />
            <p>
              <strong>Not submitted.</strong> Something went wrong. Try again.
            </p>
          </div>
          <div className={l.groups}>
            <section className={l.group}>
              <h2 className={l.groupHead}>Order</h2>
              <div className={l.formGrid}>
                <fieldset className={`${l.field} ${l.fieldset} ${l.wide}`}>
                  <legend className={l.label}>Provider</legend>
                  <div className={l.segmented}>
                    {['T-Mobile', 'Xfinity', 'Lumos', 'Kinetic'].map((name, i) => (
                      <label key={name} className={l.chip}>
                        <input type="radio" name="prov" defaultChecked={i === 1} />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className={`${l.field} ${l.flagMedium}`}>
                  <label className={l.label}>
                    Order number <span className={l.flagTag}>Check this</span>
                  </label>
                  <input className={l.input} defaultValue="ORD-48213307" />
                </div>
                <div className={`${l.field} ${l.flagLow}`}>
                  <label className={l.label}>
                    Plan <span className={l.flagTag}>Check this</span>
                  </label>
                  <input className={l.input} defaultValue="Fiber 1 Gig" />
                </div>
                <div className={`${l.field} ${l.wide}`}>
                  <span className={l.label}>Extras</span>
                  <ul className={l.extras}>
                    {['Mobile line', 'Home phone'].map((name, i) => (
                      <li key={name}>
                        <label className={l.extra}>
                          <input type="checkbox" defaultChecked={i === 0} />
                          <span className={l.extraBox}>{i === 0 ? <Check size={14} strokeWidth={3} /> : null}</span>
                          <span className={l.extraName}>{name}</span>
                          <span className={l.extraKind}>Extra</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>
            <section className={l.group}>
              <h2 className={l.groupHead}>Customer and install</h2>
              <div className={l.formGrid}>
                <div className={`${l.field} ${l.fieldInvalid}`}>
                  <label className={l.label}>
                    Customer name <span className={l.req}>Required</span>
                  </label>
                  <input className={l.input} />
                  <p className={l.fieldError}>
                    <AlertTriangle size={14} aria-hidden="true" />
                    Add the customer&apos;s name.
                  </p>
                </div>
                <div className={l.field}>
                  <label className={l.label}>Install date</label>
                  <input className={l.input} type="date" defaultValue="2026-10-22" />
                  <p className={l.hint}>From the confirmation, if it has one.</p>
                </div>
              </div>
            </section>
          </div>
        </div>
        <div className={l.submitInline} data-keyboard="open">
          <p className={l.estPay}>
            <span className={l.estLabel}>Est. pay</span>
            <span className={l.estNum}>$85</span>
            <span className={l.estWhen}>est. payout Nov 6 – Nov 13</span>
          </p>
          <button type="button" className={`${s.btnPrimary} ${l.submit}`}>
            Submit sale
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkRows() {
  const rows = [
    { name: 'Dana Whitfield', addr: '4120 Lakeview Dr, Tampa FL', meta: 'Fiber 1 Gig · ORD-48213307', kind: 'ready' },
    { name: 'Marcus Lee', addr: '88 Pine St, Tampa FL', meta: 'Fiber 500', kind: 'warn', shots: 2 },
    { name: 'Rosa Ibarra', addr: '17 Bay Rd, Tampa FL', meta: 'Fiber 2 Gig', kind: 'logged' },
    { name: 'Unknown', addr: 'No address', meta: '', kind: 'bad' },
  ];
  return (
    <div className={`${l.main} ${l.mainDetails} ${b.page}`}>
      <header className={b.head}>
        <h1 className={l.title}>Log several sales</h1>
        <p className={l.lede}>Pick the order screenshots. You check them, then log them all.</p>
      </header>
      <p className={`${b.note} ${b.notice}`}>1 screenshot didn&apos;t finish uploading. Pick it again.</p>
      <ol className={b.list}>
        {rows.map((r, i) => (
          <li key={r.name} className={b.card} data-status={r.kind === 'logged' ? 'logged' : 'ready'}>
            <label className={b.check}>
              <input type="checkbox" defaultChecked={r.kind !== 'bad'} />
              <span className={b.box}>{r.kind !== 'bad' ? <Check size={14} strokeWidth={3} /> : null}</span>
            </label>
            <button type="button" className={b.cardOpen}>
              <span className={b.thumbs} data-count={r.shots ?? 1}>
                {Array.from({ length: r.shots ?? 1 }).map((_, k) => (
                  <span key={k} className={b.thumb}>
                    <ImageIcon size={16} aria-hidden="true" />
                  </span>
                ))}
              </span>
              <span className={b.cardText}>
                <span className={b.cardTitle}>
                  <span className={b.cardNum}>{i + 1}</span>
                  {r.name}
                </span>
                <span className={b.cardLine}>{r.addr}</span>
                {r.meta ? <span className={b.cardMeta}>{r.meta}</span> : null}
                {r.shots ? <span className={b.cardShots}>{r.shots} screenshots</span> : null}
              </span>
            </button>
            <button type="button" className={b.remove} aria-label="Remove">
              <X size={18} aria-hidden="true" />
            </button>
            <div className={b.cardStatus}>
              {r.kind === 'ready' ? (
                <p className={`${b.status} ${b.statusGood}`}>
                  <Check size={16} aria-hidden="true" />
                  <span>Ready to log</span>
                </p>
              ) : r.kind === 'warn' ? (
                <div className={`${b.status} ${b.statusWarn}`}>
                  <AlertTriangle size={16} aria-hidden="true" />
                  <span>Needs info: install date</span>
                  <button type="button" className={b.statusAction}>
                    Read again
                  </button>
                </div>
              ) : r.kind === 'logged' ? (
                <p className={`${b.status} ${b.statusGood}`}>
                  <Check size={16} aria-hidden="true" />
                  <span>Logged</span>
                </p>
              ) : (
                <p className={`${b.status} ${b.statusBad}`}>
                  <X size={16} aria-hidden="true" />
                  <span>Not logged. No signal.</span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>
      <div className={b.more}>
        <label className={`${s.btnSecondary} ${b.addMore}`}>
          <ImageUp size={18} aria-hidden="true" />
          Add more screenshots
        </label>
        <p className={b.moreNote}>5 of 20 screenshots</p>
      </div>
      <div className={`${l.submitInline} ${b.barInline}`} data-keyboard="open">
        <p className={b.barCount}>
          <span className={l.estLabel}>Ready</span>
          <span className={b.barNum}>3 of 4</span>
        </p>
        <button type="button" className={`${s.btnPrimary} ${l.submit}`}>
          Log 3 sales
        </button>
      </div>
    </div>
  );
}

function Detail() {
  return (
    <div className={x.page}>
      <a href="#" className={`${x.back} ${s.deskOnly}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to sales
      </a>
      <header className={x.head}>
        <h1 className={x.title}>Dana Whitfield</h1>
        <div className={x.headMeta}>
          <span className={`${x.chip} ${x.st_scheduled}`}>Scheduled</span>
          <span className={`${x.tag} ${x.tagWarn}`}>Rejected</span>
          <span className={x.soldOn}>Sold Oct 14, 2026</span>
        </div>
      </header>
      <div className={x.body}>
        <div className={x.side}>
          <section className={`${s.panel} ${x.oInstall}`}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Install</h2>
            </div>
            <div className={x.panelBody}>
              <p className={x.installDate}>Wed, Oct 22</p>
              <p className={x.installWhat}>Scheduled with the carrier</p>
              <Row label="Est. payout">Nov 6 – Nov 13</Row>
              <Row label="Est. pay">
                <span className={x.pay}>
                  <span className={x.payEst}>est.</span>$85
                </span>
              </Row>
              <p className={x.fine}>Estimates before chargebacks and claims; the carrier&apos;s final report decides what pays.</p>
            </div>
          </section>
          <section className={`${s.panel} ${x.oProof}`}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Order and proof</h2>
            </div>
            <div className={x.panelBody}>
              <Row label="Order / BTN">ORD-48213307</Row>
              <Row label="Sold">Oct 14, 2026</Row>
              <Row label="Type">New customer</Row>
              <div className={x.proofList}>
                <button type="button" className={x.proofBtn}>
                  <ImageIcon size={18} aria-hidden="true" />
                  <span>View proof screenshot</span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              </div>
            </div>
          </section>
          <EscalinkPanel ticket={'Dealer code: 12345\nCustomer: Dana Whitfield\nOrder: ORD-48213307'} className={x.oSupport} />
          <div className={`${x.actions} ${x.oActions}`}>
            <a className={s.btnSecondary} href="#">
              <Pencil size={16} aria-hidden="true" />
              Edit
            </a>
            <button type="button" className={x.danger}>
              <Trash2 size={16} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
        <div className={x.main}>
          <section className={`${s.panel} ${x.oCustomer}`}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Customer</h2>
            </div>
            <div className={x.panelBody}>
              <Row label="Address">4120 Lakeview Dr, Tampa FL 33611</Row>
              <Row label="Phone">
                <a className={x.link} href="#">
                  <Phone size={16} aria-hidden="true" />
                  (813) 555-0142
                </a>
              </Row>
              <Row label="Email">
                <a className={x.link} href="#">
                  <Mail size={16} aria-hidden="true" />
                  dana@example.com
                </a>
              </Row>
            </div>
          </section>
          <section className={`${s.panel} ${x.oPlan}`}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Plan</h2>
            </div>
            <div className={x.panelBody}>
              <div className={x.plan}>
                <span className={x.carrier}>T-Mobile</span>
                <span className={x.planName}>Fiber 1 Gig</span>
                <span className={x.planPts}>3 pts</span>
              </div>
              <div className={x.plan}>
                <span className={x.carrier}>T-Mobile</span>
                <span className={x.planName}>Mobile line</span>
                <span className={x.planPts}>1 pts</span>
              </div>
              <div className={x.totals}>
                <span>
                  Points <b>4</b>
                </span>
              </div>
            </div>
          </section>
          <section className={`${s.panel} ${x.oNotes}`}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Notes</h2>
            </div>
            <div className={x.panelBody}>
              <p className={x.notes}>Customer wants a morning install window.</p>
            </div>
          </section>
          <p className={`${x.note} ${x.noteRed} ${x.oNotes}`}>
            <X size={18} aria-hidden="true" />
            <span>
              <strong>Rejected</strong> by Jacob on Oct 15. Reason: duplicate order.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

function Edit() {
  return (
    <div className={x.editPage}>
      <a href="#" className={`${x.back} ${s.deskOnly}`}>
        <ArrowLeft size={16} aria-hidden="true" />
        Back to sale
      </a>
      <header className={x.head}>
        <h1 className={x.title}>Edit sale</h1>
        <p className={x.editWho}>Dana Whitfield</p>
      </header>
      <div className={x.alert} role="alert">
        <AlertTriangle size={20} aria-hidden="true" />
        <p>Could not save. Try again.</p>
      </div>
      <div className={x.editBody}>
        <div className={x.editMain}>
          <section className={s.panel}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Customer</h2>
            </div>
            <div className={x.fields}>
              <div className={x.field}>
                <label className={x.label}>
                  Name <span className={x.req}>Required</span>
                </label>
                <input className={x.input} defaultValue="Dana Whitfield" />
              </div>
              <div className={x.field}>
                <label className={x.label}>Phone</label>
                <input className={x.input} defaultValue="(813) 555-0142" />
              </div>
            </div>
          </section>
          <section className={s.panel}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Plan</h2>
            </div>
            <RepPlanPicker products={[]} onAdd={() => {}} />
            <div className={x.picker}>
              <p className={x.pickerLabel}>On this sale</p>
              <ul className={x.chosen}>
                <li className={x.chosenRow}>
                  <span>
                    <span className={x.chosenName}>Fiber 1 Gig</span>
                    <span className={x.chosenMeta}>$70/mo · +3 pts</span>
                  </span>
                  <button type="button" className={x.iconBtn} aria-label="Remove">
                    <Trash2 size={18} aria-hidden="true" />
                  </button>
                </li>
              </ul>
            </div>
          </section>
        </div>
        <aside className={x.editSide}>
          <section className={s.panel}>
            <div className={s.panelHead}>
              <h2 className={x.panelTitle}>Summary</h2>
            </div>
            <dl className={x.summary}>
              <div>
                <dt>Monthly</dt>
                <dd>$70</dd>
              </div>
              <div>
                <dt>Plans</dt>
                <dd>1</dd>
              </div>
              <div>
                <dt>Points</dt>
                <dd>+3</dd>
              </div>
            </dl>
            <div className={x.saveInline} data-keyboard="open">
              <div className={x.saveRow}>
                <a href="#" className={s.btnSecondary}>
                  Cancel
                </a>
                <button type="button" className={`${s.btnPrimary} ${x.save}`}>
                  Save changes
                </button>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function Escalink() {
  return (
    <div className={pg.page}>
      <header className={pg.head}>
        <h1 className={pg.title}>EscaLink</h1>
        <p className={pg.lede}>T-Mobile&apos;s ticket app for install and order problems.</p>
      </header>
      <section className={s.panel}>
        <div className={s.panelHead}>
          <h2 className={e.panelTitle}>How it works</h2>
        </div>
        <ol className={e.steps}>
          {['Sign in', 'Fill it in once', 'Inbox'].map((t, i) => (
            <li key={t} className={e.step}>
              <span className={e.stepNum}>{i + 1}</span>
              <div className={e.stepBody}>
                <h3 className={e.stepTitle}>{t}</h3>
                <p className={e.stepText}>Track every ticket you sent and its status.</p>
                {i === 2 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={e.shot} src="/escalink/step3.webp" alt="" />
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className={s.panel}>
        <div className={s.panelHead}>
          <h2 className={e.panelTitle}>What to include</h2>
        </div>
        <ul className={e.list}>
          <li>Submitter: D2D Agents and your dealer code.</li>
          <li>
            <b>EscaLink:</b> T-Mobile has to look at or fix the order.
          </li>
        </ul>
        <p className={e.tip}>
          Shortcut: open the sale in Sales and tap <b>Copy details</b> under T-Mobile support.
        </p>
      </section>
      <section className={s.panel}>
        <div className={s.panelHead}>
          <h2 className={e.panelTitle}>Which issue type</h2>
        </div>
        <dl className={e.types}>
          {ESCALINK_ISSUE_TYPES.map((type) => (
            <div key={type.name} className={e.type}>
              <dt>{type.name}</dt>
              <dd>{type.use}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function Harness() {
  const screen = useSearchParams().get('screen') ?? 'log';
  const body =
    screen === 'log-states' ? (
      <LogStates />
    ) : screen === 'bulk' ? (
      <RepBulkLog />
    ) : screen === 'bulk-rows' ? (
      <BulkRows />
    ) : screen === 'detail' ? (
      <Detail />
    ) : screen === 'edit' ? (
      <Edit />
    ) : screen === 'escalink' ? (
      <Escalink />
    ) : (
      <RepLogSale />
    );
  return (
    <AuthProvider>
      <div className={s.root} data-shell="rep">
        <main className={s.scroller} id="rep-main">
          <div className={s.main}>{body}</div>
        </main>
      </div>
    </AuthProvider>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Harness />
    </Suspense>
  );
}
