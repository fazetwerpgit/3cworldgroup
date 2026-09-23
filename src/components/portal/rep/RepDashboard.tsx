'use client';

import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, CircleHelp, Plus, RotateCw, Timer, TrendingDown, TrendingUp, Video } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { useCountUp } from '@/hooks/useCountUp';
import { useRepDashboard, type RepChallenge, type RepSectionKey, type Section } from '@/hooks/useRepDashboard';
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
import { CarrierNotice } from './CarrierNotice';
import { PayHelpSheet } from './PayHelpSheet';
import { InstallDateSheet } from './InstallDateSheet';
import { ScanIntroCard } from './ScanIntroCard';
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

/** Rise-in order for the cards (CSS reads --i). */
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
    <div className={`${s.panelHead} ${d.head}`}>
      <h2 id={id} className={s.kicker}>
        {title}
      </h2>
      {children}
    </div>
  );
}

function SkeletonPanel({ label, rows = 2, className = '' }: { label: string; rows?: number; className?: string }) {
  return (
    <section className={`${s.panel} ${d.card} ${className}`} aria-busy="true" aria-label={label}>
      <div className={d.skelBody}>
        <span className={`${s.skel} ${d.skelLine}`} />
        {Array.from({ length: rows }, (_, i) => (
          <span key={i} className={`${s.skel} ${d.skelRow}`} />
        ))}
      </div>
    </section>
  );
}

/** Carrier wordmark: text in a quiet outlined chip until real monochrome logo files exist. */
export function CarrierMark({ name }: { name: string }) {
  return name ? <span className={d.carrier}>{name}</span> : null;
}

// ---------------------------------------------------------------- money

const BUCKETS = [
  { key: 'installed', seg: d.seg_installed, label: 'installed' },
  { key: 'scheduled', seg: d.seg_scheduled, label: 'scheduled' },
  { key: 'attention', seg: d.seg_needs, label: 'needs a date' },
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
  const shown = useCountUp(Math.round(amount), { sessionKey: '3c:countup:home-pay' });
  return (
    <>
      <span className={d.cur}>$</span>
      {shown.toLocaleString('en-US')}
    </>
  );
}

function MoneyCard({ pay, hasPlan, tucked }: { pay: PaySummary; hasPlan: boolean; tucked: boolean }) {
  const delta = pay.deltaPct;
  const amount = hasPlan && pay.estThisMonth !== null ? pay.estThisMonth : null;

  return (
    <section className={`${d.money} ${tucked ? d.moneyTucked : ''}`} aria-labelledby="money-h">
      <div className={d.moneyMain}>
        <h2 id="money-h" className={s.kicker}>
          Est. pay this month
        </h2>
        <p className={d.payNum}>{amount !== null ? <PayAmount amount={amount} /> : '—'}</p>
        {!hasPlan ? (
          <p className={d.moneyNote}>No pay plan assigned yet</p>
        ) : delta !== null ? (
          <p className={d.delta}>
            <b className={delta < 0 ? d.deltaDown : ''}>
              {delta < 0 ? (
                <TrendingDown size={16} strokeWidth={2.25} aria-hidden="true" />
              ) : (
                <TrendingUp size={16} strokeWidth={2.25} aria-hidden="true" />
              )}
              {delta > 0 ? '+' : ''}
              {delta}%
            </b>
            vs last month
          </p>
        ) : null}
        {/* Money on sales with nothing on the calendar yet: it has no month. */}
        {hasPlan && pay.estNoDate ? <p className={d.moneyNote}>est. {money(pay.estNoDate)} has no install date yet</p> : null}
        {/* Missed installs: their date is stale, so their money waits on a new one. */}
        {hasPlan && pay.estMissed ? (
          <p className={d.moneyNote}>est. {money(pay.estMissed)} needs a new install date</p>
        ) : null}
      </div>

      <div className={d.well}>
        <div className={d.wellHead}>
          <span className={s.kicker}>This month</span>
          <span>
            {pay.monthCount} {pay.monthCount === 1 ? 'sale' : 'sales'}
          </span>
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
    </section>
  );
}

