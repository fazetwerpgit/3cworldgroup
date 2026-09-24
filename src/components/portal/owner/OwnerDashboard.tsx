'use client';

import type { ReactNode } from 'react';
import { RotateCw } from 'lucide-react';
import { useCountUp } from '@/hooks/useCountUp';
import { useOwnerDashboard } from '@/hooks/useOwnerDashboard';
import type { Section } from '@/hooks/useRepDashboard';
import { useMinuteClock } from '@/components/leaderboard/belowPodium';
import type {
  MoneyComparison,
  MoneyFigures,
  MoneySummary,
  ProblemKey,
  ProblemRow,
  RecruitingSummary,
  WeekCount,
} from '@/lib/owner/companySummary';
import { carrierReportStamp } from '@/lib/owner/reportFreshness';
import { OpsQueuesPanel } from '@/components/portal/admin-d/OpsQueuesPanel';
import type { QueueCard } from '@/components/portal/admin-d/opsQueues';
import AddToHomeScreenBanner from '@/components/portal/AddToHomeScreenBanner';
import PushPromptBanner, { usePushPromptVisible } from '@/components/portal/PushPromptBanner';
import s from '../rep/rep.module.css';
import o from './owner-dashboard.module.css';

// The owner's home screen (direction D): the company, not a personal pay card.
// Money first (estimated from installs × the comp plan), then what needs
// attention, then recruiting. Each section loads and fails on its own.

// ---------------------------------------------------------------- format

function money(n: number) {
  const whole = Math.round(Math.abs(n)).toLocaleString('en-US');
  return n < 0 ? `−$${whole}` : `$${whole}`;
}

const count = (n: number) => n.toLocaleString('en-US');

/** Whole-percent change, or null when there is nothing to compare against. */
function deltaPct(current: number, prior: number): number | null {
  if (prior <= 0) return null;
  return Math.round(((current - prior) / prior) * 100);
}

const SHORT_DAY = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Chicago' });

/** The prior cut's last day, e.g. "Aug 22" (the cut ends mid-day, so step back a moment). */
const priorDay = (iso: string) => SHORT_DAY.format(new Date(new Date(iso).getTime() - 1));

const MONTH_SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'America/Chicago' });

// ---------------------------------------------------------------- shared bits

function Failed({ what, onRetry, className = '' }: { what: string; onRetry: () => void; className?: string }) {
  return (
    <div className={`${s.failed} ${className}`} role="alert">
      <span>Couldn&apos;t load {what}</span>
      <button type="button" className={s.retry} onClick={onRetry}>
        <RotateCw size={14} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

function PanelHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className={s.panelHead}>
      <h2 id={id} className={s.kicker}>
        {title}
      </h2>
      {children}
    </div>
  );
}

/** The hero figures' change against the prior cut. Table cells don't carry one. */
function Delta({ current, prior, label }: { current: number; prior: number; label: string }) {
  const pct = deltaPct(current, prior);
  if (pct === null) return null;
  return (
    <span className={`${o.delta} ${pct < 0 ? o.deltaFlat : ''}`} aria-label={`${pct > 0 ? '+' : ''}${pct}% ${label}`}>
      {pct > 0 ? '+' : ''}
      {pct}%
    </span>
  );
}

// ---------------------------------------------------------------- money

const MONEY_ROWS: Array<{ key: keyof MoneyFigures; label: string; format: (n: number) => string }> = [
  { key: 'installs', label: 'Installs', format: count },
  { key: 'revenue', label: 'Est. revenue', format: money },
  { key: 'commissions', label: 'Rep commissions', format: money },
  { key: 'margin', label: 'Est. margin', format: money },
];

function MoneyCell({ comparison, row, priorLabel }: { comparison: MoneyComparison; row: (typeof MONEY_ROWS)[number]; priorLabel: string }) {
  const current = comparison.current[row.key];
  const prior = comparison.prior[row.key];
  return (
    <td className={o.cell}>
      <span className={o.cellValue}>{row.format(current)}</span>
      <span className={o.cellPrior}>
        <span className={s.srOnly}>{priorLabel}: </span>
        <span aria-hidden="true">vs </span>
        {row.format(prior)}
        <span aria-hidden="true"> prior</span>
      </span>
    </td>
  );
}

/** The headline margin: counts up from $0 on the first Home of a session. */
function MarginScore({ margin }: { margin: number }) {
  const shown = useCountUp(Math.round(margin), { sessionKey: '3c:countup:owner-margin' });
  return <>{money(shown)}</>;
}

