'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, CircleHelp, Plus, RotateCw, Sun, Timer, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useViewAsReadOnly } from '@/contexts/ViewAsContext';
import { isDualRoleUser, isSolarOnlyUser } from '@/types';
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
import { SOLAR_DECK_HREF, SolarEntryCard } from './SolarEntryCard';
import { SolarHomeNextConsult } from '@/components/portal/solar/SolarMyLeads';
import { useSolarWeek, type SolarWeekState } from '@/components/portal/solar/useSolarWeek';
import type { SolarWeekCounts } from '@/components/portal/solar/solarClient';
import { InstallDateSheet } from './InstallDateSheet';
import { ScanIntroCard } from './ScanIntroCard';
import { LOG_SALE_HREF } from './repNav';
import s from './rep.module.css';
import d from './rep-dashboard.module.css';
import { cacheTimeLabel } from '@/lib/cache/dataCache';
import { estimateDollars, formatEstimate } from '@/lib/pay/estimate';

// ---------------------------------------------------------------- format

// Est. pay only: rounded down once (lib/pay/estimate).
const money = (n: number) => formatEstimate(n);

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
  const shown = useCountUp(Math.abs(estimateDollars(amount)), { sessionKey: '3c:countup:home-pay' });
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
  const amount = money(total);
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
        <Link href="/portal/leaderboard" className={`${d.surface} ${d.chase} tap-press`}>
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

// ---------------------------------------------------------------- solar

const SOLAR_WEEK_CELLS: { key: keyof SolarWeekCounts; label: string; noun: string }[] = [
  { key: 'set', label: 'Set', noun: 'appointments set' },
  { key: 'demoed', label: 'Demoed', noun: 'demoed' },
  { key: 'closed', label: 'Closed', noun: 'closed' },
];

/**
 * Solar this week: Set | Demoed | Closed, the numbers the solar board counts
 * (its "Your week" card). A dual rep's version sits under pay as "Solar", with
 * the next consultation (`next`) and Open deck; a solar-only rep's is "This
 * week" under the deck, which already carries both.
 */
