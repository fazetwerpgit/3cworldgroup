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
 * round chevrons; it opens on the next one not yet over. The line under the
 * figure names it as an estimate and gives the month's sale count; a flat block
 * holds the installs in the shown payout. "How pay works" closes the card and
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
        <p className={x.payLine}>
          {/* Always a window, never a date: "window Sep 14–18 (past)". */}
          <span data-part="pay-when">
            <strong>Estimated T-Fiber payout</strong>
            {upcoming ? (
              <>
                , window <span className={x.payWhen}>{formatPayoutWindow(upcoming.window)}</span>
                {upcoming.past ? ' (past)' : ''}
              </>
            ) : null}
            .
          </span>{' '}
          You sent in <b>{saleCount}</b> {saleCount === 1 ? 'sale' : 'sales'} in {monthName}.
          {planLoading || planError ? null : !hasPlan ? (
            <> No pay plan assigned yet.</>
          ) : !upcoming ? (
            <> No T-Fiber payouts this month.</>
          ) : null}
        </p>
        {payouts.length > 1 ? (
          <div className={x.payStep} role="group" aria-label={`Payouts in ${monthName}`}>
            <button
              type="button"
              className={x.stepBtn}
              onClick={() => step(-1)}
              disabled={index <= 0}
              aria-label="Earlier payout"
            >
              <ChevronLeft size={20} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={x.stepBtn}
              onClick={() => step(1)}
              disabled={index >= payouts.length - 1}
              aria-label="Later payout"
            >
              <ChevronRight size={20} aria-hidden="true" />
            </button>
            <span className={x.payStepPos}>
              Payout {index + 1} of {payouts.length} this month
            </span>
          </div>
        ) : null}
        {ready && upcoming ? (
          <div className={x.moneyWell}>
            <div className={x.instBar} aria-hidden="true">
              {installed > 0 ? <i className={x.swInstalled} style={{ flexGrow: installed }} /> : null}
              {upcoming.scheduled > 0 ? <i className={x.swScheduled} style={{ flexGrow: upcoming.scheduled }} /> : null}
            </div>
            <p className={x.instLine} data-part="installs">
              <span className={x.carrierMark}>T-Fiber</span>
              {upcoming.count} {upcoming.count === 1 ? 'install' : 'installs'}
              {installed > 0 || upcoming.scheduled > 0 ? ': ' : ''}
              {installed > 0 ? <b className={x.st_installed}>{installed} installed</b> : null}
              {installed > 0 && upcoming.scheduled > 0 ? ', ' : ''}
              {upcoming.scheduled > 0 ? <b className={x.st_scheduled}>{upcoming.scheduled} scheduled</b> : null}
            </p>
            {upcoming.movedIn.length > 0 ? (
              <p className={x.wellNote}>Moved in from an earlier payout: {movedNames(upcoming.movedIn)}</p>
            ) : null}
          </div>
        ) : null}
        {ready && undatedCount > 0 ? (
          <p className={x.undatedNote}>
            {undatedCount} T-Fiber {undatedCount === 1 ? 'sale is' : 'sales are'} not dated yet, so{' '}
            {undatedCount === 1 ? 'it is' : 'they are'} not in this figure.
          </p>
        ) : null}
        <button type="button" className={x.payHelp} aria-haspopup="dialog" onClick={onHelp}>
          <CircleHelp size={18} aria-hidden="true" />
          How pay works
        </button>
      </section>
    </div>
  );
}