/** When the carrier report last landed; amber once it's stale, since every figure above comes from it. */
function ReportStamp({ reportAt }: { reportAt: string | null }) {
  const now = useMinuteClock();
  const stamp = carrierReportStamp(reportAt, now);
  if (!stamp) return null;
  return <span className={stamp.stale ? o.footGap : undefined}> {stamp.text}.</span>;
}

function MoneyBoard({ data }: { data: MoneySummary }) {
  const month = data.month;
  const week = data.week;
  const monthPrior = `through ${priorDay(month.priorEnd)}`;
  const weekPrior = `through ${priorDay(week.priorEnd)}`;
  const gaps = [
    data.unpricedInstalls > 0
      ? `${data.unpricedInstalls} ${data.unpricedInstalls === 1 ? 'install has' : 'installs have'} no 3C rate yet`
      : null,
    data.unratedInstalls > 0
      ? `${data.unratedInstalls} ${data.unratedInstalls === 1 ? 'install has' : 'installs have'} no rep rate`
      : null,
  ].filter(Boolean);

  return (
    <section className={`${s.panel} ${o.board}`} aria-labelledby="money-h">
      <h2 id="money-h" className={s.srOnly}>
        Company money
      </h2>
      <div className={o.cellMargin}>
        <p className={`${s.kicker} ${o.boardLabel}`}>Est. margin · {MONTH_SHORT.format(new Date())}</p>
        <p className={o.score}>
          <MarginScore margin={month.current.margin} />
        </p>
        <p className={o.heroSub}>
          <Delta current={month.current.margin} prior={month.prior.margin} label={`vs ${monthPrior}`} />
          <span>
            vs {money(month.prior.margin)} through {priorDay(month.priorEnd)}
          </span>
        </p>
      </div>

      <div className={o.cellInstalls}>
        <p className={`${s.kicker} ${o.boardLabel}`}>This week</p>
        <p className={`${o.score} ${o.scoreLime}`}>{count(week.current.installs)}</p>
        <p className={o.heroSub}>
          <Delta current={week.current.installs} prior={week.prior.installs} label={`vs ${weekPrior}`} />
          <span>
            <strong>installs</strong> · vs {count(week.prior.installs)} by {priorDay(week.priorEnd)}
          </span>
        </p>
      </div>

      <div className={o.tableWrap}>
        <table className={o.table}>
          <caption className={s.srOnly}>
            Estimated installs, revenue, rep commissions and margin, this week and this month, each against the same
            point in the prior period
          </caption>
          <thead>
            <tr>
              <th scope="col">
                <span className={s.srOnly}>Figure</span>
              </th>
              <th scope="col">This week</th>
              <th scope="col">This month</th>
            </tr>
          </thead>
          <tbody>
            {MONEY_ROWS.map((row) => (
              <tr key={row.key} className={row.key === 'margin' ? o.rowMargin : undefined}>
                <th scope="row">{row.label}</th>
                <MoneyCell comparison={week} row={row} priorLabel={weekPrior} />
                <MoneyCell comparison={month} row={row} priorLabel={monthPrior} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={o.foot}>
        Estimates from installs × current comp-plan rates. &ldquo;vs&rdquo; is the same point last week or last month.
        <ReportStamp reportAt={data.reportAt} />
        {gaps.length ? <span className={o.footGap}> {gaps.join(' · ')} (counted at $0).</span> : null}
      </p>
    </section>
  );
}

function MoneySkeleton() {
  return (
    <section className={`${s.panel} ${o.board}`} aria-busy="true" aria-label="Loading company money">
      <div className={o.cellMargin}>
        <p className={`${s.kicker} ${o.boardLabel}`}>Est. margin · {MONTH_SHORT.format(new Date())}</p>
        <span className={`${s.skel} ${o.skelScore}`} />
        <span className={`${s.skel} ${o.skelLine}`} />
      </div>
      <div className={o.cellInstalls}>
        <p className={`${s.kicker} ${o.boardLabel}`}>This week</p>
        <span className={`${s.skel} ${o.skelScore}`} />
      </div>
      <div className={`${o.tableWrap} ${o.skelTable}`}>
        {MONEY_ROWS.map((row) => (
          <span key={row.key} className={`${s.skel} ${o.skelRow}`} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- needs attention

// Needs attention is the admin work-queue panel (every queue, zero rows kept)
// plus the company checks that are not a queue anywhere else.
const COMPANY_CHECKS: Array<{ key: ProblemKey; label: string; href: string }> = [
  { key: 'carrierCancellations', label: 'Carrier cancellations this week', href: '/portal/sales' },
  { key: 'stalledOnboarding', label: 'Stuck in onboarding 3+ days', href: '/portal/admin/onboarding' },
  { key: 'missingInstallDate', label: 'Sales missing an install date', href: '/portal/sales' },
];

function companyRows(problems: Section<ProblemRow[]>): QueueCard[] {
  if (problems.status === 'loading') return [];
  return COMPANY_CHECKS.map((check) => {
    const row = problems.status === 'ready' ? problems.data.find((p) => p.key === check.key) : undefined;
    return {
      key: check.key,
      label: check.label,
      href: row?.href ?? check.href,
      hub: '',
      count: row?.count ?? 0,
      oldestWaitMs: null,
      newToday: null,
      error: problems.status === 'error',
    };
  });
}

// ---------------------------------------------------------------- recruiting

const RECRUITING_TILES: Array<{ key: keyof RecruitingSummary; label: string }> = [
  { key: 'applications', label: 'Applications' },
  { key: 'interviews', label: 'Interviews' },
  { key: 'activations', label: 'Activated' },
  { key: 'firstInstalls', label: 'First installs' },
];

function RecruitingTile({ label, value }: { label: string; value: WeekCount }) {
  return (
    <div className={o.stat}>
      <p className={o.statLabel}>{label}</p>
      <p className={o.statValue}>{count(value.thisWeek)}</p>
      <p className={o.statPrior}>
        <strong>{count(value.lastWeek)}</strong> all last week
      </p>
    </div>
  );
}

function Recruiting({ data }: { data: RecruitingSummary }) {
  return (
    <section className={`${s.panel} ${o.recruiting}`} aria-labelledby="recruit-h">
      <PanelHead id="recruit-h" title="Recruiting · this week" />
      <div className={o.stats}>
        {RECRUITING_TILES.map((tile) => (
          <RecruitingTile key={tile.key} label={tile.label} value={data[tile.key]} />
        ))}
      </div>
    </section>
  );
}

function SkeletonPanel({ label, title, rows, className }: { label: string; title: string; rows: number; className: string }) {
  return (
    <section className={`${s.panel} ${className}`} aria-busy="true" aria-label={label}>
      <PanelHead id={`${className}-skel`} title={title} />
      <div className={o.skelBody}>
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className={`${s.skel} ${o.skelRow}`} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page

export function OwnerDashboard() {
  const data = useOwnerDashboard();
  const { retry } = data;
  const [pushPromptVisible, hidePushPrompt] = usePushPromptVisible();

  return (
    <>
      <h1 className={s.srOnly}>Company dashboard</h1>

      <div className={o.grid}>
        <div className={o.banners}>
          <PushPromptBanner visible={pushPromptVisible} onDismiss={hidePushPrompt} />
          {pushPromptVisible === false && <AddToHomeScreenBanner pushPromptVisible={pushPromptVisible} />}
        </div>

        <div className={o.colMain}>
          {data.money.status === 'loading' ? (
            <MoneySkeleton />
          ) : data.money.status === 'error' ? (
            <section className={`${s.panel} ${o.board} ${o.boardFailed}`} aria-label="Company money">
              <div className={o.cellMargin}>
                <p className={`${s.kicker} ${o.boardLabel}`}>Est. margin · {MONTH_SHORT.format(new Date())}</p>
                <Failed what="company money" onRetry={() => retry('money')} className={o.cellFailed} />
              </div>
            </section>
          ) : (
            <MoneyBoard data={data.money.data} />
          )}

          <OpsQueuesPanel
            title="Needs attention"
            className={o.attention}
            extra={companyRows(data.problems)}
            extraLoading={data.problems.status === 'loading'}
            onRefresh={() => retry('problems')}
          />
        </div>

        <div className={o.colSide}>
          {data.recruiting.status === 'loading' ? (
            <SkeletonPanel label="Loading recruiting" title="Recruiting · this week" rows={2} className={o.recruiting} />
          ) : data.recruiting.status === 'error' ? (
            <section className={`${s.panel} ${o.recruiting}`} aria-labelledby="recruit-h">
              <PanelHead id="recruit-h" title="Recruiting · this week" />
              <Failed what="recruiting" onRetry={() => retry('recruiting')} />
            </section>
          ) : (
            <Recruiting data={data.recruiting.data} />
          )}
        </div>
      </div>
    </>
  );
}
