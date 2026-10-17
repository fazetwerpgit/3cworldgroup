'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, CircleHelp, Plus, RotateCw, Timer, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAsReadOnly } from '@/contexts/ViewAsContext';
import { OpsQueuesPanel } from '@/components/portal/admin-d/OpsQueuesPanel';
import { useCountUp } from '@/hooks/useCountUp';
import { useRepDashboard, type RepChallenge, type RepSectionKey, type Section } from '@/hooks/useRepDashboard';
import {
  callsToday,
  CHARGEBACK_STATUS_LABEL,
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
import { buildWidgetData, useAppReady, useNativeWidgetData, useUidHash } from '@/lib/app/shellExtras';
import { AWAITING_CARRIER_LABEL, isInstallToday } from '@/lib/sales/installBucket';
import { CarrierNotice } from './CarrierNotice';
import { CarrierStaleNote } from './CarrierStaleNote';
import { CalloutNudge } from './CalloutNudge';
import type { CarrierReportStamp } from '@/lib/fiberReport/reportFreshness';
import { PayHelpSheet } from './PayHelpSheet';
import { AskEntryCard } from './AskEntryCard';
import { InstallDateSheet } from './InstallDateSheet';
import { ScanIntroCard } from './ScanIntroCard';
import { LOG_SALE_HREF } from './repNav';
import s from './rep.module.css';
import d from './rep-dashboard.module.css';
import { cacheTimeLabel } from '@/lib/cache/dataCache';

// ---------------------------------------------------------------- format

const money = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;

function ordinalSuffix(n: number) {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
}

const SHORT_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });
const shortDate = (date: Date | null) => (date ? SHORT_DATE.format(date) : '');

const STATUS_CLASS: Record<RowStatus, string> = {
  installed: d.st_installed,
  scheduled: d.st_scheduled,
  'needs-date': d.st_needsdate,
  missed: d.st_missed,
  cancelled: d.st_cancelled,
  chargeback: d.st_cancelled,
};