/** The next T-Fiber payout window, tucked under the money card one step down the ladder. */
function PayoutCard({ payout }: { payout: NonNullable<PaySummary['payout']> }) {
  return (
    <div className={d.payout}>
      <span className={d.payoutLab}>
        <span className={s.kicker}>Next window</span>
        <CarrierMark name="T-Fiber" />
      </span>
      <span className={d.payoutWhen}>Est. payout {formatPayoutWindow(payout.window)}</span>
      <span className={d.payoutMeta}>
        {payout.count} {payout.count === 1 ? 'sale' : 'sales'}
        {payout.scheduled > 0 ? ` · ${payout.scheduled} scheduled` : ''}
      </span>
      {payout.amount !== null ? (
        <span className={d.payoutAmt}>
          <small className={d.est}>est.</small>
          {money(payout.amount)}
        </span>
      ) : null}
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
      <div className={d.moneyMain}>
        <p className={s.kicker}>Est. pay this month</p>
        <span className={`${s.skel} ${d.skelScore}`} />
        <span className={`${s.skel} ${d.skelLine}`} />
      </div>
      <div className={d.well}>
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
      <div className={`${s.track} ${d.chTrack}`} aria-hidden="true">
        <span className={`${s.fill} ${d.grow}`} style={{ width: `${pct}%` }} />
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
    <section className={`${s.panel} ${d.card} ${d.week}`} style={rise(2)} aria-labelledby="week-h">
      <div className={d.weekHead}>
        <h2 id="week-h" className={d.weekTitle}>
          This week
        </h2>
        <span className={d.clock}>
          <Timer size={16} aria-hidden="true" />
          {timeLeft}
        </span>
      </div>

      <div className={`${d.halves} ${showRank && showChallenge ? '' : d.halvesSolo}`}>
        {showRank ? (
          <div className={d.half}>
            <p className={d.halfLab}>Rank</p>
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
                  of {rank.of} · <b>{rank.points.toLocaleString('en-US')} pts</b>
                </p>
              </>
            ) : null}
          </div>
        ) : null}

        {showChallenge ? (
          <div className={d.half}>
            <p className={d.halfLab}>Challenge</p>
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
                      <b className={d.win}>{toGo} more</b> by Saturday
                    </>
                  ) : (
                    <>
                      <b className={d.win}>Done.</b> Challenge closed.
                    </>
                  )}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {rank ? (
        <Link href="/portal/leaderboard" className={d.chase}>
          {gapPct !== null ? (
            <span className={`${s.track} ${d.chaseTrack}`} aria-hidden="true">
              <span className={`${s.fill} ${d.grow}`} style={{ width: `${gapPct}%` }} />
            </span>
          ) : null}
          <span className={d.chaseText}>{standLine(rank)}</span>
          <span className={d.chaseLink}>
            <span className={d.chaseWord}>Leaderboard</span>
            <ChevronRight size={16} aria-hidden="true" />
          </span>
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
  /** Opens the install-date sheet: the rep's own sale, never the admin edit page. */
  onSetDate: (row: NeedsDateRow) => void;
}) {
  return (
    <section className={`${s.panel} ${d.card} ${d.today}`} style={rise(3)} aria-labelledby="today-h">
      <PanelHead id="today-h" title="Today" />
      {items.map((item) => {
        if (item.kind === 'date') {
          const verb = item.row.missed ? 'Reschedule' : 'Add date';
          return (
            <button
              key={`date-${item.row.id}`}
              type="button"
              className={`${d.tRow} ${d.tRowBtn}`}
              onClick={() => onSetDate(item.row)}
            >
              <span className={`${d.stamp} ${d.stampNow}`}>Now</span>
              <span className={d.tText}>
                <span className={d.tTitle}>{item.row.missed ? 'Reschedule the install' : 'Add an install date'}</span>
                <span className={d.tSub}>
                  {item.row.customer}
                  {item.row.plan ? `, ${item.row.plan}` : ''}
                </span>
                {item.row.missedNote ? <span className={d.tSub}>{item.row.missedNote}</span> : null}
              </span>
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
            className={d.tRow}
            {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          >
            {item.kind === 'call' ? (
              <>
                <span className={d.stamp}>{formatCallTime(item.call.time)}</span>
                <span className={d.tText}>
                  <span className={d.tTitle}>{item.call.title}</span>
                  <span className={d.tSub}>{item.call.meetLink ? 'Video call' : 'Call'}</span>
                </span>
                <span className={d.tAct}>
                  {item.call.meetLink ? (
                    <>
                      <Video size={16} aria-hidden="true" />
                      Join
                    </>
                  ) : (
                    'Open'
                  )}
                </span>
              </>
            ) : (
              <>
                <span className={`${d.stamp} ${d.stampQueue}`}>Queue</span>
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
      {extraDates > 0 ? (
        <Link href="/portal/sales" className={d.todayMore}>
          {extraDates} more {extraDates === 1 ? 'sale needs' : 'sales need'} a date
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      ) : null}
      {callsFailed ? <Failed what="today's calls" onRetry={onRetryCalls} /> : null}
    </section>
  );
}

// ---------------------------------------------------------------- recent sales

function RecentSales({ rows }: { rows: RecentSaleRow[] }) {
  return (
    <section className={`${s.panel} ${d.card} ${d.sales}`} style={rise(4)} aria-labelledby="sales-h">
      <PanelHead id="sales-h" title="Recent sales">
        <Link href="/portal/sales" className={d.headLink}>
          See all
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </PanelHead>
      <ul className={d.saleList}>
        {rows.map((row) => (
          <li key={row.id}>
            <Link href={`/portal/sales/${row.id}`} className={`${d.sale} ${row.status === 'cancelled' ? d.saleOff : ''}`}>
              <span className={d.saleName}>{row.customer}</span>
              <span className={d.saleAmt}>{payCell(row)}</span>
              <span className={`${d.status} ${STATUS_CLASS[row.status]}`}>
                <span className={d.dot} aria-hidden="true" />
                {statusLine(row)}
              </span>
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
  /** Push / add-to-home-screen prompts (rendered above everything). */
  banners?: ReactNode;
  /** 'ready' with pay null means the book is empty or not loaded yet. */
  payStatus: 'loading' | 'error' | 'ready';
  pay: PaySummary | null;
  hasPlan: boolean;
  zeroSales: boolean;
  canLog: boolean;
  carrierFailed: boolean;
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
  onHelp: () => void;
  onRetry: (key: RepSectionKey | 'pay') => void;
  onSetDate: (row: NeedsDateRow) => void;
}

/**
 * Home in direction C ("Split"): the premium money block on top (raised card,
 * the payout window tucked under it), the competitive week strip below it,
 * then Today and recent sales. Desktop: money + week in the main column,
 * Today and recent sales in the side column.
 */
export function RepHomeView(p: RepHomeViewProps) {
  const payout = p.pay?.payout ?? null;
  const showToday = p.todayItems.length > 0 || p.callsFailed;

  return (
    <>
      <h1 className={s.srOnly}>{p.firstName === 'Your' ? 'Your dashboard' : `${p.firstName}'s dashboard`}</h1>

      <div className={d.grid}>
        {p.banners ? <div className={d.banners}>{p.banners}</div> : null}

        <div className={d.colMain}>
          {p.carrierFailed && p.pay ? (
            <CarrierNotice onRetry={() => p.onRetry('book')} className={d.carrierNote} />
          ) : null}

          <div className={d.moneyBlock} style={rise(1)}>
            {p.payStatus === 'loading' ? (
              <MoneySkeleton />
            ) : p.payStatus === 'error' ? (
              <section className={d.money} aria-label="Est. pay this month">
                <div className={d.moneyMain}>
                  <p className={s.kicker}>Est. pay this month</p>
                  <Failed what="your pay" onRetry={() => p.onRetry('pay')} className={d.cellFailed} />
                </div>
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
                <MoneyCard pay={p.pay} hasPlan={p.hasPlan} tucked={!!payout} />
                {payout ? <PayoutCard payout={payout} /> : null}
                <PayHelpButton onClick={p.onHelp} />
              </>
            ) : null}
          </div>

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

          {p.payStatus === 'ready' && p.rows.length > 0 ? <RecentSales rows={p.rows} /> : null}
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
 * The rep dashboard. Everyone (rep, manager, admin, owner) sees their OWN
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
  const [dateRow, setDateRow] = useState<NeedsDateRow | null>(null);
  const closeDate = useCallback(() => setDateRow(null), []);
  const now = useNow();

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
  if (isAdmin && pendingSignups > 0) {
    todayItems.push({
      kind: 'queue',
      key: 'signups',
      title: `Approve ${pendingSignups} new ${pendingSignups === 1 ? 'signup' : 'signups'}`,
      sub: 'Waiting on an admin',
      href: '/portal/admin/users',
    });
  }
  if (data.leads?.status === 'ready' && data.leads.data > 0) {
    todayItems.push({
      kind: 'queue',
      key: 'leads',
      title: `${data.leads.data} open leads ${data.leads.data === 1 ? 'request' : 'requests'}`,
      sub: 'Reps waiting on leads',
      href: '/portal/admin/leads-requests',
    });
  }

  const payStatus =
    data.book.status === 'loading' || data.plan.status === 'loading'
      ? 'loading'
      : data.book.status === 'error' || data.plan.status === 'error'
        ? 'error'
        : 'ready';
  const canLog = hasPermission('sales:write');

  const onRetry = (key: RepSectionKey | 'pay') => {
    const keys: RepSectionKey[] =
      key === 'pay' ? (['book', 'plan'] as const).filter((k) => data[k].status === 'error') : [key];
    for (const k of keys) retry(k);
  };

  return (
    <>
      <RepHomeView
        firstName={user?.displayName?.split(' ')[0] || 'Your'}
        banners={
          <>
            <PushPromptBanner visible={pushPromptVisible} onDismiss={hidePushPrompt} />
            {pushPromptVisible === false && <AddToHomeScreenBanner pushPromptVisible={pushPromptVisible} />}
          </>
        }
        payStatus={payStatus}
        pay={pay}
        hasPlan={rates !== null}
        zeroSales={book !== null && book.sales.length === 0}
        canLog={canLog}
        carrierFailed={!!book?.carrierFailed}
        standing={standing}
        challenge={data.challenge}
        timeLeft={weekTimeLeft(now)}
        rows={rows}
        todayItems={todayItems}
        todayLoading={data.calls.status === 'loading' || data.book.status === 'loading'}
        extraDates={Math.max(dates.length - MAX_DATE_ROWS, 0)}
        callsFailed={data.calls.status === 'error'}
        scanIntro={canLog ? <ScanIntroCard now={now} /> : null}
        onHelp={() => setHelpOpen(true)}
        onRetry={onRetry}
        onSetDate={setDateRow}
      />

      {helpOpen ? <PayHelpSheet onClose={closeHelp} /> : null}
      {dateSale && dateRow ? (
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
