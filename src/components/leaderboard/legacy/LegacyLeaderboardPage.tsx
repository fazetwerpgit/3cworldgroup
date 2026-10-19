'use client';

/* The desktop leaderboard page as it shipped on master (1a0b836f): the filter
   row, the weekly challenge, the standing panel, the skeleton and the board,
   lifted out of the route unchanged. The route now renders this above 1024px
   and the phone redesign below it, so everything here takes the board data as
   props from one shared fetch instead of fetching for itself.

   `active` is false while the phone layout is the visible one. The desktop-only
   calls behind it — the weekly-challenge standing, the challenge target and the
   minute clock — stay off in that case; nothing here is on screen to need them. */

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { LegacyLeaderboardTable } from './LegacyLeaderboardTable';
import type { RecentSale, UnrankedRep } from '@/lib/leaderboard/team';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { auth } from '@/lib/firebase/config';
import { weekTimeLeft } from '@/lib/dashboard/repSummary';
import p from '@/components/portal/rep/rep-page.module.css';
import tx from '@/components/portal/rep/rep-taste.module.css';
import d from './leaderboard-desk.module.css';
import type { LeaderboardEntry, LeaderboardMetric } from '../LeaderboardTable';
import { BOARD_OPTIONS, type BoardSwitch } from '../BoardSwitch';
import type { MonthNav } from '../MonthNav';
import { MonthPicker } from '@/components/portal/rep/MonthPicker';
import type { MonthKey } from '@/lib/sales/monthWindow';

type Period = 'week' | 'month' | 'year' | 'all';
type Metric = LeaderboardMetric;


const periodOptions: { value: Period; label: string }[] = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'all', label: 'All Time' },
];

const metricOptions: { value: Metric; label: string }[] = [
  { value: 'totalPoints', label: 'Points' },
  { value: 'totalSales', label: 'Sales' },
];

const formatNumber = (n: number) => new Intl.NumberFormat('en-US').format(n);