export function SolarWeekSection({
  variant,
  state,
  timeLeft,
  onRetry,
  next,
}: {
  variant: 'dual' | 'solarOnly';
  state: SolarWeekState;
  timeLeft: string;
  onRetry: () => void;
  next?: ReactNode;
}) {
  const dual = variant === 'dual';
  const id = dual ? 'solar-week-h' : 'week-h';
  return (
    <section
      className={d.card}
      style={rise(dual ? 2 : 1)}
      aria-labelledby={id}
      aria-busy={state.status === 'loading' || undefined}
      data-part="solar-week"
    >
      <SectionHead id={id} title={dual ? 'Solar' : 'This week'}>
        <span className={d.clock}>
          <Timer size={17} aria-hidden="true" />
          {timeLeft}
        </span>
      </SectionHead>

      {/* One field, not a box per number: the week's three counts side by
          side, Set (the first step) in the accent, each over a track filled
          to its share of the week's largest count. */}
      <div className={`${d.surface} ${d.solarField}`}>
        {state.status === 'error' ? (
          <Failed what="your solar numbers" onRetry={onRetry} className={d.cellFailed} />
        ) : (
          <SolarFunnel state={state} />
        )}

        {dual ? (
          <div className={d.solarMore}>
            {next}
            <Link href={SOLAR_DECK_HREF} className={`${s.btnSecondary} ${d.solarDeck}`}>
              <Sun size={18} aria-hidden="true" />
              Open deck
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Set, Demoed, Closed as columns: the count, a track filled to its share of
 * the week's largest count, the word under it. The tracks only restate the
 * numbers, so they are hidden from screen readers.
 */
function SolarFunnel({ state }: { state: Exclude<SolarWeekState, { status: 'error' }> }) {
  const data = state.status === 'ready' ? state.data : null;
  const top = data ? Math.max(data.set, data.demoed, data.closed) : 0;
  return (
    <div className={`${d.funnel} ${data && top === 0 ? d.funnelEmpty : ''}`}>
      {SOLAR_WEEK_CELLS.map((cell) => (
        <div key={cell.key} className={d.funnelCol}>
          {data ? (
            <p className={d.funnelNum} aria-label={`${data[cell.key]} ${cell.noun} this week`}>
              {data[cell.key]}
            </p>
          ) : (
            <span className={`${s.skel} ${d.skelStat}`} aria-label={`Loading ${cell.noun}`} />
          )}
          <span className={d.funnelTrack} aria-hidden="true">
            <span
              className={d.funnelFill}
              style={{ transform: `scaleX(${data && top > 0 ? (data[cell.key] / top).toFixed(4) : 0})` }}
            />
          </span>
          <p className={d.funnelLabel} aria-hidden={data ? true : undefined}>
            {cell.label}
          </p>
        </div>
      ))}
    </div>
  );
}

/** The live section: one read for all three numbers. */
function SolarWeekSlot({ variant, timeLeft }: { variant: 'dual' | 'solarOnly'; timeLeft: string }) {
  const { state, retry } = useSolarWeek();
  return (
    <SolarWeekSection
      variant={variant}
      state={state}
      timeLeft={timeLeft}
      onRetry={retry}
      next={
        variant === 'dual' ? (
          <SolarHomeNextConsult
            pending={<span className={`${s.skel} ${d.skelNext}`} aria-label="Loading your next consultation" />}
            empty={<p className={d.solarQuiet}>No consultation booked yet.</p>}
          />
        ) : null
      }
    />
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
                className={`${d.surface} ${d.tRow} ${d.tRowBtn} tap-press`}
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
              className={`${d.surface} ${d.tRow} tap-press`}
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
              className={`${d.surface} ${d.sale} ${row.status === 'cancelled' ? d.saleOff : ''} tap-press`}
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
  /** The way into Solar (SolarEntryCard): a row beside Ask for a dual rep, the lead block for a solar-only rep. */
  solarEntry?: ReactNode;
  /** A solar-only rep's next consultation (SolarHomeNextConsult), under the deck; renders nothing when none is ahead. */
  solarNext?: ReactNode;
  /** Solar this week (SolarWeekSection): under pay for a dual rep, under the deck for a solar-only rep. */
  solarWeek?: ReactNode;
  /**
   * A solar-only rep (a solar role, no fiber role): Home leads with Solar and
   * drops every fiber part (pay, the week, recent sales). The fiber props are
   * then ignored.
   */
  solarOnly?: boolean;
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
  if (p.solarOnly) return <SolarHomeView {...p} />;
  const payout = p.pay?.payout ?? null;

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

          {/* A dual rep's solar section directly under pay, then Ask 3C: on a
              phone still near the first screen, where a rep stuck at a door
              sees it. Anyone else with solar:read keeps the Solar row. */}
          {p.solarWeek}
          {p.askEntry}
          {p.solarEntry}

          <WeekStrip
            standing={p.standing}
            challenge={p.challenge}
            timeLeft={p.timeLeft}
            onRetryStanding={() => p.onRetry('standing')}
            onRetryChallenge={() => p.onRetry('challenge')}
          />
        </div>

        <div className={d.colSide}>
          <TodaySlot {...p} />

          {p.scanIntro ? <div className={d.scanSlot}>{p.scanIntro}</div> : null}

          {p.payStatus === 'ready' && p.rows.length > 0 ? <RecentSales rows={p.rows} report={p.carrierReport} /> : null}
        </div>
      </div>
    </>
  );
}

function TodaySlot(p: RepHomeViewProps) {
  const showToday = p.todayItems.length > 0 || p.callsFailed;
  if (p.todayLoading && p.todayItems.length === 0) {
    return <SkeletonPanel label="Loading today" rows={2} className={d.today} />;
  }
  return showToday ? (
    <TodayPanel
      items={p.todayItems}
      extraDates={p.extraDates}
      callsFailed={p.callsFailed}
      onRetryCalls={() => p.onRetry('calls')}
      onSetDate={p.onSetDate}
    />
  ) : null;
}

/**
 * A solar-only rep's Home: the deck leads (where pay sits for a fiber rep)
 * with the next consultation as its foot; this week, Ask 3C and Today (calls,
 * open paperwork) follow, beside it on desktop. No pay, fiber week or
 * sales: those are the fiber book, which this rep does not have.
 */
function SolarHomeView(p: RepHomeViewProps) {
  return (
    <>
      <h1 className={s.srOnly}>{p.firstName === 'Your' ? 'Your dashboard' : `${p.firstName}'s dashboard`}</h1>

      <div className={d.grid}>
        {p.banners ? <div className={d.banners}>{p.banners}</div> : null}
        {p.queues ? <div className={d.queues}>{p.queues}</div> : null}

        <div className={d.colMain}>
          {p.solarEntry}
          {/* Close under the deck (one Solar group); empty when none is ahead. */}
          {p.solarNext ? <div className={d.solarNext}>{p.solarNext}</div> : null}
        </div>

        {/* Phone: straight on under the deck (the columns are display:
            contents). Desktop: the week heads the side column beside the deck. */}
        <div className={d.colSide}>
          {p.solarWeek}
          {p.askEntry}
          <TodaySlot {...p} />
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
  // A solar rep with no fiber role (and no platform role): Home is about
  // solar, and the fiber sections are neither fetched nor shown.
  const solarOnly = isSolarOnlyUser(user);
  // A fiber rep who also sells solar: a solar section under pay, not the Solar row.
  const dual = !readOnly && isDualRoleUser(user) && hasPermission('solar:read');
  const data = useRepDashboard({ fiber: !solarOnly });
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
  const updatingFrom = data.updatingFrom ?? null;

  // 3C iOS app only (both no-ops on the web): drop the splash once the money
  // block has its numbers, and feed the home-screen widget the same Est. pay
  // and rank shown here. Never while the owner views as this rep.
  useAppReady(solarOnly ? data.calls.status !== 'loading' : payStatus !== 'loading');
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
        todayLoading={data.calls.status === 'loading' || (!solarOnly && data.book.status === 'loading')}
        extraDates={Math.max(dates.length - MAX_DATE_ROWS, 0)}
        callsFailed={data.calls.status === 'error'}
        banners={
          data.staleAt !== null || updatingFrom !== null || canLog ? (
            <>
              {/* A background refresh failed: the numbers shown are the last good ones. */}
              {data.staleAt !== null ? (
                <p className={d.staleNote} role="status">
                  Couldn&apos;t refresh · as of {cacheTimeLabel(data.staleAt)}
                </p>
              ) : updatingFrom !== null ? (
                /* Cold open: the last numbers from this device, refreshing underneath. */
                <p className={d.staleNote} role="status">
                  Updating · as of {cacheTimeLabel(updatingFrom)}
                </p>
              ) : null}
              {canLog ? <CalloutNudge now={now} /> : null}
            </>
          ) : null
        }
        scanIntro={canLog ? <ScanIntroCard now={now} /> : null}
        askEntry={readOnly ? null : <AskEntryCard />}
        solarOnly={solarOnly}
        // Solar-only: the lead block even while viewing as the rep (Open deck,
        // a write, drops out on its own). Otherwise the row, never in view-as.
        solarEntry={solarOnly ? <SolarEntryCard variant="lead" /> : readOnly || dual ? null : <SolarEntryCard />}
        // The viewer's own leads, so never in view-as (they would be the owner's).
        solarNext={solarOnly && !readOnly ? <SolarHomeNextConsult /> : null}
        // The viewer's own numbers, so never in view-as.
        solarWeek={
          readOnly ? null : solarOnly ? (
            <SolarWeekSlot variant="solarOnly" timeLeft={weekTimeLeft(now)} />
          ) : dual ? (
            <SolarWeekSlot variant="dual" timeLeft={weekTimeLeft(now)} />
          ) : null
        }
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
