'use client';

import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, RotateCw } from 'lucide-react';
import { useOwnerDashboard } from '@/hooks/useOwnerDashboard';
import type {
  MoneyComparison,
  MoneyFigures,
  MoneySummary,
  ProblemKey,
  ProblemRow,
  RecruitingSummary,
  WeekCount,
} from '@/lib/owner/companySummary';
import AddToHomeScreenBanner from '@/components/portal/AddToHomeScreenBanner';
import PushPromptBanner, { usePushPromptVisible } from '@/components/portal/PushPromptBanner';
import s from '../rep/rep.module.css';
import o from './owner-dashboard.module.css';

// The owner's home screen (direction C, "split"): the company, not a personal
// pay card. Money sits on a raised card with its week | month breakdown tucked
// behind it; counts (installs, recruiting) sit on flatter scoreboard strips.
// Each section loads and fails on its own.

type OwnerDashboardData = ReturnType<typeof useOwnerDashboard>;

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

/** Stagger index for the first-load rise. */
const rise = (i: number) => ({ '--i': i }) as CSSProperties;

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

/** The recessed header band that opens a scoreboard strip. */
function Band({ id, title }: { id: string; title: string }) {
  return (
    <div className={o.band}>
      <h2 id={id} className={o.bandTitle}>
        {title}
      </h2>
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

/** Money only: the install counts live on the strip. */
const MONEY_ROWS: Array<{ key: Exclude<keyof MoneyFigures, 'installs'>; label: string }> = [
  { key: 'revenue', label: 'Est. revenue' },
  { key: 'commissions', label: 'Est. rep commissions' },
  { key: 'margin', label: 'Est. margin' },
];

function MoneyCell({ comparison, row, priorLabel }: { comparison: MoneyComparison; row: (typeof MONEY_ROWS)[number]; priorLabel: string }) {
  const current = comparison.current[row.key];
  const prior = comparison.prior[row.key];
  return (
    <td className={o.cell}>
      <span className={o.cellValue}>{money(current)}</span>
      <span className={o.cellPrior}>
        <span className={s.srOnly}>{priorLabel}: </span>
        <span aria-hidden="true">vs </span>
        {money(prior)}
        <span aria-hidden="true"> prior</span>
      </span>
    </td>
  );
}

/** The hero numeral: a muted, top-aligned $ and the whole dollars. */
function HeroMoney({ value }: { value: number }) {
  return (
    <p className={o.moneyNum}>
      <span className={s.srOnly}>{money(value)}</span>
      <span aria-hidden="true" className={o.moneyNumInner}>
        {value < 0 ? <span className={o.sign}>−</span> : null}
        <span className={o.cur}>$</span>
        {Math.round(Math.abs(value)).toLocaleString('en-US')}
      </span>
    </p>
  );
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
    <section className={`${o.money} ${o.rise}`} style={rise(0)} aria-labelledby="money-h">
      <h2 id="money-h" className={s.srOnly}>
        Company money
      </h2>
      <div className={o.moneyCard}>
        <p className={s.kicker}>Est. margin · {MONTH_SHORT.format(new Date())}</p>
        <div className={o.moneyHero}>
          <HeroMoney value={month.current.margin} />
          <p className={o.moneyDelta}>
            <Delta current={month.current.margin} prior={month.prior.margin} label={`vs ${monthPrior}`} />
            <span>
              vs {money(month.prior.margin)} through {priorDay(month.priorEnd)}
            </span>
          </p>
        </div>
      </div>

      <div className={o.ledger}>
        <table className={o.table}>
          <caption className={s.srOnly}>
            Estimated revenue, rep commissions and margin, this week and this month, each against the same point in the
            prior period
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

        <p className={o.foot}>
          Estimates from installs × current comp-plan rates. &ldquo;vs&rdquo; is the same point last week or last month.
          {gaps.length ? <span className={o.footGap}> {gaps.join(' · ')} (counted at $0).</span> : null}
        </p>
      </div>
    </section>
  );
}

function MoneySkeleton() {
  return (
    <section className={o.money} aria-busy="true" aria-label="Loading company money">
      <div className={o.moneyCard}>
        <p className={s.kicker}>Est. margin · {MONTH_SHORT.format(new Date())}</p>
        <span className={`${s.skel} ${o.skelNum}`} />
        <span className={`${s.skel} ${o.skelLine}`} />
      </div>
      <div className={`${o.ledger} ${o.skelTable}`}>
        {MONEY_ROWS.map((row) => (
          <span key={row.key} className={`${s.skel} ${o.skelRow}`} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- installs strip

function InstallsStrip({ data }: { data: MoneySummary }) {
  const { week, month } = data;
  return (
    <section className={`${o.strip} ${o.installs} ${o.rise}`} style={rise(1)} aria-labelledby="installs-h">
      <Band id="installs-h" title="Installs" />
      <div className={o.halves}>
        <div className={o.half}>
          <p className={o.halfLab}>This week</p>
          <p className={o.big}>{count(week.current.installs)}</p>
          <p className={o.cap}>
            <Delta current={week.current.installs} prior={week.prior.installs} label={`vs through ${priorDay(week.priorEnd)}`} />
            <span>
              vs <b>{count(week.prior.installs)}</b> by {priorDay(week.priorEnd)}
            </span>
          </p>
        </div>
        <div className={o.half}>
          <p className={o.halfLab}>This month</p>
          <p className={o.big}>{count(month.current.installs)}</p>
          <p className={o.cap}>
            <span>
              vs <b>{count(month.prior.installs)}</b> by {priorDay(month.priorEnd)}
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}

function InstallsSkeleton() {
  return (
    <section className={`${o.strip} ${o.installs}`} aria-busy="true" aria-label="Loading installs">
      <Band id="installs-skel" title="Installs" />
      <div className={o.halves}>
        {[0, 1].map((i) => (
          <div key={i} className={o.half}>
            <span className={`${s.skel} ${o.skelBig}`} />
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- needs attention

const PROBLEM_COPY: Record<ProblemKey, { one: string; many: string; page: string }> = {
  carrierCancellations: { one: 'Carrier cancellation this week', many: 'Carrier cancellations this week', page: 'Sales · Cancelled' },
  payrollDisputes: { one: 'Open pay dispute', many: 'Open pay disputes', page: 'Payroll disputes' },
  stalledOnboarding: { one: 'Stuck in onboarding 3+ days', many: 'Stuck in onboarding 3+ days', page: 'Onboarding' },
  pendingSignups: { one: 'Signup waiting for approval', many: 'Signups waiting for approval', page: 'Users' },
  missingInstallDate: { one: 'Sale missing an install date', many: 'Sales missing an install date', page: 'Sales' },
  expediteOrders: { one: 'Open expedite request', many: 'Open expedite requests', page: 'Expedite orders' },
  leadsRequests: { one: 'Open leads request', many: 'Open leads requests', page: 'Leads requests' },
  bugReports: { one: 'New bug report', many: 'New bug reports', page: 'Bug reports' },
};

/** Money at risk reads amber; queues read plain. */
const MONEY_RISK: ReadonlySet<ProblemKey> = new Set(['carrierCancellations', 'payrollDisputes', 'missingInstallDate']);

function Attention({ rows }: { rows: ProblemRow[] }) {
  const open = rows.filter((row) => row.count > 0);
  return (
    <section className={`${o.panel} ${o.attention} ${o.rise}`} style={rise(2)} aria-labelledby="attn-h">
      <PanelHead id="attn-h" title="Needs attention" />
      {open.length === 0 ? (
        <p className={o.clear}>All clear</p>
      ) : (
        <ul className={o.attnList}>
          {open.map((row) => {
            const copy = PROBLEM_COPY[row.key];
            return (
              <li key={row.key}>
                <Link href={row.href} className={o.attnRow}>
                  <span className={`${o.attnCount} ${MONEY_RISK.has(row.key) ? o.attnRisk : ''}`}>{count(row.count)}</span>
                  <span className={o.tText}>
                    <span className={o.tTitle}>{row.count === 1 ? copy.one : copy.many}</span>
                    <span className={o.tSub}>{copy.page}</span>
                  </span>
                  <ChevronRight size={20} className={o.chev} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
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
      <p className={o.halfLab}>{label}</p>
      <p className={o.statValue}>{count(value.thisWeek)}</p>
      <p className={o.cap}>
        <span>
          <b>{count(value.lastWeek)}</b> all last week
        </span>
      </p>
    </div>
  );
}

function Recruiting({ data }: { data: RecruitingSummary }) {
  return (
    <section className={`${o.strip} ${o.recruiting} ${o.rise}`} style={rise(3)} aria-labelledby="recruit-h">
      <Band id="recruit-h" title="Recruiting · this week" />
      <div className={o.stats}>
        {RECRUITING_TILES.map((tile) => (
          <RecruitingTile key={tile.key} label={tile.label} value={data[tile.key]} />
        ))}
      </div>
    </section>
  );
}

function SkeletonPanel({ label, rows, className, children }: { label: string; rows: number; className: string; children: ReactNode }) {
  return (
    <section className={className} aria-busy="true" aria-label={label}>
      {children}
      <div className={o.skelBody}>
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className={`${s.skel} ${o.skelRow}`} />
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- page

/** The page body, fed by the hook (or by mock data in the design lab). */
export function OwnerDashboardView({ data, banners }: { data: OwnerDashboardData; banners?: ReactNode }) {
  const { retry } = data;

  return (
    <>
      <h1 className={s.srOnly}>Company dashboard</h1>

      <div className={o.grid}>
        <div className={o.banners}>{banners}</div>

        <div className={o.colMain}>
          {data.money.status === 'loading' ? (
            <MoneySkeleton />
          ) : data.money.status === 'error' ? (
            <section className={o.money} aria-label="Company money">
              <div className={o.moneyCard}>
                <p className={s.kicker}>Est. margin · {MONTH_SHORT.format(new Date())}</p>
                <Failed what="company money" onRetry={() => retry('money')} className={o.cellFailed} />
              </div>
            </section>
          ) : (
            <MoneyBoard data={data.money.data} />
          )}

          {data.recruiting.status === 'loading' ? (
            <SkeletonPanel label="Loading recruiting" rows={2} className={`${o.strip} ${o.recruiting}`}>
              <Band id="recruit-skel" title="Recruiting · this week" />
            </SkeletonPanel>
          ) : data.recruiting.status === 'error' ? (
            <section className={`${o.strip} ${o.recruiting}`} aria-labelledby="recruit-h">
              <Band id="recruit-h" title="Recruiting · this week" />
              <Failed what="recruiting" onRetry={() => retry('recruiting')} />
            </section>
          ) : (
            <Recruiting data={data.recruiting.data} />
          )}
        </div>

        <div className={o.colSide}>
          {/* The strip reads the money summary; a money failure shows once, on the card. */}
          {data.money.status === 'loading' ? (
            <InstallsSkeleton />
          ) : data.money.status === 'ready' ? (
            <InstallsStrip data={data.money.data} />
          ) : null}

          {data.problems.status === 'loading' ? (
            <SkeletonPanel label="Loading needs attention" rows={4} className={`${o.panel} ${o.attention}`}>
              <PanelHead id="attn-skel" title="Needs attention" />
            </SkeletonPanel>
          ) : data.problems.status === 'error' ? (
            <section className={`${o.panel} ${o.attention}`} aria-labelledby="attn-h">
              <PanelHead id="attn-h" title="Needs attention" />
              <Failed what="what needs attention" onRetry={() => retry('problems')} />
            </section>
          ) : (
            <Attention rows={data.problems.data} />
          )}
        </div>
      </div>
    </>
  );
}

export function OwnerDashboard() {
  const data = useOwnerDashboard();
  const [pushPromptVisible, hidePushPrompt] = usePushPromptVisible();

  return (
    <OwnerDashboardView
      data={data}
      banners={
        <>
          <PushPromptBanner visible={pushPromptVisible} onDismiss={hidePushPrompt} />
          {pushPromptVisible === false && <AddToHomeScreenBanner pushPromptVisible={pushPromptVisible} />}
        </>
      }
    />
  );
}
