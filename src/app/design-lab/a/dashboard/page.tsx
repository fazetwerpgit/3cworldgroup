import Link from 'next/link';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { challenge, payPeriod, recentSales, standing, today, type SaleStatus } from '../../_mock';
import { Frame, Masthead, money } from '../_ui/Chrome';
import n from '../night.module.css';
import s from '../dashboard.module.css';

export const metadata = { title: 'Dashboard — A · Night Editorial' };

const ordinal = (value: number) => {
  const tail = value % 100;
  if (tail >= 11 && tail <= 13) return `${value}th`;
  return `${value}${['th', 'st', 'nd', 'rd'][value % 10] ?? 'th'}`;
};

const STATUS: Record<SaleStatus, string> = {
  installed: 'Installed',
  scheduled: 'Scheduled',
  'needs-date': 'Needs install date',
  cancelled: 'Cancelled',
};

export default function DashboardA() {
  const aheadRank = ordinal(standing.rank - 1);

  return (
    <Frame current="home">
      <Masthead />

      {/* 1 — What am I getting paid, and when */}
      <section className={s.pay} aria-labelledby="pay-head">
        <div className={s.payLead}>
          <h1 id="pay-head" className={n.kicker}>
            Estimated pay · this period
          </h1>
          <p className={s.numeral}>{money(payPeriod.estimatedPay)}</p>
          <p className={s.trend}>
            <ArrowUpRight size={16} strokeWidth={2} aria-hidden />
            Up {payPeriod.vsLastPeriodPct}% on last period
          </p>
          <p className={s.payMix}>
            <span>
              <b>{payPeriod.installedCount}</b> installed
            </span>
            <span>
              <b>{payPeriod.scheduledCount}</b> scheduled
            </span>
            <span className={s.payMixFlag}>
              <b>{payPeriod.needsDateCount}</b> needs a date
            </span>
          </p>
        </div>

        <dl className={s.payday}>
          <div>
            <dt className={n.fieldLabel}>Next payday</dt>
            <dd className={s.paydayValue}>{payPeriod.nextPayday}</dd>
          </div>
          <div>
            <dt className={n.fieldLabel}>Deposit</dt>
            <dd className={s.paydayValue}>{money(payPeriod.nextPaydayAmount)}</dd>
          </div>
        </dl>
      </section>

      <div className={s.split}>
        {/* 2 — Where do I stand */}
        <section className={n.section} aria-labelledby="stand-head">
          <div className={n.sectionHead}>
            <h2 id="stand-head" className={n.kicker}>
              Where you stand
            </h2>
            <span className={n.sectionMeta}>{standing.period}</span>
          </div>

          <div className={s.rankRow}>
            <p className={s.rank}>
              {ordinal(standing.rank)}
              <span className={s.rankOf}> of {standing.of}</span>
            </p>
            <p className={s.points}>
              {standing.points}
              <span className={s.rankOf}> pts</span>
            </p>
          </div>
          <p className={s.gap}>
            {standing.pointsBehindNext} points behind {standing.nextName} for {aheadRank}.
          </p>

          <div className={s.challenge}>
            <div className={s.challengeTop}>
              <p className={s.challengeTitle}>{challenge.label}</p>
              <p className={s.challengeCount}>
                {challenge.done}
                <span className={s.rankOf}>/{challenge.goal}</span>
              </p>
            </div>
            <div
              className={s.meter}
              role="meter"
              aria-label="Weekly challenge progress"
              aria-valuemin={0}
              aria-valuemax={challenge.goal}
              aria-valuenow={challenge.done}
            >
              {Array.from({ length: challenge.goal }, (_, i) => (
                <span key={i} data-done={i < challenge.done ? '' : undefined} />
              ))}
            </div>
            <p className={s.challengeMeta}>
              <span>{challenge.goal - challenge.done} to go</span>
              <span>{challenge.timeLeft}</span>
            </p>
          </div>
        </section>

        {/* 3 — What's next today */}
        <section className={n.section} aria-labelledby="today-head">
          <div className={n.sectionHead}>
            <h2 id="today-head" className={n.kicker}>
              Today
            </h2>
          </div>
          <ul className={s.rows}>
            {today.map((item) => (
              <li key={item.title}>
                <Link href="#" className={s.todayRow} data-kind={item.kind}>
                  <span className={s.todayTime}>{item.time}</span>
                  <span className={s.todayTitle}>{item.title}</span>
                  <ChevronRight className={s.chev} size={20} strokeWidth={1.75} aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* 4 — Recent sales */}
      <section className={n.section} aria-labelledby="sales-head">
        <div className={n.sectionHead}>
          <h2 id="sales-head" className={n.kicker}>
            Recent sales
          </h2>
          <span className={`${n.sectionMeta} ${s.estHead}`}>Est. pay</span>
        </div>

        <div className={s.salesHeader} aria-hidden>
          <span>Customer</span>
          <span>Address</span>
          <span>Plan</span>
          <span>Status</span>
          <span>Pay date</span>
          <span className={s.right}>Est. pay</span>
        </div>

        <ul className={s.rows}>
          {recentSales.map((sale) => (
            <li key={sale.customer}>
              <Link href="#" className={s.sale} data-status={sale.status}>
                <span className={s.saleName}>{sale.customer}</span>
                <span className={s.saleSub}>
                  <span className={s.saleAddr}>{sale.address}</span>
                  <span className={s.salePlan}>{sale.plan}</span>
                </span>
                <span className={s.saleState}>
                  <span className={s.saleStatus}>
                    {STATUS[sale.status]}
                    {sale.installDate && <span className={s.saleDate}> {sale.installDate}</span>}
                  </span>
                  <span className={s.salePays}>
                    {sale.payDate && (
                      <>
                        <span className={s.paysWord}>Pays </span>
                        {sale.payDate}
                      </>
                    )}
                  </span>
                </span>
                <span className={s.saleAmount}>{sale.estPay > 0 ? money(sale.estPay) : ''}</span>
              </Link>
            </li>
          ))}
        </ul>
        <Link href="#" className={s.allSales}>
          All sales
          <ChevronRight size={20} strokeWidth={1.75} aria-hidden />
        </Link>
      </section>
    </Frame>
  );
}
