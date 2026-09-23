'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  CircleHelp,
  Clock,
  FileWarning,
  Inbox,
  Plus,
  RotateCw,
  Timer,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Video,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { useRepDashboard, type RepSectionKey, type Section } from '@/hooks/useRepDashboard';
import {
  callsToday,
  formatCallTime,
  needsDateRows,
  recentSaleRows,
  standingFrom,
  summarizePay,
  weekTimeLeft,
  type DashboardCall,
  type NeedsDateRow,
  type PaySummary,
  type RecentSaleRow,
  type RowStatus,
  type Standing,
} from '@/lib/dashboard/repSummary';
import { formatPayoutWindow } from '@/lib/pay/payoutWindow';
import AddToHomeScreenBanner from '@/components/portal/AddToHomeScreenBanner';
import PushPromptBanner, { usePushPromptVisible } from '@/components/portal/PushPromptBanner';
import { PAY_DISPUTE_HREF, PayHelpSheet } from './PayHelpSheet';
import { LOG_SALE_HREF } from './repNav';
import s from './rep.module.css';
import d from './rep-dashboard.module.css';

// ---------------------------------------------------------------- format

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function ordinalSuffix(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const shortDate = (date: Date | null) => (date ? SHORT_DATE.format(date) : '');

const FOOTNOTE =
  "Estimates. You're paid when 3C receives funds from the carrier; missed installs are settled as claims by the 25th of the next month.";

const STATUS_CLASS: Record<RowStatus, string> = {
  installed: d.st_installed,
  scheduled: d.st_scheduled,
  'needs-date': d.st_needsdate,
  missed: d.st_missed,
  cancelled: d.st_cancelled,
};

function statusLine(row: RecentSaleRow) {
  switch (row.status) {
    case 'installed':
      return row.installDate ? `Installed ${shortDate(row.installDate)}` : 'Installed';
    case 'scheduled':
      return row.installDate ? `Installs ${shortDate(row.installDate)}` : 'Scheduled';
    case 'needs-date':
      return 'Needs install date';
    case 'missed':
      return 'Missed install · reschedule';
    case 'cancelled':
      return 'Cancelled';
  }
}

function payCell(row: RecentSaleRow): ReactNode {
  if (row.status === 'cancelled' || row.estPay === null) return '—';
  if (row.estPay === 0) return 'Rate pending';
  return (
    <>
      <small className={d.est}>est.</small>
      {money(row.estPay)}
    </>
  );
}

function payoutLine(row: RecentSaleRow) {
  if (row.payoutLabel) return `Est. payout ${row.payoutLabel}`;
  if (row.status === 'cancelled') return 'No pay';
  if (row.status === 'installed') return '';
  if (row.status === 'missed') return 'After reschedule';
  return 'After install';
}

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

function SkeletonPanel({ label, rows = 2, className = '' }: { label: string; rows?: number; className?: string }) {
  return (
    <section className={`${s.panel} ${className}`} aria-busy="true" aria-label={label}>
      <div className={d.skelBody}>
        <span className={`${s.skel} ${d.skelLine}`} />
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className={`${s.skel} ${d.skelRow}`} />
        ))}
      </div>
    </section>
  );
}

