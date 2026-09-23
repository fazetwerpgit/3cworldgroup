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
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { auth } from '@/lib/firebase/config';
import { weekTimeLeft } from '@/lib/dashboard/repSummary';
import { PageTitle } from '@/components/portal/PageTitle';
import type { LeaderboardEntry } from '../LeaderboardTable';

type Period = 'week' | 'month' | 'year' | 'all';
type Metric = 'totalPoints' | 'totalSales';


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
}: {
  period: Period;
  metric: Metric;
  setPeriod: (period: Period) => void;
  setMetric: (metric: Metric) => void;
}) {
  return (
    <div className="portal-leaderboard-filters border-b border-[#0A1F44]/20 pb-4 dark:border-white/15">
      <div className="portal-leaderboard-filter-row" aria-label="Leaderboard period">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
              className="cursor-pointer transition-colors duration-150"
            >
              {option.label}
            </button>
          ))}
      </div>
      <div className="portal-leaderboard-filter-row" aria-label="Leaderboard metric">
          {metricOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={metric === option.value}
              onClick={() => setMetric(option.value)}
              className="cursor-pointer transition-colors duration-150"
            >
              {option.label}
            </button>
          ))}
      </div>
      <span className="portal-live-label">Live</span>
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
}: {
  sales: number | null;
  loading: boolean;
  target: number | null;
  failed: boolean;
  onRetry: () => void;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  if (target === null) {
    return (
      <div className="relative grid gap-3 border-[5px] border-[#0A1F44] bg-[#0A1F44] px-[19px] py-4 text-white dark:border-[#e7edf4] dark:bg-[linear-gradient(145deg,#142f5f,#07162e)] dark:shadow-[0_18px_38px_rgba(0,0,0,0.22)] sm:grid-cols-[minmax(180px,1fr)_1.7fr] sm:items-center sm:gap-5">
        <h2 className="portal-display text-[18px] font-black text-[#8dc63f] dark:text-[#d9a520]">Weekly challenge</h2>
        {failed ? (
          <span className="flex items-center gap-3 text-[14px] text-white/85" role="alert">
            Couldn&apos;t load
            <button type="button" className="min-h-[44px] font-black underline underline-offset-4" onClick={onRetry}>
              Retry
            </button>
          </span>
        ) : (
          <span className="portal-display text-[12px] font-black text-white/85">Loading</span>
        )}
      </div>
    );
  }

  const complete = sales !== null && sales >= target;

  return (
    <div className="relative grid gap-3 border-[5px] border-[#0A1F44] bg-[#0A1F44] px-[19px] py-4 text-white dark:border-[#e7edf4] dark:bg-[linear-gradient(145deg,#142f5f,#07162e)] dark:shadow-[0_18px_38px_rgba(0,0,0,0.22)] sm:grid-cols-[minmax(180px,1fr)_1.7fr] sm:items-center sm:gap-5">
      <div>
        <h2 className="portal-display text-[18px] font-black text-[#8dc63f] dark:text-[#d9a520]">Weekly challenge</h2>
        <span className="portal-display mt-2 block text-[12px] font-black whitespace-nowrap text-white/85">
          {loading || sales === null ? `0 of ${target}, loading` : `${Math.min(sales, target)} of ${target}, ${weekTimeLeft(now)}`}
        </span>
        <span className="mt-2 block h-[3px] w-full bg-white/15" aria-hidden="true">
          <span
            className="block h-full bg-[#8dc63f] dark:bg-[#d9a520]"
            style={{ width: `${loading || sales === null ? 0 : Math.min(sales / target, 1) * 100}%` }}
          />
        </span>
      </div>
      <strong className="portal-display text-[15px] font-black sm:text-[18px]">
        {complete ? `Challenge complete. ${target} of ${target}` : `Close ${target} sales by Saturday`}
      </strong>
    </div>
  );
}

