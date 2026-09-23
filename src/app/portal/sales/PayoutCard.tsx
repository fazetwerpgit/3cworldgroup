'use client';

import { CircleHelp, RotateCw } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { formatPayoutWindow, type UpcomingPayout } from '@/lib/pay/payoutWindow';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';

function PayNumeral({ amount }: { amount: number }) {
  const shown = useCountUp(Math.round(amount), 1100);
  return (
    <p className={x.payNum}>
      <span className={x.payEst}>est.</span>
      <span className={x.payCur}>$</span>
      <span className={s.srOnly}>{Math.round(amount).toLocaleString('en-US')}</span>
      <span aria-hidden="true">{shown.toLocaleString('en-US')}</span>
    </p>
  );
}

/**
 * The raised money card on Sales: the next T-Fiber est. payout (always a
 * window, never a date), the picked month's sale count, and the installs in
 * that payout. "How pay works" sits under it and opens the pay help sheet.
 */
export function PayoutCard({
  upcoming,
  saleCount,
  monthName,
  hasPlan,
  planLoading,
  planError,
  onRetryPlan,
  onHelp,
}: {
  upcoming: UpcomingPayout | null;
  saleCount: number;
  monthName: string;
  hasPlan: boolean;
  planLoading: boolean;
  planError: boolean;
  onRetryPlan: () => void;
  onHelp: () => void;
}) {
  const installed = upcoming ? upcoming.count - upcoming.scheduled : 0;
  return (
    <div className={x.payCol}>
      <section className={x.moneyCard} aria-label="Sales summary">
        <p className={s.kicker}>
          Est. payout{upcoming ? ` · ${formatPayoutWindow(upcoming.window)}` : ''}
        </p>
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
          <PayNumeral amount={upcoming.amount ?? 0} />
        ) : (
          <p className={`${x.payNum} ${x.payDash}`}>—</p>
        )}
        <p className={x.payMeta}>
          <b>{saleCount}</b> {saleCount === 1 ? 'sale' : 'sales'} in {monthName}
          {planLoading || planError ? null : !hasPlan ? (
            <> · No pay plan assigned yet</>
          ) : !upcoming ? (
            <> · No T-Fiber payout window coming up</>
          ) : null}
        </p>
        {!planLoading && !planError && hasPlan && upcoming ? (
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
          </div>
        ) : null}
      </section>
      <button type="button" className={x.payHelp} aria-haspopup="dialog" onClick={onHelp}>
        <CircleHelp size={16} aria-hidden="true" />
        How pay works
      </button>
    </div>
  );
}