function statusLine(row: RecentSaleRow) {
  switch (row.status) {
    case 'installed':
      return row.installDate ? `Installed ${shortDate(row.installDate)}` : 'Installed';
    case 'scheduled':
      if (row.awaitingCarrier) return AWAITING_CARRIER_LABEL;
      if (!row.installDate) return 'Scheduled';
      return isInstallToday(row.installDate) ? 'Installs today' : `Installs ${shortDate(row.installDate)}`;
    case 'needs-date':
      return 'Needs install date';
    case 'missed':
      return row.overdue ? 'Install overdue · reschedule' : 'Missed install · reschedule';
    case 'cancelled':
      return 'Cancelled';
    case 'chargeback':
      return CHARGEBACK_STATUS_LABEL;
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
  if (row.status === 'chargeback') return 'Est. pay charged back';
  if (row.payoutLabel) return `Est. payout ${row.payoutLabel}`;
  if (row.status === 'cancelled') return 'No pay';
  if (row.status === 'installed') return '';
  if (row.status === 'missed') return 'After reschedule';
  return 'After install';
}

/** Rise-in order for the cards (CSS reads --i). */
const rise = (i: number) => ({ '--i': i }) as CSSProperties;

// ---------------------------------------------------------------- shared bits

function Failed({ what, onRetry, className = '' }: { what: string; onRetry: () => void; className?: string }) {
  return (
    <div className={`${s.failed} ${className}`} role="alert">
      <span>Couldn&apos;t load {what}</span>
      <button type="button" className={s.retry} onClick={onRetry}>
        <RotateCw size={14} aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

function SectionHead({ id, title, children }: { id: string; title: string; children?: ReactNode }) {
  return (
    <div className={d.sectionHead}>
      <h2 id={id} className={d.sectionTitle}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function SkeletonPanel({ label, rows = 2, className = '' }: { label: string; rows?: number; className?: string }) {
  return (
    <section className={`${d.surface} ${d.card} ${className}`} aria-busy="true" aria-label={label}>
      <div className={d.skelBody}>
        <span className={`${s.skel} ${d.skelLine}`} />
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className={`${s.skel} ${d.skelRow}`} />
        ))}
      </div>
    </section>
  );
}

/** Carrier wordmark: text in a quiet filled chip until real monochrome logo files exist. */
export function CarrierMark({ name }: { name: string }) {
  return name ? <span className={d.carrier}>{name}</span> : null;
}

// ---------------------------------------------------------------- money

const BUCKETS = [
  { key: 'installed', seg: d.seg_installed, tone: d.st_installed, label: 'installed' },
  { key: 'scheduled', seg: d.seg_scheduled, tone: d.st_scheduled, label: 'scheduled' },
  { key: 'attention', seg: d.seg_needs, tone: d.st_needsdate, label: 'need a date' },
] as const;

/** One segment per sale up to 10; above that each bucket is one proportional segment. */
function MonthStack({ counts, total }: { counts: PaySummary['counts']; total: number }) {
  let n = 0;
  return (
    <div className={d.stack} aria-hidden="true">
      {BUCKETS.flatMap((bucket) => {
        const count = counts[bucket.key];
        if (!count) return [];
        if (total > 10) return [<span key={bucket.key} className={bucket.seg} style={{ flex: count, ...rise(n++) }} />];
        return Array.from({ length: count }, (_, i) => (
          <span key={`${bucket.key}-${i}`} className={bucket.seg} style={rise(n++)} />
        ));
      })}
    </div>
  );
}

/** The big est. pay numeral: counts up from $0 on the first Home of a session. */
function PayAmount({ amount }: { amount: number }) {
  // A month whose chargebacks outweigh its installs reads "−$280", never "$-280".
  const shown = useCountUp(Math.round(Math.abs(amount)), { sessionKey: '3c:countup:home-pay' });
  return (
    <>
      {amount < 0 ? '−' : null}
      <span className={d.cur}>$</span>
      {shown.toLocaleString('en-US')}
    </>
  );
}

/** "Includes est. −$280 chargeback · Rosaria M. cancelled within 120 days of install". */
export function chargebackNote(lines: PaySummary['chargebacks']): string {
  const total = lines.reduce((sum, line) => sum + (line.amount ?? 0), 0);
  const amount = `−${money(Math.abs(total))}`;
  if (lines.length === 1) {
    return `Includes est. ${amount} chargeback · ${lines[0].customer} cancelled within 120 days of install`;
  }
  return `Includes est. ${amount} in chargebacks · ${lines.length} customers cancelled within 120 days of install`;
}

function MoneyCard({ pay, hasPlan }: { pay: PaySummary; hasPlan: boolean }) {
  const delta = pay.deltaPct;
  const amount = hasPlan && pay.estThisMonth !== null ? pay.estThisMonth : null;

  return (
    <section className={d.money} aria-labelledby="money-h">
      <p className={d.payNum}>{amount !== null ? <PayAmount amount={amount} /> : '—'}</p>
      {/* The label sits under the figure as a sentence, with the change against last month. */}
      <h2 id="money-h" className={d.payLine}>
        <strong>Estimated pay this month</strong>
        {hasPlan && delta !== null ? (
          <>
            , <b className={delta < 0 ? d.deltaDown : d.deltaUp}>{delta < 0 ? 'down' : 'up'} {Math.abs(delta)}%</b> on last
            month
          </>
        ) : null}
      </h2>
      {!hasPlan ? <p className={d.moneyNote}>No pay plan assigned yet</p> : null}
      {/* Money on sales with nothing on the calendar yet: it has no month. */}
      {hasPlan && pay.estNoDate ? <p className={d.moneyNote}>est. {money(pay.estNoDate)} has no install date yet</p> : null}
      {/* Est. chargebacks landing this month, already netted into the figure above. */}
      {hasPlan && pay.chargebacks.length ? <p className={d.moneyNote}>{chargebackNote(pay.chargebacks)}</p> : null}
      {/* Missed installs: their date is stale, so their money waits on a new one. */}
      {hasPlan && pay.estMissed ? <p className={d.moneyNote}>est. {money(pay.estMissed)} needs a new install date</p> : null}

      <div className={d.month}>
        {pay.monthCount > 0 ? (
          <>
            <MonthStack counts={pay.counts} total={pay.monthCount} />
            <div className={d.monthLine}>
              <span>
                {pay.monthCount} {pay.monthCount === 1 ? 'sale' : 'sales'} this month:
              </span>{' '}
              <ul className={d.legend}>
                {BUCKETS.filter((bucket) => pay.counts[bucket.key] > 0).map((bucket) => (
                  <li key={bucket.key} className={bucket.tone}>
                    {pay.counts[bucket.key]} {bucket.label}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className={d.periodEmpty}>Nothing logged this month yet.</p>
        )}
      </div>
    </section>
  );
}

/** The next T-Fiber payout window, tucked under the money card one step down the ladder. */
function PayoutCard({ payout }: { payout: NonNullable<PaySummary['payout']> }) {
  return (
    <div className={d.payout}>
      <span className={d.payoutWhen}>Next payout, est. {formatPayoutWindow(payout.window)}</span>
      {payout.amount !== null ? (
        <span className={d.payoutAmt}>
          <small className={d.est}>est.</small>
          {money(payout.amount)}
        </span>
      ) : null}
      <span className={d.payoutMeta}>
        <CarrierMark name="T-Fiber" />
        <span>
          {payout.count} {payout.count === 1 ? 'sale' : 'sales'}
          {payout.scheduled > 0 ? `, ${payout.scheduled} still scheduled` : ''}
        </span>
      </span>
    </div>
  );
}

export function PayHelpButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  return (
    <button type="button" className={`${d.payHelp} ${className}`} onClick={onClick} aria-haspopup="dialog">
      <CircleHelp size={16} aria-hidden="true" />
      How pay works
    </button>
  );
}

function MoneySkeleton() {
  return (
    <section className={d.money} aria-busy="true" aria-label="Loading your pay">
      <span className={`${s.skel} ${d.skelScore}`} />
      <p className={d.payLine}>
        <strong>Estimated pay this month</strong>
      </p>
      <div className={d.month}>
        <span className={`${s.skel} ${d.skelBar}`} />
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- this week (rank | challenge)

export function standLine(standing: Standing): ReactNode {
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
  // The rep above wasn't in the fetched board: only #1 is top of it.
  return standing.rank === 1 ? <>Top of the board this week</> : <>Keep climbing</>;
}

/** One segment per sale of the target up to 10; a plain track above that. */
function ChallengeSegs({ target, done }: { target: number; done: number }) {
  if (target > 10) {
    const pct = Math.min(Math.round((done / target) * 100), 100);
    return (
      <div className={d.chTrack} aria-hidden="true">
        <span className={d.grow} style={{ width: `${pct}%` }} />
      </div>
    );
  }
  return (
    <div className={`${d.stack} ${d.chSegs}`} aria-hidden="true">
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={i < done ? d.seg_installed : ''} style={rise(i)} />
      ))}
    </div>
  );
}

function WeekStrip({
  standing,
  challenge,
  timeLeft,
  onRetryStanding,
  onRetryChallenge,
}: {
  standing: Section<Standing | null>;
  challenge: Section<RepChallenge>;
  timeLeft: string;
  onRetryStanding: () => void;
  onRetryChallenge: () => void;
}) {
  // Unranked reps (no sales on the board) and weeks with no challenge simply lose that half.
  const showRank = standing.status !== 'ready' || standing.data !== null;
  const showChallenge = challenge.status !== 'ready' || challenge.data.target > 0;
  if (!showRank && !showChallenge) return null;
  const rank = standing.status === 'ready' ? standing.data : null;
  const ch = challenge.status === 'ready' ? challenge.data : null;
  const toGo = ch ? Math.max(ch.target - ch.done, 0) : 0;
  const ahead = rank?.ahead ?? null;
  const gapPct = rank && ahead && ahead.points > 0 ? Math.min(Math.round((rank.points / ahead.points) * 100), 100) : null;

  return (
    <section className={`${d.card} ${d.week}`} style={rise(2)} aria-labelledby="week-h">
      <SectionHead id="week-h" title="This week">
        <span className={d.clock}>
          <Timer size={17} aria-hidden="true" />
          {timeLeft}
        </span>
      </SectionHead>

      <div className={`${d.halves} ${showRank && showChallenge ? '' : d.halvesSolo}`}>
        {showRank ? (
          <div className={`${d.surface} ${d.half}`}>
            {standing.status === 'loading' ? (
              <span className={`${s.skel} ${d.skelBig}`} aria-label="Loading rank" />
            ) : standing.status === 'error' ? (
              <Failed what="rank" onRetry={onRetryStanding} className={d.cellFailed} />
            ) : rank ? (
              <>
                <p className={d.big} aria-label={`${rank.rank}${ordinalSuffix(rank.rank)} of ${rank.of}`}>
                  {rank.rank}
                  <sup>{ordinalSuffix(rank.rank)}</sup>
                </p>
                <p className={d.cap}>
                  Of {rank.of}
                  {rank.movement ? (
                    <>
                      ,{' '}
                      <b className={rank.movement < 0 ? d.capDown : d.win}>
                        {rank.movement > 0 ? 'up' : 'down'} {Math.abs(rank.movement)} today
                      </b>
                    </>
                  ) : null}
                  . <b>{rank.points.toLocaleString('en-US')} pts</b>
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        {showChallenge ? (
          <div className={`${d.surface} ${d.half}`}>
            {challenge.status === 'loading' ? (
              <span className={`${s.skel} ${d.skelBig}`} aria-label="Loading weekly challenge" />
            ) : challenge.status === 'error' ? (
              <Failed what="the challenge" onRetry={onRetryChallenge} className={d.cellFailed} />
            ) : ch ? (
              <>
                <p className={d.big} aria-label={`${ch.done} of ${ch.target} sales`}>
                  {ch.done}
                  <span>/{ch.target}</span>
                </p>
                <ChallengeSegs target={ch.target} done={ch.done} />
                <p className={d.cap}>
                  {toGo > 0 ? (
                    <>
                      Challenge. <b className={d.win}>{toGo} more</b> by Saturday.
                    </>
                  ) : (
                    <>
                      Challenge <b className={d.win}>done.</b>
                    </>
                  )}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {rank ? (
        <Link href="/portal/leaderboard" className={`${d.surface} ${d.chase}`}>
          <span className={d.chaseText}>{standLine(rank)}</span>
          <span className={d.chaseLink}>
            <span className={d.chaseWord}>Leaderboard</span>
            <ChevronRight size={20} aria-hidden="true" />
          </span>
          {gapPct !== null ? (
            <span className={d.chaseTrack} aria-hidden="true">
              <span className={d.grow} style={{ width: `${gapPct}%` }} />
            </span>
          ) : null}
        </Link>
      ) : null}
    </section>
  );
}

// ---------------------------------------------------------------- today

export type TodayItem =
  | { kind: 'call'; call: DashboardCall }
  | { kind: 'date'; row: NeedsDateRow }
  | { kind: 'queue'; key: string; title: string; sub: string; href: string };

const MAX_DATE_ROWS = 3;

function TodayPanel({
  items,
  extraDates,
  callsFailed,
  onRetryCalls,
  onSetDate,
}: {
  items: TodayItem[];
  extraDates: number;
  callsFailed: boolean;
  onRetryCalls: () => void;
  /** Opens the install-date sheet: the rep's own sale, never the admin edit page. Absent = read only. */
  onSetDate?: (row: NeedsDateRow) => void;
}) {
  return (
    <section className={`${d.card} ${d.today}`} style={rise(3)} aria-labelledby="today-h">
      <SectionHead id="today-h" title="Today" />
      <div className={d.list}>
        {items.map((item) => {
          if (item.kind === 'date') {
            const { row } = item;
            const verb = row.missed ? 'Reschedule' : 'Add date';
            const when = row.missed
              ? row.missedDayLabel
              : row.soldDate
                ? `Sold ${shortDate(row.soldDate)}`
                : null;
            const body = (
              <span className={d.tText}>
                <span className={`${d.tWhat} ${row.missed ? d.st_missed : d.st_needsdate}`}>
                  {row.overdue ? 'Install overdue' : row.missed ? 'Missed install' : 'Needs an install date'}
                </span>
                <span className={d.tTitle}>{row.customer}</span>
                <span className={d.tSub}>{[when, row.plan].filter(Boolean).join(' · ')}</span>
                {row.missedReason ? <span className={d.tNote}>{row.missedReason}</span> : null}
              </span>
            );
            // Read only (the owner viewing as the rep): the row, not the action.
            if (!onSetDate) {
              return (
                <div key={`date-${row.id}`} className={`${d.surface} ${d.tRow}`} data-part="date-row">
                  {body}
                </div>
              );
            }
            return (
              <button
                key={`date-${row.id}`}
                type="button"
                className={`${d.surface} ${d.tRow} ${d.tRowBtn}`}
                onClick={() => onSetDate(row)}
              >
                {body}
                <span className={d.tAct}>{verb}</span>
              </button>
            );
          }
          const external = item.kind === 'call' && !!item.call.meetLink;
          const href = item.kind === 'call' ? item.call.meetLink || '/portal/calls' : item.href;
          return (
            <Link
              key={item.kind === 'call' ? `call-${item.call.id}` : item.key}
              href={href}
              className={`${d.surface} ${d.tRow}`}
              {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {item.kind === 'call' ? (
                <>
                  <span className={d.tText}>
                    <span className={d.tWhat}>{formatCallTime(item.call.time)}</span>
                    <span className={d.tTitle}>{item.call.title}</span>
                    <span className={d.tSub}>{item.call.meetLink ? 'Video call' : 'Call'}</span>
                  </span>
                  <span className={d.tAct}>
                    {item.call.meetLink ? (
                      <>
                        <Video size={18} aria-hidden="true" />
                        Join
                      </>
                    ) : (
                      'Open'
                    )}
                  </span>
                </>
              ) : (
                <>
                  <span className={d.tText}>
                    <span className={d.tTitle}>{item.title}</span>
                    <span className={d.tSub}>{item.sub}</span>
                  </span>
                  <span className={d.tAct}>Open</span>
                </>
              )}
            </Link>
          );
        })}
      </div>
      {extraDates > 0 ? (
        <Link href="/portal/sales" className={d.quietLink}>
          {extraDates} more {extraDates === 1 ? 'sale needs' : 'sales need'} a date
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      ) : null}
      {callsFailed ? <Failed what="today's calls" onRetry={onRetryCalls} className={d.sectionFailed} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- recent sales

function RecentSales({ rows, report }: { rows: RecentSaleRow[]; report?: CarrierReportStamp | null }) {
  return (
    <section className={`${d.card} ${d.sales}`} style={rise(4)} aria-labelledby="sales-h">
      <SectionHead id="sales-h" title="Recent sales">
        <Link href="/portal/sales" className={d.quietLink}>
          See all
          <ChevronRight size={18} aria-hidden="true" />
        </Link>
      </SectionHead>
      {/* Only when the carrier's daily report is late; nothing otherwise. */}
      <CarrierStaleNote report={report} className={d.staleNote} />
      <ul className={d.saleList}>
        {rows.map((row) => (
          <li key={row.id}>
            <Link
              href={`/portal/sales/${row.id}`}
              className={`${d.surface} ${d.sale} ${row.status === 'cancelled' ? d.saleOff : ''}`}
            >
              <span className={d.saleName}>{row.customer}</span>
              <span className={d.saleAmt}>{payCell(row)}</span>
              <span className={`${d.status} ${STATUS_CLASS[row.status]}`}>{statusLine(row)}</span>
              <span className={d.saleWhen}>{payoutLine(row)}</span>
              <span className={d.saleMeta}>
                <CarrierMark name={row.carrier} />
                <span className={d.saleMetaText}>
                  {[row.carrier ? row.planShort : row.plan, row.address].filter(Boolean).join(' · ')}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- view

export interface RepHomeViewProps {
  firstName: string;
  /** Quiet prompts above everything: sales called out today but not logged (CalloutNudge). */
  banners?: ReactNode;
  /** 'ready' with pay null means the book is empty or not loaded yet. */
  payStatus: 'loading' | 'error' | 'ready';
  pay: PaySummary | null;
  hasPlan: boolean;
  zeroSales: boolean;
  canLog: boolean;
  carrierFailed: boolean;
  /** The rep's carrier report stamp; a late report gets one quiet line on Recent sales. */
  carrierReport?: CarrierReportStamp | null;
  standing: Section<Standing | null>;
  challenge: Section<RepChallenge>;
  timeLeft: string;
  rows: RecentSaleRow[];
  todayItems: TodayItem[];
  todayLoading: boolean;
  extraDates: number;
  callsFailed: boolean;
  /** The one-time screenshot-reader card (reads browser storage, so it is passed in). */
  scanIntro?: ReactNode;
  /** Ask 3C's compact entry (hidden while the feature is off). */
  askEntry?: ReactNode;
  /** Admin and operations: Needs attention (onboarding work), above everything else. */
  queues?: ReactNode;
  onHelp: () => void;
  onRetry: (key: RepSectionKey | 'pay') => void;
  /** Absent while read only (the owner viewing as the rep). */
  onSetDate?: (row: NeedsDateRow) => void;
}

/**
 * Home after the taste pass: the money block on top (one raised surface with
 * the payout window inside it), the week below it, then Today and recent
 * sales. Flat tone steps, Bebas section headings, no kickers or rules.
 * Desktop: money + week in the main column, Today and recent sales beside.
 */
export function RepHomeView(p: RepHomeViewProps) {
  const payout = p.pay?.payout ?? null;
  const showToday = p.todayItems.length > 0 || p.callsFailed;

  return (
    <>
      <h1 className={s.srOnly}>{p.firstName === 'Your' ? 'Your dashboard' : `${p.firstName}'s dashboard`}</h1>

      <div className={d.grid}>
        {p.banners ? <div className={d.banners}>{p.banners}</div> : null}
        {p.queues ? <div className={d.queues}>{p.queues}</div> : null}

        <div className={d.colMain}>
          {p.carrierFailed && p.pay ? (
            <CarrierNotice onRetry={() => p.onRetry('book')} className={d.carrierNote} />
          ) : null}

          <div className={d.moneyBlock} style={rise(1)}>
            {p.payStatus === 'loading' ? (
              <MoneySkeleton />
            ) : p.payStatus === 'error' ? (
              <section className={d.money} aria-label="Est. pay this month">
                <p className={d.payLine}>
                  <strong>Estimated pay this month</strong>
                </p>
                <Failed what="your pay" onRetry={() => p.onRetry('pay')} className={d.cellFailed} />
              </section>
            ) : p.zeroSales ? (
              <section className={`${d.money} ${d.welcome}`} aria-labelledby="welcome-h">
                <h2 id="welcome-h" className={d.welcomeTitle}>
                  No sales yet.
                </h2>
                {p.canLog ? (
                  <Link href={LOG_SALE_HREF} className={s.btnPrimary}>
                    <Plus size={20} strokeWidth={2.5} aria-hidden="true" />
                    Log your first sale
                  </Link>
                ) : null}
              </section>
            ) : p.pay ? (
              <>
                <MoneyCard pay={p.pay} hasPlan={p.hasPlan} />
                {payout ? <PayoutCard payout={payout} /> : null}
                <PayHelpButton onClick={p.onHelp} />
              </>
            ) : null}
          </div>

          {/* Ask 3C right under pay: on a phone that is the first screen, where a
              rep stuck at a door sees it without scrolling. */}
          {p.askEntry}

          <WeekStrip
            standing={p.standing}
            challenge={p.challenge}
            timeLeft={p.timeLeft}
            onRetryStanding={() => p.onRetry('standing')}
            onRetryChallenge={() => p.onRetry('challenge')}
          />
        </div>

        <div className={d.colSide}>
          {p.todayLoading && p.todayItems.length === 0 ? (
            <SkeletonPanel label="Loading today" rows={2} className={d.today} />
          ) : showToday ? (
            <TodayPanel
              items={p.todayItems}
              extraDates={p.extraDates}
              callsFailed={p.callsFailed}
              onRetryCalls={() => p.onRetry('calls')}
              onSetDate={p.onSetDate}
            />
          ) : null}

          {p.scanIntro ? <div className={d.scanSlot}>{p.scanIntro}</div> : null}

          {p.payStatus === 'ready' && p.rows.length > 0 ? <RecentSales rows={p.rows} report={p.carrierReport} /> : null}
        </div>
      </div>
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
 * The rep dashboard. Everyone but the owner (rep, manager, admin) sees their
 * OWN numbers here; admin and operations also get Needs attention on top.
 */
export function RepDashboard() {
  const { user, isRole, hasPermission } = useAuth();
  // The owner viewing as this rep: the rep's screen with nothing that writes or
  // belongs to the owner (Ask 3C, queues, the install-date sheet).
  const readOnly = useViewAsReadOnly();
  // Admin and operations get the onboarding work (Needs attention) on top.
  const showQueues = !readOnly && isRole('admin', 'operations');
  const data = useRepDashboard();
  const { retry } = data;
  const [helpOpen, setHelpOpen] = useState(false);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const [dateRow, setDateRow] = useState<NeedsDateRow | null>(null);
  const closeDate = useCallback(() => setDateRow(null), []);
  const now = useNow();

  const book = data.book.status === 'ready' ? data.book.data : null;
  const rates = data.plan.status === 'ready' ? data.plan.data.rates : null;

  const pay = useMemo(
    () => (book && data.plan.status === 'ready' ? summarizePay(book.sales, book.fiberBySale, rates, now, book.reportAsOf) : null),
    [book, data.plan.status, rates, now]
  );
  const rows = useMemo(
    () => (book && data.plan.status === 'ready' ? recentSaleRows(book.sales, book.fiberBySale, rates, now, book.reportAsOf) : []),
    [book, data.plan.status, rates, now]
  );
  const dates = useMemo(() => (book ? needsDateRows(book.sales, book.fiberBySale, now, book.reportAsOf) : []), [book, now]);
  const dateSale = dateRow ? book?.sales.find((sale) => sale.id === dateRow.id) ?? null : null;

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
  if (data.paperwork.status === 'ready' && data.paperwork.data > 0) {
    const left = data.paperwork.data;
    todayItems.push({
      kind: 'queue',
      key: 'paperwork',
      title: `Sign ${left} onboarding ${left === 1 ? 'document' : 'documents'}`,
      sub: 'Still open from onboarding',
      href: '/portal/onboarding',
    });
  }

  const payStatus =
    data.book.status === 'loading' || data.plan.status === 'loading'
      ? 'loading'
      : data.book.status === 'error' || data.plan.status === 'error'
        ? 'error'
        : 'ready';
  const canLog = hasPermission('sales:write');

  // 3C iOS app only (both no-ops on the web): drop the splash once the money
  // block has its numbers, and feed the home-screen widget the same Est. pay
  // and rank shown here. Never while the owner views as this rep.
  useAppReady(payStatus !== 'loading');
  const widgetRank = standing.status === 'ready' && standing.data ? standing.data.rank : null;
  const widgetRankOf = standing.status === 'ready' && standing.data ? standing.data.of : null;
  const widgetSettled = payStatus === 'ready' && pay !== null && standing.status !== 'loading';
  const uidHash = useUidHash(readOnly ? null : user?.uid);
  const widget = useMemo(
    () =>
      !readOnly && widgetSettled && pay && uidHash
        ? buildWidgetData({
            uidHash,
            estThisMonth: pay.estThisMonth,
            hasPlan: rates !== null,
            monthCount: pay.monthCount,
            standing: widgetRank !== null && widgetRankOf !== null ? { rank: widgetRank, of: widgetRankOf } : null,
            now,
          })
        : null,
    [readOnly, widgetSettled, pay, uidHash, rates, widgetRank, widgetRankOf, now]
  );
  useNativeWidgetData(widget);

  const onRetry = (key: RepSectionKey | 'pay') => {
    const keys: RepSectionKey[] =
      key === 'pay' ? (['book', 'plan'] as const).filter((k) => data[k].status === 'error') : [key];
    for (const k of keys) retry(k);
  };

  return (
    <>
      <RepHomeView
        firstName={user?.displayName?.split(' ')[0] || 'Your'}
        payStatus={payStatus}
        pay={pay}
        hasPlan={rates !== null}
        zeroSales={book !== null && book.sales.length === 0}
        canLog={canLog}
        carrierFailed={!!book?.carrierFailed}
        carrierReport={book?.report ?? null}
        standing={standing}
        challenge={data.challenge}
        timeLeft={weekTimeLeft(now)}
        rows={rows}
        todayItems={todayItems}
        todayLoading={data.calls.status === 'loading' || data.book.status === 'loading'}
        extraDates={Math.max(dates.length - MAX_DATE_ROWS, 0)}
        callsFailed={data.calls.status === 'error'}
        banners={
          data.staleAt !== null || canLog ? (
            <>
              {/* A background refresh failed: the numbers shown are the last good ones. */}
              {data.staleAt !== null ? (
                <p className={d.staleNote} role="status">
                  Couldn&apos;t refresh · as of {cacheTimeLabel(data.staleAt)}
                </p>
              ) : null}
              {canLog ? <CalloutNudge now={now} /> : null}
            </>
          ) : null
        }
        scanIntro={canLog ? <ScanIntroCard now={now} /> : null}
        askEntry={readOnly ? null : <AskEntryCard />}
        queues={showQueues ? <OpsQueuesPanel title="Needs attention" /> : null}
        onHelp={() => setHelpOpen(true)}
        onRetry={onRetry}
        onSetDate={readOnly ? undefined : setDateRow}
      />

      {helpOpen ? <PayHelpSheet onClose={closeHelp} /> : null}
      {dateSale && dateRow && !readOnly ? (
        <InstallDateSheet
          sale={dateSale}
          plan={dateRow.plan}
          missed={dateRow.missed}
          missedDay={dateRow.missedDay}
          onClose={closeDate}
          onSaved={data.installDateSaved}
        />
      ) : null}
    </>
  );
}