function LegacyLeaderboardFilters({
  period,
  metric,
  setPeriod,
  setMetric,
  monthNav,
  boardSwitch = null,
}: {
  period: Period;
  metric: Metric;
  setPeriod: (period: Period) => void;
  setMetric: (metric: Metric) => void;
  monthNav?: MonthNav | null;
  boardSwitch?: BoardSwitch | null;
}) {
  return (
    <div className={d.filters}>
      {boardSwitch ? (
        <div className={tx.seg} role="group" aria-label="Leaderboard">
          {BOARD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={boardSwitch.board === option.value}
              onClick={() => boardSwitch.onChange(option.value)}
              className={tx.segBtn}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className={tx.chips} role="group" aria-label="Leaderboard period">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={tx.chip}
            >
              {option.label}
            </button>
          ))}
      </div>
      {/* The solar board ranks by booked consults alone: no metric switch. */}
      {metric === 'bookedConsults' ? null : (
        <div className={tx.seg} role="group" aria-label="Leaderboard metric">
          {metricOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={metric === option.value}
              onClick={() => setMetric(option.value)}
              className={tx.segBtn}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
      {/* Earlier months on This Month: the Sales page's stepper. */}
      {period === 'month' && monthNav ? (
        <MonthPicker month={monthNav.month} min={monthNav.min} max={monthNav.max} onChange={monthNav.onChange} />
      ) : null}
      <span className={d.live}>Live</span>
    </div>
  );
}

// `target` is null until the setting loads; a failed read says so rather than
// showing a made-up target.
function WeeklyChallenge({
  sales,
  loading,
  target,
  failed,
  onRetry,
  salesFailed = false,
  onRetrySales,
}: {
  sales: number | null;
  loading: boolean;
  target: number | null;
  failed: boolean;
  onRetry: () => void;
  // The rep's weekly count failed to load: say so instead of a made-up 0.
  salesFailed?: boolean;
  onRetrySales?: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (target === null) {
    return (
      <div className={d.card}>
        <h2 className={d.cardTitle}>Weekly challenge</h2>
        <div className={d.challengeBody}>
          {failed ? (
            <span className={d.retryRow} role="alert">
              Couldn&apos;t load
              <button type="button" className={d.retry} onClick={onRetry}>
                Retry
              </button>
            </span>
          ) : (
            <span className={d.challengeMeta}>Loading</span>
          )}
        </div>
      </div>
    );
  }

  const complete = !salesFailed && sales !== null && sales >= target;

  return (
    <div className={d.card}>
      <h2 className={d.cardTitle}>Weekly challenge</h2>
      <div className={d.challengeBody}>
        <strong className={d.challengeLine}>
          {complete ? `Challenge complete. ${target} of ${target}` : `Close ${target} sales by Saturday`}
        </strong>
        <span className={d.track} aria-hidden="true">
          <span
            className={d.fill}
            style={{ width: `${salesFailed || loading || sales === null ? 0 : Math.min(sales / target, 1) * 100}%` }}
          />
        </span>
        {salesFailed ? (
          <span className={d.retryRow} role="alert">
            Couldn&apos;t load your sales
            {onRetrySales ? (
              <button type="button" className={d.retry} onClick={onRetrySales}>
                Retry
              </button>
            ) : null}
          </span>
        ) : (
          <span className={d.challengeMeta}>
            {loading || sales === null ? `0 of ${target}, loading` : `${Math.min(sales, target)} of ${target}, ${weekTimeLeft(now)}`}
          </span>
        )}
      </div>
    </div>
  );
}

// The solar board's card in the weekly challenge's slot: there is no solar
// target, so it is the viewer's own consults booked this week and the time left.
function SolarWeek({ booked, loading, failed, onRetry }: { booked: number | null; loading: boolean; failed: boolean; onRetry: () => void }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className={d.card}>
      <h2 className={d.cardTitle}>This week</h2>
      <div className={d.challengeBody}>
        {failed ? (
          <span className={d.retryRow} role="alert">
            Couldn&apos;t load your consults
            <button type="button" className={d.retry} onClick={onRetry}>
              Retry
            </button>
          </span>
        ) : (
          <>
            <strong className={d.challengeLine}>
              {loading || booked === null ? 'Consults booked' : `${booked} ${booked === 1 ? 'consult' : 'consults'} booked`}
            </strong>
            <span className={d.challengeMeta}>{loading || booked === null ? 'Loading' : weekTimeLeft(now)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function ArenaStanding({ userRank, userName, metric }: { userRank?: LeaderboardEntry | null; userName: string; metric: Metric }) {
  const unit = metric === 'totalPoints' ? 'pts' : metric === 'bookedConsults' ? 'consults' : 'sales';

  return (
    <aside className={d.card}>
      <h2 className={d.cardTitle}>Your standing</h2>
      <div className={d.standingRank}>
        <small>#</small>
        {userRank?.rank ?? '—'}
      </div>
      <div className={d.standingFoot}>
        <strong>{userName}</strong>
        <span>
          {metric === 'bookedConsults'
            ? `${formatNumber(userRank?.totalSales ?? 0)} booked consults`
            : `${formatNumber(userRank?.totalPoints ?? 0)} pts, ${userRank?.totalSales ?? 0} sales`}
        </span>
      </div>
      <span className="sr-only">Metric: {unit}</span>
    </aside>
  );
}

function BoardSkeleton() {
  return (
    <div className={d.skel}>
      <section>
        <div className={d.secHead}>
          <Skeleton className={`h-8 w-44 ${d.skelBar}`} />
          <Skeleton className={`h-4 w-36 ${d.skelBar}`} />
        </div>
        <div className={d.skelPod}>
          {[0, 1, 2].map((index) => (
            <div key={index} className={d.skelBlock} style={{ minHeight: index === 1 ? 306 : 256 }} />
          ))}
        </div>
      </section>
      <div className={d.pulse}>
        {[0, 1, 2, 3].map((index) => <div key={index} className={d.skelBlock} style={{ minHeight: 112 }} />)}
      </div>
      <section>
        <div className={d.secHead}><Skeleton className={`h-8 w-40 ${d.skelBar}`} /><Skeleton className={`h-4 w-36 ${d.skelBar}`} /></div>
        <div className={d.skelBlock} style={{ minHeight: 5 * 76 }} />
      </section>
    </div>
  );
}

interface LegacyLeaderboardPageProps {
  active: boolean;
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  loading: boolean;
  error: string | null;
  period: Period;
  metric: Metric;
  onPeriodChange: (period: Period) => void;
  onMetricChange: (metric: Metric) => void;
  monthNav?: MonthNav | null;
  pastMonth?: MonthKey | null;
  viewerName?: string | null;
  viewerId?: string | null;
  unranked?: UnrankedRep[];
  recent?: RecentSale[];
  onRetry?: () => void;
  /** Fiber | Solar, for a viewer with both boards; null shows the one board. */
  boardSwitch?: BoardSwitch | null;
}

export function LegacyLeaderboardPage({
  active,
  entries,
  currentUser,
  loading,
  error,
  period,
  metric,
  onPeriodChange,
  onMetricChange,
  monthNav = null,
  pastMonth = null,
  viewerName,
  viewerId,
  unranked,
  recent,
  onRetry,
  boardSwitch = null,
}: LegacyLeaderboardPageProps) {
  const solar = metric === 'bookedConsults';
  const {
    currentUser: weeklyCurrentUser,
    loading: weeklyLoading,
    error: weeklyError,
    fetchLeaderboard: fetchWeeklyLeaderboard,
  } = useLeaderboard();
  const [challengeTarget, setChallengeTarget] = useState<number | null>(null);
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [challengeAttempt, setChallengeAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    // The solar board's slot: the viewer's consults booked this week.
    if (solar) {
      fetchWeeklyLeaderboard('week', 'bookedConsults', 1, 'approved', { source: 'solar' });
      return;
    }
    // 'submitted' scope: the challenge counts sales as reps log them,
    // not only after admin approval.
    fetchWeeklyLeaderboard('week', 'totalSales', 1, 'submitted');
  }, [active, solar, fetchWeeklyLeaderboard]);

  useEffect(() => {
    if (!active || solar) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch('/api/portal/settings/weekly-challenge', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) throw new Error('Failed to load weekly challenge');
        const data = await response.json();
        if (typeof data.targetSales !== 'number') throw new Error('Weekly challenge target missing');
        if (!cancelled) {
          setChallengeTarget(data.targetSales);
          setChallengeFailed(false);
        }
      } catch {
        // Never fall back to a made-up target: the card says it couldn't load.
        if (!cancelled) setChallengeFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, solar, challengeAttempt]);

  const retryWeeklySales = () => {
    if (solar) fetchWeeklyLeaderboard('week', 'bookedConsults', 1, 'approved', { source: 'solar' });
    else fetchWeeklyLeaderboard('week', 'totalSales', 1, 'submitted');
  };

  const retryChallenge = () => {
    setChallengeFailed(false);
    setChallengeAttempt((value) => value + 1);
  };

  // Nothing below is on screen on a phone, and the board it would draw runs a
  // count-up animation per row, so the whole tree stays unbuilt there.
  if (!active) return null;

  const userRank = currentUser ?? null;
  const weeklyStanding = weeklyCurrentUser;
  const weeklySales = weeklyLoading ? weeklyStanding?.totalSales ?? null : weeklyStanding?.totalSales ?? 0;
  const userName = userRank?.salesRepName ?? viewerName ?? 'Your standing';

  return (
    <>
      {/* No side padding: the D shell's gutter already lines the board up with its top bar. */}
      <div className={`relative z-10 mx-auto w-full max-w-[1500px] pb-8 ${d.scope}`}>
        <header className={p.head}>
          <h1 className={`${p.title} ${d.pageTitle}`}>Leaderboard</h1>
          <p className={p.lede}>{entries.length} ranked</p>
        </header>
        <LegacyLeaderboardFilters period={period} metric={metric} setPeriod={onPeriodChange} setMetric={onMetricChange} monthNav={monthNav} boardSwitch={boardSwitch} />
        <div className={d.summary}>
          {solar ? (
            <SolarWeek
              booked={weeklySales}
              loading={weeklyLoading}
              failed={!weeklyLoading && weeklyError !== null}
              onRetry={retryWeeklySales}
            />
          ) : (
          <WeeklyChallenge
            sales={weeklySales}
            loading={weeklyLoading}
            target={challengeTarget}
            failed={challengeFailed}
            onRetry={retryChallenge}
            salesFailed={!weeklyLoading && weeklyError !== null}
            onRetrySales={retryWeeklySales}
          />
          )}
          <ArenaStanding userRank={userRank} userName={userName} metric={metric} />
        </div>

        {/* A failed load: plain words and a retry, never the raw request error. */}
        {error && !loading ? (
          <div className={d.error} role="alert">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{entries.length > 0 ? "Couldn't refresh the board" : "Couldn't load the board"}</span>
            {onRetry ? (
              <button type="button" className={d.retry} onClick={onRetry}>
                Try again
              </button>
            ) : null}
          </div>
        ) : null}

        <div className={d.board}>
          {loading ? <BoardSkeleton /> : <LegacyLeaderboardTable entries={entries} currentUser={currentUser} metric={metric} period={period} pastMonth={pastMonth} unranked={unranked} recent={recent} viewerId={viewerId} />}
        </div>
      </div>
    </>
  );
}
