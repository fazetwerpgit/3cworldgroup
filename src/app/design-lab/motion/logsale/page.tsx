'use client';

import { useState } from 'react';
import { SubmitLabel } from '@/components/portal/rep/RepLogSale';
import s from '@/components/portal/rep/rep.module.css';
import l from '@/components/portal/rep/rep-logsale.module.css';

// Temporary harness (untracked, never committed): the Log Sale submit bar's
// "Logged" swap, with no form and no submit.
export default function LogSaleMotionHarness() {
  const [logged, setLogged] = useState(false);
  return (
    <div className={s.root} data-shell="rep">
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <button type="button" id="toggle" onClick={() => setLogged((v) => !v)}>
            toggle
          </button>
        </div>
      </main>
      <div className={s.layer}>
        <div className={l.submitBar}>
          <p className={l.estPay}>
            <span className={s.kicker}>Est. pay</span>
            <span className={l.estNum}>$280</span>
            <span className={l.estWhen}>est. payout Sep 28 – Oct 3</span>
          </p>
          <button
            type="button"
            className={`${s.btnPrimary} ${l.submit}`}
            disabled={logged}
            data-logged={logged || undefined}
          >
            <SubmitLabel logged={logged}>Submit sale</SubmitLabel>
          </button>
        </div>
      </div>
    </div>
  );
}
