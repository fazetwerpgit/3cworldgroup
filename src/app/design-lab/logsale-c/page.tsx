'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { AuthProvider } from '@/contexts/AuthContext';
import { RepLogSale } from '@/components/portal/rep/RepLogSale';
import s from '@/components/portal/rep/rep.module.css';
import l from '@/components/portal/rep/rep-logsale.module.css';

// Temporary harness (untracked, never committed). Signed out: nothing is read
// or written. ?state=scan shows static copies of the scan states' markup.

function ScanStates() {
  return (
    <div className={`${l.main} ${l.mainDetails}`}>
      <section className={l.proofCard} style={{ marginBottom: 24 }}>
        <div className={l.proofMeta}>
          <h2 className={s.kicker}>Proof attached</h2>
          <p className={l.proofName}>2 screenshots attached</p>
        </div>
        <ul className={l.thumbs}>
          {[0, 1].map((i) => (
            <li key={i} className={l.thumb}>
              <button type="button" className={l.thumbView}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/redesign/services-r3/hero-h-1600.webp" alt="" className={l.thumbImg} />
              </button>
              <button type="button" className={l.thumbRemove}>
                x
              </button>
            </li>
          ))}
          <li className={l.thumb}>
            <label className={l.thumbAdd}>Add another</label>
          </li>
        </ul>
      </section>
      <div className={l.reviewMain}>
        <header>
          <h1 className={l.title}>Sale details</h1>
          <div className={l.scanRow}>
            <p className={`${l.lede} ${l.scanReading}`}>
              <Loader2 size={16} strokeWidth={2.25} className={l.spin} aria-hidden="true" />
              Reading your screenshot…
            </p>
            <button type="button" className={l.scanSkip}>
              Skip
            </button>
          </div>
        </header>
        <div className={l.groups}>
          <section className={l.group}>
            <h2 className={`${s.kicker} ${l.groupHead}`}>Customer and install</h2>
            <div className={l.formGrid}>
              <div className={l.field}>
                <label className={l.label}>Customer name</label>
                <span className={l.readWrap}>
                  <input className={`${l.input} ${l.inputReading}`} defaultValue="" />
                  <span className={`${s.skel} ${l.readSkel}`} />
                </span>
              </div>
              <div className={`${l.field} ${l.flagMedium}`}>
                <label className={l.label}>
                  Phone
                  <span className={l.flagTag}>
                    <AlertTriangle size={14} strokeWidth={2.25} />
                    Check this
                  </span>
                </label>
                <input className={l.input} defaultValue="(512) 555-0142" />
              </div>
              <div className={`${l.field} ${l.flagLow}`}>
                <label className={l.label}>
                  Service address
                  <span className={l.flagTag}>
                    <AlertTriangle size={14} strokeWidth={2.25} />
                    Check this
                  </span>
                </label>
                <input className={l.input} defaultValue="1418 Oak Ridge Dr, Austin TX" />
              </div>
              <div className={`${l.field} ${l.fieldInvalid}`}>
                <label className={l.label}>
                  Install date<span className={l.req}>Required</span>
                </label>
                <input className={l.input} type="date" />
                <p className={l.fieldError}>
                  <AlertTriangle size={14} strokeWidth={2.25} />
                  Add the install date.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Harness() {
  const state = useSearchParams().get('state');
  return (
    <AuthProvider>
      <div className={s.root} data-shell="rep">
        <main className={s.scroller} id="rep-main">
          <div className={s.main}>{state === 'scan' ? <ScanStates /> : <RepLogSale />}</div>
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