function ArenaStanding({ userRank, userName, metric }: { userRank?: LeaderboardEntry | null; userName: string; metric: Metric }) {
  const unit = metric === 'totalPoints' ? 'pts' : 'sales';

  return (
    <aside className="min-h-[178px] w-full min-w-0 border-[5px] border-[#0A1F44] bg-[#0A1F44] px-[19px] pb-[17px] pt-5 text-white dark:border-[#e7edf4] dark:bg-[linear-gradient(145deg,#142f5f,#07162e)] dark:shadow-[0_18px_38px_rgba(0,0,0,0.22)]">
      <h2 className="portal-display text-[18px] font-black text-[#8dc63f] dark:text-[#d9a520]">Your standing</h2>
      <div className="mt-[15px] flex w-fit items-baseline gap-[0.08em] portal-display text-[clamp(64px,8vw,100px)] font-black leading-[0.75] tracking-[-0.02em]">
        <small className="text-[0.4em] tracking-normal">#</small>
        {userRank?.rank ?? '—'}
      </div>
      <div className="mt-[17px] flex items-end justify-between gap-2.5 border-t border-white/35 pt-2.5">
        <strong className="truncate text-[14px]">{userName}</strong>
        <span className="portal-display shrink-0 text-[12px] whitespace-nowrap">{formatNumber(userRank?.totalPoints ?? 0)} pts, {userRank?.totalSales ?? 0} sales</span>
      </div>
      <span className="sr-only">Metric: {unit}</span>
    </aside>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-[45px]">
      <section>
        <div className="mb-0 flex items-end justify-between border-b-[5px] border-[#0A1F44] pb-2.5 dark:border-[#e7edf4]">
          <Skeleton className="h-7 w-44 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
          <Skeleton className="h-3 w-36 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
        </div>
        <div className="grid gap-0 bg-[#0A1F44] sm:grid-cols-3 dark:bg-[#0d2449]">
          {[0, 1, 2].map((index) => (
            <div key={index} className={`min-h-[256px] border-white/20 p-6 ${index === 1 ? 'sm:-mt-5 sm:min-h-[306px] border border-[#d9a520]/50' : 'border-r'}`}>
              <Skeleton className="h-24 w-24 rounded-none bg-white/10" />
              <Skeleton className="mt-7 h-11 w-40 rounded-none bg-white/10" />
              <Skeleton className="mt-8 ml-auto h-8 w-24 rounded-none bg-white/10" />
            </div>
          ))}
        </div>
      </section>
      <div className="grid grid-cols-2 border-y border-[#0A1F44] dark:border-[#e7edf4] sm:grid-cols-4">
        {[0, 1, 2, 3].map((index) => <div key={index} className="min-h-[109px] border-r border-[#0A1F44] p-4 last:border-0 dark:border-[#e7edf4] sm:p-[17px]"><Skeleton className="h-3 w-20 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /><Skeleton className="mt-5 h-6 w-28 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /><Skeleton className="mt-2 h-3 w-24 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /></div>)}
      </div>
      <section>
        <div className="mb-0 flex items-end justify-between border-b-[5px] border-[#0A1F44] pb-2.5 dark:border-[#e7edf4]"><Skeleton className="h-7 w-40 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /><Skeleton className="h-3 w-36 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /></div>
        <div className="border-b border-[#0A1F44] dark:border-[#e7edf4]">{[0, 1, 2, 3, 4].map((index) => <div key={index} className="grid min-h-[77px] grid-cols-[70px_minmax(0,1fr)_110px_100px] items-center gap-4 border-b border-[#0A1F44]/20 px-3 last:border-0 dark:border-white/15"><Skeleton className="h-6 w-10 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /><div className="flex items-center gap-3"><Skeleton className="size-9 rounded-full bg-[#0A1F44]/10 dark:bg-white/10" /><Skeleton className="h-4 w-32 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /></div><Skeleton className="h-5 w-16 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" /><Skeleton className="h-5 w-20 rounded-full bg-[#0A1F44]/10 dark:bg-white/10" /></div>)}</div>
      </section>
      <Skeleton className="h-3 w-72 rounded-none bg-[#0A1F44]/10 dark:bg-white/10" />
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
  viewerName?: string | null;
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
  viewerName,
}: LegacyLeaderboardPageProps) {
  const { currentUser: weeklyCurrentUser, loading: weeklyLoading, fetchLeaderboard: fetchWeeklyLeaderboard } = useLeaderboard();
  const [challengeTarget, setChallengeTarget] = useState<number | null>(null);
  const [challengeFailed, setChallengeFailed] = useState(false);
  const [challengeAttempt, setChallengeAttempt] = useState(0);

  useEffect(() => {
    if (!active) return;
    // 'submitted' scope: the challenge counts sales as reps log them,
    // not only after admin approval.
    fetchWeeklyLeaderboard('week', 'totalSales', 1, 'submitted');
  }, [active, fetchWeeklyLeaderboard]);

  useEffect(() => {
    if (!active) return;
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
  }, [active, challengeAttempt]);

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
      <div className="relative z-10 mx-auto w-full max-w-[1500px] pb-8">
        <PageTitle title="Leaderboard" meta={`${entries.length} ranked`} />
        <LegacyLeaderboardFilters period={period} metric={metric} setPeriod={onPeriodChange} setMetric={onMetricChange} />
        <div className="portal-leaderboard-summary-grid">
          <WeeklyChallenge
            sales={weeklySales}
            loading={weeklyLoading}
            target={challengeTarget}
            failed={challengeFailed}
            onRetry={retryChallenge}
          />
          <ArenaStanding userRank={userRank} userName={userName} metric={metric} />
        </div>

        {error && <div className="my-5 flex items-start gap-3 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

        <div className="pt-4">
          {loading ? <BoardSkeleton /> : <LegacyLeaderboardTable entries={entries} currentUser={currentUser} metric={metric} period={period} />}
        </div>
      </div>
    </>
  );
}
