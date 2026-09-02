'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { LeaderboardTable, type LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-rep-b.css';

type Period = 'week' | 'month' | 'year' | 'all';
type Metric = 'totalPoints' | 'totalSales';

export const WEEKLY_CHALLENGE = { targetSales: 7 } as const;

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

function countdownToSunday(now: Date) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + ((8 - end.getDay()) % 7 || 7));
  const remaining = Math.max(0, end.getTime() - now.getTime());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h left` : 'Under 1h left';
}

function LeaderboardFilters({
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

function WeeklyChallenge({ sales, loading, target }: { sales: number | null; loading: boolean; target: number }) {
  const [now, setNow] = useState(() => new Date());
  const complete = sales !== null && sales >= target;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative grid gap-3 border-[5px] border-[#0A1F44] bg-[#0A1F44] px-[19px] py-4 text-white dark:border-[#e7edf4] dark:bg-[linear-gradient(145deg,#142f5f,#07162e)] dark:shadow-[0_18px_38px_rgba(0,0,0,0.22)] sm:grid-cols-[minmax(180px,1fr)_1.7fr] sm:items-center sm:gap-5">
      <div>
        <h2 className="portal-display text-[18px] font-black text-[#8dc63f] dark:text-[#d9a520]">Weekly challenge</h2>
        <span className="portal-display mt-2 block text-[12px] font-black whitespace-nowrap text-white/85">
          {loading || sales === null ? `0 of ${target}, loading` : `${Math.min(sales, target)} of ${target}, ${countdownToSunday(now)}`}
        </span>
        <span className="mt-2 block h-[3px] w-full bg-white/15" aria-hidden="true">
          <span
            className="block h-full bg-[#8dc63f] dark:bg-[#d9a520]"
            style={{ width: `${loading || sales === null ? 0 : Math.min(sales / target, 1) * 100}%` }}
          />
        </span>
      </div>
      <strong className="portal-display text-[15px] font-black sm:text-[18px]">
        {complete ? `Challenge complete. ${target} of ${target}` : `Close ${target} sales by Sunday`}
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
        <span className="portal-display shrink-0 text-[10px] whitespace-nowrap sm:text-[11px]">{formatNumber(userRank?.totalPoints ?? 0)} pts, {userRank?.totalSales ?? 0} sales</span>
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

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { leaderboard, currentUser, loading, error, fetchLeaderboard } = useLeaderboard();
  const { currentUser: weeklyCurrentUser, loading: weeklyLoading, fetchLeaderboard: fetchWeeklyLeaderboard } = useLeaderboard();
  const [period, setPeriod] = useState<Period>('month');
  const [metric, setMetric] = useState<Metric>('totalPoints');
  const [challengeTarget, setChallengeTarget] = useState<number>(WEEKLY_CHALLENGE.targetSales);

  useEffect(() => {
    if (!user) return;
    fetchLeaderboard(period, metric, 100);
  }, [user, period, metric, fetchLeaderboard]);

  useEffect(() => {
    if (!user) return;
    // 'submitted' scope: the challenge counts sales as reps log them,
    // not only after admin approval.
    fetchWeeklyLeaderboard('week', 'totalSales', 1, 'submitted');
  }, [user, fetchWeeklyLeaderboard]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await auth?.currentUser?.getIdToken();
        const response = await fetch('/api/portal/settings/weekly-challenge', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled && typeof data.targetSales === 'number') {
          setChallengeTarget(data.targetSales);
        }
      } catch {
        // Keep the WEEKLY_CHALLENGE fallback silently.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const userRank = currentUser;
  const weeklyStanding = weeklyCurrentUser;
  const weeklySales = weeklyLoading ? weeklyStanding?.totalSales ?? null : weeklyStanding?.totalSales ?? 0;
  const userName = userRank?.salesRepName ?? currentUser?.salesRepName ?? user?.displayName ?? user?.email ?? 'Your standing';

  return (
    <ProtectedRoute permissions={['leaderboard:read']}>
      <div className="min-h-screen bg-[#f7f8f5] text-[#0A1F44] dark:bg-[#030916] dark:text-[#f6f7f8]">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="portal-main-offset relative flex-1 overflow-auto bg-[#f7f8f5] dark:bg-[#030916]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_21%,rgba(217,165,32,0.13),transparent_24%)] dark:bg-[radial-gradient(circle_at_50%_21%,rgba(217,165,32,0.13),transparent_24%),#030916]" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle_at_50%_42%,transparent_35%,rgba(0,0,0,0.46)_100%)] opacity-70 mix-blend-multiply dark:block" aria-hidden="true" />
            <div className="relative z-10 mx-auto w-full max-w-[1500px] px-[clamp(14px,3.6vw,56px)] pb-8 pt-[19px]">
              <PageTitle title="Leaderboard" meta={`${leaderboard.length} ranked`} />
              <LeaderboardFilters period={period} metric={metric} setPeriod={setPeriod} setMetric={setMetric} />
              <div className="portal-leaderboard-summary-grid">
                <WeeklyChallenge sales={weeklySales} loading={weeklyLoading} target={challengeTarget} />
                <ArenaStanding userRank={userRank} userName={userName} metric={metric} />
              </div>

              {error && <div className="my-5 flex items-start gap-3 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

              <div className="pt-4">
                {loading || !user ? <BoardSkeleton /> : <LeaderboardTable entries={leaderboard} currentUser={currentUser} metric={metric} period={period} />}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