function Ring({ done, goal }: { done: number; goal: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const share = goal > 0 ? Math.min(done / goal, 1) : 0;
  return (
    <svg className={d.ring} viewBox="0 0 72 72" aria-hidden="true">
      <circle cx="36" cy="36" r={r} className={d.ringTrack} />
      {share > 0 ? (
        <circle
          cx="36"
          cy="36"
          r={r}
          className={d.ringFill}
          strokeDasharray={`${share * c} ${c}`}
          transform="rotate(-90 36 36)"
        />
      ) : null}
    </svg>
  );
}

// ---------------------------------------------------------------- board

const BUCKETS = [
  { key: 'installed', seg: d.seg_installed, label: 'installed' },
  { key: 'scheduled', seg: d.seg_scheduled, label: 'scheduled' },
  { key: 'attention', seg: d.seg_needs, label: 'needs a date' },
] as const;

/** One segment per sale up to 10; above that each bucket is one proportional segment. */
function MonthStack({ counts, total }: { counts: PaySummary['counts']; total: number }) {
  return (
    <div className={d.stack} aria-hidden="true">
      {BUCKETS.flatMap((bucket) => {
        const n = counts[bucket.key];
        if (!n) return [];
        if (total > 10) return [<span key={bucket.key} className={bucket.seg} style={{ flex: n }} />];
        return Array.from({ length: n }, (_, i) => <span key={`${bucket.key}-${i}`} className={bucket.seg} />);
      })}
    </div>
  );
}

function PayoutRow({ pay, className }: { pay: PaySummary; className: string }) {
  const payout = pay.payout;
  if (!payout) return null;
  const range = formatPayoutWindow(payout.window);
  return (
    <div className={`${d.payday} ${className}`}>
      <CalendarClock size={20} strokeWidth={1.75} aria-hidden="true" className={d.paydayIcon} />
      <span className={d.paydayText}>
        <span className={`${s.kicker} ${d.boardLabel}`}>Next window · T-Fiber</span>
        <span className={d.paydayDate}>Est. payout {range}</span>
        <span className={d.paydayMeta}>
          {payout.count} {payout.count === 1 ? 'sale' : 'sales'}
          {payout.scheduled > 0 ? ` · ${payout.scheduled} scheduled` : ''}
        </span>
      </span>
      {payout.amount !== null ? (
        <span className={d.paydayAmt}>
          <small>est.</small>
          {money(payout.amount)}
        </span>
      ) : null}
    </div>
  );
}

function Board({
  pay,
  hasPlan,
  standing,
  onHelp,
  onRetryStanding,
}: {
  pay: PaySummary;
  hasPlan: boolean;
  standing: Section<Standing | null>;
  onHelp: () => void;
  onRetryStanding: () => void;
}) {
  const showRank = standing.status !== 'ready' || standing.data !== null;
  const delta = pay.deltaPct;

  return (
    <section className={`${s.panel} ${d.board} ${showRank ? '' : d.boardSolo}`} aria-label="Pay and rank">
      <div className={d.cellPay}>
        <p className={`${s.kicker} ${d.boardLabel}`}>Est. pay this month</p>
        <p className={d.score}>{hasPlan && pay.estThisMonth !== null ? money(pay.estThisMonth) : '—'}</p>
        {!hasPlan ? (
          <p className={d.noPlan}>No pay plan assigned yet</p>
        ) : delta !== null ? (
          <p className={`${d.delta} ${delta < 0 ? d.deltaDown : ''}`}>
            {delta < 0 ? (
              <TrendingDown size={16} strokeWidth={2.25} aria-hidden="true" />
            ) : (
              <TrendingUp size={16} strokeWidth={2.25} aria-hidden="true" />
            )}
            {delta > 0 ? '+' : ''}
            {delta}% vs last month
          </p>
        ) : null}
        {/* Money on sales with nothing on the calendar yet: it has no month. */}
        {hasPlan && pay.estNoDate ? (
          <p className={d.noDate}>est. {money(pay.estNoDate)} no install date yet</p>
        ) : null}
        {/* Missed installs: their date is stale, so their money waits on a new one. */}
        {hasPlan && pay.estMissed ? (
          <p className={d.noDate}>est. {money(pay.estMissed)} needs a new install date</p>
        ) : null}
      </div>

      {showRank ? (
        <div className={d.cellRank}>
          <p className={`${s.kicker} ${d.boardLabel}`}>Weekly rank</p>
          {standing.status === 'loading' ? (
            <span className={`${s.skel} ${d.skelScore}`} aria-label="Loading rank" />
          ) : standing.status === 'error' ? (
            <Failed what="rank" onRetry={onRetryStanding} className={d.cellFailed} />
          ) : standing.data ? (
            <>
              <p className={`${d.score} ${d.rank}`}>
                {standing.data.rank}
                <span className={d.ord}>{ordinalSuffix(standing.data.rank)}</span>
              </p>
              <p className={d.sub}>
                of {standing.data.of} · <strong>{standing.data.points.toLocaleString('en-US')} pts</strong>
              </p>
            </>
          ) : null}
        </div>
      ) : null}

      <div className={d.cellPeriod}>
        <div className={d.periodHead}>
          <p className={`${s.kicker} ${d.boardLabel}`}>This month</p>
          <p className={d.periodCount}>
            {pay.monthCount} {pay.monthCount === 1 ? 'sale' : 'sales'}
          </p>
        </div>
        {pay.monthCount > 0 ? (
          <>
            <MonthStack counts={pay.counts} total={pay.monthCount} />
            <ul className={d.legend}>
              {BUCKETS.filter((bucket) => pay.counts[bucket.key] > 0).map((bucket) => (
                <li key={bucket.key}>
                  <span className={`${d.swatch} ${bucket.seg}`} aria-hidden="true" />
                  <b>{pay.counts[bucket.key]}</b> {bucket.label}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className={d.periodEmpty}>Nothing logged this month yet.</p>
        )}
      </div>

      {/* Phone: the payout window closes the score panel. Desktop moves it to the right column. */}
      <PayoutRow pay={pay} className={s.phoneOnly} />

      <div className={d.payLinks}>
        <button type="button" className={d.payLink} onClick={onHelp} aria-haspopup="dialog">
          <CircleHelp size={16} aria-hidden="true" />
          How pay works
        </button>
        <Link href={PAY_DISPUTE_HREF} className={d.payLink}>
          <FileWarning size={16} aria-hidden="true" />
          Missing an install?
        </Link>
      </div>
    </section>
  );
}

function BoardSkeleton() {
  return (
    <section className={`${s.panel} ${d.board}`} aria-busy="true" aria-label="Loading pay and rank">
      <div className={d.cellPay}>
        <p className={`${s.kicker} ${d.boardLabel}`}>Est. pay this month</p>
        <span className={`${s.skel} ${d.skelScore}`} />
        <span className={`${s.skel} ${d.skelLine}`} />
      </div>
      <div className={d.cellRank}>
        <p className={`${s.kicker} ${d.boardLabel}`}>Weekly rank</p>
        <span className={`${s.skel} ${d.skelScore}`} />
      </div>
      <div className={d.cellPeriod}>
        <span className={`${s.skel} ${d.skelBar}`} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- standing

function standLine(standing: Standing): ReactNode {
  if (standing.ahead) {
    return (
      <>
        <strong>{standing.ahead.gap.toLocaleString('en-US')} pts</strong> behind {standing.ahead.name} for #
        {standing.ahead.rank}
      </>
    );
  }
  if (standing.tiedWith) {
    return (
      <>
        Level with <strong>{standing.tiedWith}</strong> on points. One more sale breaks it.
      </>
    );
  }
  if (standing.leadBy !== null) {
    return standing.leadBy > 0 ? (
      <>
        You lead by <strong>{standing.leadBy.toLocaleString('en-US')} pts</strong>
      </>
    ) : (
      <>Tied for 1st. One more sale breaks it.</>
    );
  }
  return <>Top of the board this week</>;
}

function StandingPanels({ standing }: { standing: Standing }) {
  const ahead = standing.ahead;
  const gapPct = ahead && ahead.points > 0 ? Math.round((standing.points / ahead.points) * 100) : null;

  return (
    <>
      <section className={`${s.panel} ${s.deskOnly}`} aria-labelledby="race-h">
        <PanelHead id="race-h" title="Where you stand">
          <Link href="/portal/leaderboard" className={d.headLink}>
            Leaderboard
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </PanelHead>
        <ol className={d.ladder}>
          {ahead ? (
            <li className={d.rung}>
              <span className={d.rungPos}>{ahead.rank}</span>
              <span className={d.rungName}>{ahead.name}</span>
              <span className={d.rungPts}>
                {ahead.points.toLocaleString('en-US')}
                <small> pts</small>
              </span>
            </li>
          ) : null}
          <li className={`${d.rung} ${d.rungYou}`} aria-current="true">
            <span className={d.rungPos}>{standing.rank}</span>
            <span className={d.rungName}>You</span>
            <span className={d.rungPts}>
              {standing.points.toLocaleString('en-US')}
              <small> pts</small>
            </span>
          </li>
        </ol>
        <div className={d.gap}>
          {gapPct !== null ? (
            <div className={s.track} aria-hidden="true">
              <span className={s.fill} style={{ width: `${gapPct}%` }} />
            </div>
          ) : null}
          <p className={d.gapText}>{standLine(standing)}</p>
        </div>
      </section>

      <section className={`${s.panel} ${d.standB} ${s.phoneOnly}`} aria-labelledby="stand-b-h">
        <PanelHead id="stand-b-h" title="Where you stand">
          <Link href="/portal/leaderboard" className={d.headLink}>
            Leaderboard
            <ArrowUpRight size={16} aria-hidden="true" />
          </Link>
        </PanelHead>
        <div className={d.statTiles}>
          <div className={d.statTile}>
            <p className={d.statLabel}>Rank · this week</p>
            <p className={d.statValue}>
              #{standing.rank}
              <span className={d.statOf}> of {standing.of}</span>
            </p>
          </div>
          <div className={d.statTile}>
            <p className={d.statLabel}>Points</p>
            <p className={d.statValue}>
              {standing.points.toLocaleString('en-US')}
              <span className={d.statOf}> pts</span>
            </p>
          </div>
        </div>
        <p className={d.standGap}>{standLine(standing)}</p>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- challenge

function ChallengePanels({ target, done, timeLeft }: { target: number; done: number; timeLeft: string }) {
  const toGo = Math.max(target - done, 0);
  const title = `Close ${target} ${target === 1 ? 'sale' : 'sales'} by Saturday`;
  const progress =
    toGo > 0 ? (
      <>
        <strong>{toGo} more</strong> to close it out
      </>
    ) : (
      <>
        <strong>Done.</strong> Challenge closed.
      </>
    );
  const ticks = Math.min(target, 20);

  return (
    <>
      <section className={`${s.panel} ${s.deskOnly}`} aria-labelledby="ch-h">
        <PanelHead id="ch-h" title="Weekly challenge">
          <span className={d.clock}>
            <Timer size={16} aria-hidden="true" />
            {timeLeft}
          </span>
        </PanelHead>
        <div className={d.challengeBody}>
          <div className={d.challengeTop}>
            <p className={d.challengeTitle}>{title}</p>
            <p className={d.challengeScore} aria-label={`${done} of ${target}`}>
              {done}
              <span>/{target}</span>
            </p>
          </div>
          <div className={d.ticks} style={{ gridTemplateColumns: `repeat(${ticks}, 1fr)` }} aria-hidden="true">
            {Array.from({ length: ticks }, (_, i) => {
              const filled = Math.min(done, ticks);
              return (
                <span key={i} className={i < filled ? (i === filled - 1 ? d.tickLead : d.tickOn) : undefined} />
              );
            })}
          </div>
          <p className={d.gapText}>{progress}</p>
        </div>
      </section>

      <section className={`${s.panel} ${d.ringCard} ${s.phoneOnly}`} aria-label="Weekly challenge">
        <div className={d.ringWrap}>
          <Ring done={done} goal={target} />
          <span className={d.ringText} aria-label={`${done} of ${target}`}>
            {done}
            <span>/{target}</span>
          </span>
        </div>
        <div className={d.ringBody}>
          <p className={s.kicker}>Weekly challenge</p>
          <p className={d.ringTitle}>{title}</p>
          <p className={d.ringMeta}>
            <span>{toGo > 0 ? <><strong>{toGo} more</strong> to go</> : <strong>Done</strong>}</span>
            <span className={d.ringTime}>
              <Clock size={14} strokeWidth={2.25} aria-hidden="true" />
              {timeLeft}
            </span>
          </p>
        </div>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- today

type TodayItem =
  | { kind: 'call'; call: DashboardCall }
  | { kind: 'date'; row: NeedsDateRow }
  | { kind: 'queue'; key: string; title: string; sub: string; href: string; icon: 'signups' | 'leads' };

const MAX_DATE_ROWS = 3;

function todayHref(item: TodayItem) {
  if (item.kind === 'call') return item.call.meetLink || '/portal/calls';
  if (item.kind === 'date') return `/portal/sales/${item.row.id}/edit`;
  return item.href;
}

function TodayPanels({
  items,
  extraDates,
  callsFailed,
  onRetryCalls,
}: {
  items: TodayItem[];
  extraDates: number;
  callsFailed: boolean;
  onRetryCalls: () => void;
}) {
  const external = (item: TodayItem) => item.kind === 'call' && !!item.call.meetLink;
  const linkProps = (item: TodayItem) =>
    external(item) ? { target: '_blank', rel: 'noopener noreferrer' } : {};
  const key = (item: TodayItem) =>
    item.kind === 'call' ? `call-${item.call.id}` : item.kind === 'date' ? `date-${item.row.id}` : item.key;
  const more =
    extraDates > 0 ? (
      <Link href="/portal/sales" className={d.todayMore}>
        {extraDates} more {extraDates === 1 ? 'sale needs' : 'sales need'} a date
      </Link>
    ) : null;
  const failed = callsFailed ? <Failed what="today's calls" onRetry={onRetryCalls} /> : null;

  return (
    <>
      <section className={`${s.panel} ${d.today} ${s.deskOnly}`} aria-labelledby="today-h">
        <PanelHead id="today-h" title="Today" />
        <ul className={d.todayList}>
          {items.map((item) => (
            <li
              key={key(item)}
              className={`${d.todayRow} ${item.kind === 'date' ? d.todayAction : ''} ${item.kind === 'queue' ? d.todayQueue : ''}`}
            >
              <span className={d.todayTime}>
                {item.kind === 'call' ? formatCallTime(item.call.time) : item.kind === 'date' ? 'Now' : 'Queue'}
              </span>
              <span className={d.todayTitle}>
                {item.kind === 'call'
                  ? item.call.title
                  : item.kind === 'date'
                    ? `${item.row.missed ? 'Reschedule' : 'Add install date'} · ${item.row.customer}`
                    : item.title}
              </span>
              <Link href={todayHref(item)} className={`${s.btnSecondary} ${d.todayBtn}`} {...linkProps(item)}>
                {item.kind === 'call' ? (
                  <>
                    <Video size={16} aria-hidden="true" />
                    Join
                  </>
                ) : item.kind === 'date' ? (
                  'Add date'
                ) : (
                  'Open'
                )}
              </Link>
            </li>
          ))}
        </ul>
        {more}
        {failed}
      </section>

      <section className={`${s.panel} ${d.todayB} ${s.phoneOnly}`} aria-labelledby="today-b-h">
        <PanelHead id="today-b-h" title="Today" />
        {items.map((item) => (
          <Link key={key(item)} href={todayHref(item)} className={d.tRow} {...linkProps(item)}>
            {item.kind === 'call' ? (
              <span className={`${d.tile} ${d.tileBlue}`} aria-hidden="true">
                <Video size={18} strokeWidth={2} />
              </span>
            ) : item.kind === 'date' ? (
              <span className={`${d.tile} ${d.tileAmber}`} aria-hidden="true">
                <CalendarPlus size={18} strokeWidth={2} />
              </span>
            ) : (
              <span className={`${d.tile} ${d.tileLime}`} aria-hidden="true">
                {item.icon === 'signups' ? <UserPlus size={18} strokeWidth={2} /> : <Inbox size={18} strokeWidth={2} />}
              </span>
            )}
            <span className={d.tText}>
              {item.kind === 'call' ? (
                <>
                  <span className={d.tTitle}>{item.call.title}</span>
                  <span className={d.tSub}>
                    {item.call.meetLink ? 'Join' : 'Starts'} {formatCallTime(item.call.time)}
                  </span>
                </>
              ) : item.kind === 'date' ? (
                <>
                  <span className={d.tTitle}>{item.row.missed ? 'Reschedule the install' : 'Add an install date'}</span>
                  <span className={d.tSub}>
                    <span className={d.tNow}>Now</span> · {item.row.customer}
                    {item.row.plan ? `, ${item.row.plan}` : ''}
                  </span>
                </>
              ) : (
                <>
                  <span className={d.tTitle}>{item.title}</span>
                  <span className={d.tSub}>{item.sub}</span>
                </>
              )}
            </span>
            <ChevronRight size={20} className={d.chev} aria-hidden="true" />
          </Link>
        ))}
        {more}
        {failed}
      </section>
    </>
  );
}

// ---------------------------------------------------------------- recent sales

function RecentSales({ rows }: { rows: RecentSaleRow[] }) {
  return (
    <>
      <section className={`${s.panel} ${s.deskOnly}`} aria-labelledby="sales-h">
        <PanelHead id="sales-h" title="Recent sales">
          <Link href="/portal/sales" className={d.headLink}>
            All sales
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </PanelHead>
        <div className={d.tableHead} aria-hidden="true">
          <span>Customer</span>
          <span>Plan</span>
          <span>Status</span>
          <span className={d.num}>Est. pay</span>
          <span className={d.num}>Est. payout</span>
        </div>
        <ul className={d.saleList}>
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                href={`/portal/sales/${row.id}`}
                className={`${d.sale} ${d.saleRow} ${row.status === 'cancelled' ? d.saleOff : ''}`}
              >
                <span className={d.saleWho}>
                  <span className={d.saleName}>{row.customer}</span>
                  {row.address ? <span className={d.saleAddr}>{row.address}</span> : null}
                </span>
                <span className={d.salePlan}>{row.plan}</span>
                <span className={`${d.status} ${STATUS_CLASS[row.status]}`}>
                  <span className={d.dot} aria-hidden="true" />
                  {statusLine(row)}
                </span>
                <span className={`${d.saleAmt} ${d.num}`}>{payCell(row)}</span>
                <span className={`${d.saleWhen} ${d.num}`}>{payoutLine(row) || '—'}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className={d.foot}>{FOOTNOTE}</p>
      </section>

      <section className={`${d.salesB} ${s.phoneOnly}`} aria-labelledby="sales-b-h">
        <div className={`${s.panel} ${d.group}`}>
          <PanelHead id="sales-b-h" title="Recent sales">
            <Link href="/portal/sales" className={d.headLink}>
              See all
              <ChevronRight size={16} aria-hidden="true" />
            </Link>
          </PanelHead>
          {rows.map((row) => (
            <Link
              key={row.id}
              href={`/portal/sales/${row.id}`}
              className={`${d.saleB} ${row.status === 'cancelled' ? d.saleOff : ''}`}
            >
              <span className={d.saleBName}>{row.customer}</span>
              <span className={d.saleBPay}>{payCell(row)}</span>
              <span className={`${d.saleBStatus} ${STATUS_CLASS[row.status]}`}>
                <span className={d.dot} aria-hidden="true" />
                {statusLine(row)}
              </span>
              <span className={d.saleBWhen}>{payoutLine(row)}</span>
              <span className={d.saleBMeta}>{[row.plan, row.address].filter(Boolean).join(' · ')}</span>
            </Link>
          ))}
        </div>
        <p className={d.footB}>{FOOTNOTE}</p>
      </section>
    </>
  );
}

// ---------------------------------------------------------------- page

function useNow(intervalMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * The D rep dashboard. Everyone (rep, manager, admin, owner) sees their OWN
 * numbers here; management queues only appear as rows under Today, and only
 * when they have something in them.
 */
export function RepDashboard() {
  const { user, isRole, hasPermission } = useAuth();
  const isAdmin = isRole('admin');
  const withLeads = isRole('admin', 'operations');
  const data = useRepDashboard({ withLeads });
  const { retry } = data;
  const pendingSignups = usePendingSignupsCount(isAdmin);
  const [pushPromptVisible, hidePushPrompt] = usePushPromptVisible();
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const now = useNow();

  const retryMany = (...keys: RepSectionKey[]) => {
    for (const key of keys) retry(key);
  };

  const book = data.book.status === 'ready' ? data.book.data : null;
  const rates = data.plan.status === 'ready' ? data.plan.data.rates : null;

  const pay = useMemo(
    () => (book && data.plan.status === 'ready' ? summarizePay(book.sales, book.fiberBySale, rates, now) : null),
    [book, data.plan.status, rates, now]
  );
  const rows = useMemo(
    () => (book && data.plan.status === 'ready' ? recentSaleRows(book.sales, book.fiberBySale, rates, now) : []),
    [book, data.plan.status, rates, now]
  );
  const dates = useMemo(() => (book ? needsDateRows(book.sales, book.fiberBySale, now) : []), [book, now]);

  const standing: Section<Standing | null> =
    data.standing.status === 'ready'
      ? {
          status: 'ready',
          data: standingFrom(data.standing.data.entries, data.standing.data.me, data.standing.data.totalRanked),
        }
      : data.standing;

  const todayItems: TodayItem[] = [
    ...(data.calls.status === 'ready' ? callsToday(data.calls.data, now) : []).map(
      (call) => ({ kind: 'call', call }) as const
    ),
    ...dates.slice(0, MAX_DATE_ROWS).map((row) => ({ kind: 'date', row }) as const),
  ];
  if (isAdmin && pendingSignups > 0) {
    todayItems.push({
      kind: 'queue',
      key: 'signups',
      title: `Approve ${pendingSignups} new ${pendingSignups === 1 ? 'signup' : 'signups'}`,
      sub: 'Waiting on an admin',
      href: '/portal/admin/users',
      icon: 'signups',
    });
  }
  if (data.leads?.status === 'ready' && data.leads.data > 0) {
    todayItems.push({
      kind: 'queue',
      key: 'leads',
      title: `${data.leads.data} open leads ${data.leads.data === 1 ? 'request' : 'requests'}`,
      sub: 'Reps waiting on leads',
      href: '/portal/admin/leads-requests',
      icon: 'leads',
    });
  }

  const firstName = user?.displayName?.split(' ')[0] || 'Your';
  const zeroSales = book !== null && book.sales.length === 0;
  const canLog = hasPermission('sales:write');
  const payLoading = data.book.status === 'loading' || data.plan.status === 'loading';
  const payFailed = data.book.status === 'error' || data.plan.status === 'error';
  const challenge = data.challenge.status === 'ready' && data.challenge.data.target > 0 ? data.challenge.data : null;
  const todayLoading = data.calls.status === 'loading' || data.book.status === 'loading';
  const showToday = todayItems.length > 0 || data.calls.status === 'error';

  return (
    <>
      <h1 className={s.srOnly}>{firstName === 'Your' ? 'Your dashboard' : `${firstName}'s dashboard`}</h1>

      <div className={d.grid}>
        <div className={d.banners}>
          <PushPromptBanner visible={pushPromptVisible} onDismiss={hidePushPrompt} />
          {pushPromptVisible === false && <AddToHomeScreenBanner pushPromptVisible={pushPromptVisible} />}
        </div>

        <div className={d.colMain}>
          {payLoading ? (
            <BoardSkeleton />
          ) : payFailed ? (
            <section className={`${s.panel} ${d.board} ${d.boardSolo}`} aria-label="Pay and rank">
              <div className={d.cellPay}>
                <p className={`${s.kicker} ${d.boardLabel}`}>Est. pay this month</p>
                <Failed
                  what="your pay"
                  onRetry={() =>
                    retryMany(
                      ...(['book', 'plan'] as const).filter((key) => data[key].status === 'error')
                    )
                  }
                  className={d.cellFailed}
                />
              </div>
            </section>
          ) : zeroSales ? (
            <section className={`${s.panel} ${d.welcome}`} aria-labelledby="welcome-h">
              <p className={s.kicker}>Your scoreboard</p>
              <h2 id="welcome-h" className={d.welcomeTitle}>
                No sales yet
              </h2>
              <p className={d.welcomeText}>
                Log a sale and your estimated pay, installs and rank start filling in here.
              </p>
              {canLog ? (
                <Link href={LOG_SALE_HREF} className={s.btnPrimary}>
                  <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
                  Log your first sale
                </Link>
              ) : null}
            </section>
          ) : pay ? (
            <Board
              pay={pay}
              hasPlan={rates !== null}
              standing={standing}
              onHelp={() => setHelpOpen(true)}
              onRetryStanding={() => retry('standing')}
            />
          ) : null}

          {!payLoading && !payFailed && rows.length > 0 ? <RecentSales rows={rows} /> : null}
        </div>

        <div className={d.colSide}>
          {pay && !zeroSales ? <PayoutRow pay={pay} className={`${d.paydayCard} ${s.panel} ${s.deskOnly}`} /> : null}

          {/* Rank already shows on the board while loading / failed; the race panel only adds to it once ready. */}
          {standing.status === 'ready' && standing.data ? <StandingPanels standing={standing.data} /> : null}
          {zeroSales && standing.status === 'error' ? (
            <section className={`${s.panel} ${d.standB}`} aria-label="Where you stand">
              <Failed what="your rank" onRetry={() => retry('standing')} />
            </section>
          ) : null}

          {data.challenge.status === 'loading' ? (
            <SkeletonPanel label="Loading weekly challenge" rows={1} className={d.ringCard} />
          ) : data.challenge.status === 'error' ? (
            <section className={`${s.panel} ${d.ringCard}`} aria-label="Weekly challenge">
              <Failed what="the weekly challenge" onRetry={() => retry('challenge')} />
            </section>
          ) : challenge ? (
            <ChallengePanels target={challenge.target} done={challenge.done} timeLeft={weekTimeLeft(now)} />
          ) : null}

          {todayLoading && todayItems.length === 0 ? (
            <SkeletonPanel label="Loading today" rows={2} className={`${d.todayB} ${d.today}`} />
          ) : showToday ? (
            <TodayPanels
              items={todayItems}
              extraDates={Math.max(dates.length - MAX_DATE_ROWS, 0)}
              callsFailed={data.calls.status === 'error'}
              onRetryCalls={() => retry('calls')}
            />
          ) : null}
        </div>
      </div>

      {helpOpen ? <PayHelpSheet onClose={closeHelp} /> : null}
    </>
  );
}
