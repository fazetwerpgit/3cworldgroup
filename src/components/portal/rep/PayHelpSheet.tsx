'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { BodyLayer } from './BodyLayer';
import s from './rep.module.css';
import d from './rep-dashboard.module.css';

export const PAY_DISPUTE_HREF = '/portal/payroll-dispute';

// Rep-voice summary of 3C's T-Fiber pay schedule (Jacob's schedule doc,
// docs/redesign/portal-design-pass/tfiber-pay-schedule.txt). The install-week
// windows match payoutWindow.ts. The contract thresholds in that doc are left
// out on purpose: they do not belong on the pay card.
const WINDOWS: Array<[string, string]> = [
  ['1st–7th', '14th–18th'],
  ['8th–14th', '21st–25th'],
  ['15th–21st', '28th–3rd next month'],
  ['22nd–end of month', '7th–11th next month'],
];

/** "How T-Fiber pay works": bottom sheet on phone, centred dialog on desktop, portaled to <body>. */
export function PayHelpSheet({ onClose }: { onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby="pay-help-title">
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="pay-help-title" className={s.sheetTitle}>
              How T-Fiber pay works
            </h2>
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={s.sheetBody}>
            <div className={d.help}>
              <p>
                T-Fiber pays out by install week, on the same dates every month. The dates on your dashboard
                are estimates built from this schedule.
              </p>

              <table className={d.schedule}>
                <thead>
                  <tr>
                    <th scope="col">Installed</th>
                    <th scope="col">Est. payout</th>
                  </tr>
                </thead>
                <tbody>
                  {WINDOWS.map(([installed, payout]) => (
                    <tr key={installed}>
                      <td>{installed}</td>
                      <td>{payout}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <p>
                <strong>You get paid when 3C gets paid.</strong> Money lands when 3C receives funds from
                T-Fiber, so a date can slide for holidays or late carrier reporting. That&apos;s why every
                payout is a range.
              </p>

              <div>
                <h3>Missed installs</h3>
                <p>
                  Anything the weekly checks missed shows up on your pay sheet as a <strong>Claim</strong>. The
                  month&apos;s All Check settles claims by the <strong>25th of the next month</strong>.
                </p>
              </div>

              <div>
                <h3>Chargebacks</h3>
                <p>
                  A customer has to stay installed for <strong>120 days</strong>. If they cancel inside that
                  window, the full amount paid for that install is clawed back.
                </p>
              </div>

              <div>
                <h3>Install not on your sheet?</h3>
                <p>Send it in and we&apos;ll look at the account.</p>
              </div>
              <Link href={PAY_DISPUTE_HREF} className={`${s.btnSecondary} ${d.helpCta}`} onClick={onClose}>
                Report a missing install
              </Link>
            </div>
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
