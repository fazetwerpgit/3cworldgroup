'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, CircleHelp, RotateCw } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { defaultPayoutIndex, formatPayoutWindow, type MonthPayout } from '@/lib/pay/payoutWindow';
import type { Sale } from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';

function PayNumeral({ amount }: { amount: number }) {
  // One count per session on this surface. Stepping to another window changes
  // the target, which useCountUp shows outright: no replay per window.
  const shown = useCountUp(Math.round(amount), { sessionKey: '3c:countup:sales-pay' });
  return (
    <p className={x.payNum}>
      <span className={x.payEst}>est.</span>
      <span className={x.payCur}>$</span>
      <span className={s.srOnly}>{Math.round(amount).toLocaleString('en-US')}</span>
      <span aria-hidden="true">{shown.toLocaleString('en-US')}</span>
    </p>
  );
}

type CardSale = Pick<Sale, 'products' | 'installDate' | 'installDatePreviousDate' | 'customerName' | 'customerAddress'>;

const MOVED_NAMES = 2;

/** "Carla Diaz, Ana Ruiz +1": who moved into this window from an earlier one. */
function movedNames(sales: CardSale[]): string {
  const names = sales.map((sale) => sale.customerName?.trim() || sale.customerAddress?.trim() || 'A sale');
  const shown = names.slice(0, MOVED_NAMES).join(', ');
  return names.length > MOVED_NAMES ? `${shown} +${names.length - MOVED_NAMES}` : shown;
}

/**
 * The raised money card on Sales: the T-Fiber est. payouts that pay in the
 * picked month (always a window, never a date), stepped one at a time with the
 * chevrons; it opens on the next one not yet over. Under it, the month's sale
 * count and the installs in the shown payout. "How pay works" sits under it and
 * opens the pay help sheet.
 */
export function PayoutCard<T extends CardSale>({
  payouts,
  resetKey,
  undatedCount = 0,
  saleCount,
  monthName,
  hasPlan,
  planLoading,
  planError,
  onRetryPlan,
  onHelp,
}: {
  /** The picked month's payouts, earliest first (payoutsInMonth). */
  payouts: Array<MonthPayout<T>>;
  /** The picked month: a new one sends the card back to its default payout. */
  resetKey: string;
  /** Counted T-Fiber sales with no install date yet: no window until they get one. */
  undatedCount?: number;
  saleCount: number;
  monthName: string;
  hasPlan: boolean;
  planLoading: boolean;
  planError: boolean;
  onRetryPlan: () => void;
  onHelp: () => void;
}) {
  // The window the rep stepped to, by its start. A new month drops it (adjusted
  // during render, so the old month's pick never paints); a refresh that empties
  // that window falls back to the default too.
  const [pick, setPick] = useState<number | null>(null);
  const [pickMonth, setPickMonth] = useState(resetKey);
  if (pickMonth !== resetKey) {
    setPickMonth(resetKey);
    setPick(null);
  }
  const picked = pick === null ? -1 : payouts.findIndex((payout) => payout.window.start.getTime() === pick);
  const index = picked >= 0 ? picked : defaultPayoutIndex(payouts);
  const upcoming = payouts[index] ?? null;
  const step = (by: number) => {
    const next = payouts[index + by];
    if (next) setPick(next.window.start.getTime());
  };

  const installed = upcoming ? upcoming.count - upcoming.scheduled : 0;
  const ready = !planLoading && !planError && hasPlan;
  return (
    <div className={x.payCol}>
      <section className={x.moneyCard} aria-label="Sales summary">
        <div className={x.payHead}>
          <p className={s.kicker}>
            Est. payout
            {upcoming ? (
              <>
                {' · '}
                {/* The window and its tag wrap as one: "Sep 14–18 · past". */}
                <span className={x.payWhen}>
                  {formatPayoutWindow(upcoming.window)}
                  {upcoming.past ? ' · past' : ''}
                </span>
              </>
            ) : null}
          </p>
          {payouts.length > 1 ? (
            <div className={x.payStep} role="group" aria-label={`Payouts in ${monthName}`}>
              <button
                type="button"
                className={x.monthBtn}
                onClick={() => step(-1)}
                disabled={index <= 0}
                aria-label="Earlier payout"
              >
                <ChevronLeft size={18} aria-hidden="true" />
              </button>
              <span className={x.payStepPos}>
                {index + 1} of {payouts.length}
              </span>
              <button
                type="button"
                className={x.monthBtn}
                onClick={() => step(1)}
                disabled={index >= payouts.length - 1}
                aria-label="Later payout"
              >
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
        <div aria-live="polite" aria-atomic="true">
          {planLoading ? (
            <span className={`${s.skel} ${x.skelKpi}`} aria-label="Loading estimated pay" />
          ) : planError ? (
            <div className={`${s.failed} ${x.kpiFailed}`} role="alert">
              <span>Couldn&apos;t load pay rates</span>
              <button type="button" className={s.retry} onClick={onRetryPlan}>
                <RotateCw size={14} aria-hidden="true" />
                Retry
              </button>
            </div>
          ) : hasPlan && upcoming ? (
            // 0 = no contracted rate yet for these installs, as the rows say.
            upcoming.amount ? (
              <PayNumeral amount={upcoming.amount} />
            ) : (
              <p className={`${x.payNum} ${x.payPending}`}>Rate pending</p>
            )
          ) : (
            <p className={`${x.payNum} ${x.payDash}`}>—</p>
          )}
        </div>
        <p className={x.payMeta}>
          <b>{saleCount}</b> {saleCount === 1 ? 'sale' : 'sales'} in {monthName}
          {planLoading || planError ? null : !hasPlan ? (
            <> · No pay plan assigned yet</>
          ) : !upcoming ? (
            <> · No T-Fiber payouts this month</>
          ) : null}
        </p>
        {ready && upcoming ? (
          <div className={x.moneyWell}>
            <div className={x.wellHead}>
              <span className={s.kicker}>
                {upcoming.count} {upcoming.count === 1 ? 'install' : 'installs'} in this payout
              </span>
              <span className={x.carrierMark}>T-Fiber</span>
            </div>
            <ul className={x.wellLegend}>
              {installed > 0 ? (
                <li>
                  <span className={`${x.sw} ${x.swInstalled}`} aria-hidden="true" />
                  <b>{installed}</b> installed
                </li>
              ) : null}
              {upcoming.scheduled > 0 ? (
                <li>
                  <span className={`${x.sw} ${x.swScheduled}`} aria-hidden="true" />
                  <b>{upcoming.scheduled}</b> scheduled
                </li>
              ) : null}
            </ul>
            {upcoming.movedIn.length > 0 ? (
              <p className={x.wellNote}>Moved in from an earlier payout: {movedNames(upcoming.movedIn)}</p>
            ) : null}
          </div>
        ) : null}
        {ready && undatedCount > 0 ? (
          <p className={x.payNote}>
            {undatedCount} T-Fiber {undatedCount === 1 ? 'sale' : 'sales'} not dated yet
          </p>
        ) : null}
      </section>
      <button type="button" className={x.payHelp} aria-haspopup="dialog" onClick={onHelp}>
        <CircleHelp size={16} aria-hidden="true" />
        How pay works
      </button>
    </div>
  );
}
