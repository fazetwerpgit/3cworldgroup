'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Target } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { LeaderboardTable, type LeaderboardEntry } from '@/components/leaderboard/LeaderboardTable';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useAuth } from '@/contexts/AuthContext';

type Period = 'week' | 'month' | 'year' | 'all';
type Metric = 'totalPoints' | 'totalSales';

export const WEEKLY_CHALLENGE = { targetSales: 3 } as const;

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

function metricValue(entry: LeaderboardEntry, metric: Metric) {
  return metric === 'totalPoints' ? entry.totalPoints : entry.totalSales;
}

function countdownToSunday(now: Date) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + ((8 - end.getDay()) % 7 || 7));
  const remaining = Math.max(0, end.getTime() - now.getTime());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h left` : 'Under 1h left';
}

function WeeklyChallenge({
  sales,
  loading,
}: {
  sales: number | null;
  loading: boolean;
}) {
  const [now, setNow] = useState(() => new Date());
  const complete = sales !== null && sales >= WEEKLY_CHALLENGE.targetSales;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative z-10 grid gap-3 border-t border-white/10 bg-white/[0.045] px-5 py-3.5 sm:px-6 lg:grid-cols-[minmax(240px,1.3fr)_minmax(190px,1fr)_auto_auto] lg:items-center lg:gap-6">
      <div className="flex items-center gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md border border-[#8dc63f]/35 bg-[#8dc63f]/10 text-[#8dc63f]">
          <Target className="size-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#8dc63f]">
            Weekly challenge
          </p>
          <p className="mt-0.5 text-sm font-semibold text-white">
            {complete ? 'Challenge complete - 3 of 3' : 'Close 3 sales by Sunday'}
          </p>
        </div>
      </div>

      <div className="min-w-0">
        <div className="grid grid-cols-3 gap-1.5" aria-label="Weekly challenge progress">
          {Array.from({ length: WEEKLY_CHALLENGE.targetSales }, (_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-colors duration-200 ${
                sales !== null && index < Math.min(sales, WEEKLY_CHALLENGE.targetSales)
                  ? 'bg-[#8dc63f] shadow-[0_0_10px_rgba(141,198,63,0.22)]'
                  : 'bg-white/10'
              }`}
            />
          ))}
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-[10px] text-white/45">
          <span>{complete ? '3 of 3 closed' : loading || sales === null ? 'Loading progress' : `${Math.min(sales, 3)} of 3 closed`}</span>
          <span className="text-white/65">Approved sales this week</span>
        </div>
      </div>

      <p className="hidden border-l border-white/10 pl-4 text-[11px] font-semibold text-white/65 lg:block lg:whitespace-nowrap">
        {complete ? '3 of 3' : `${sales === null ? '--' : Math.min(sales, 3)} of 3 closed`}
      </p>
      <p className="justify-self-end text-[11px] font-semibold text-white/70 lg:justify-self-start lg:whitespace-nowrap">{countdownToSunday(now)}</p>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="space-y-5">
      <div>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-24" />
            <Skeleton className="mt-1 h-6 w-32" />
          </div>
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="relative grid gap-3 pb-3 sm:grid-cols-3 sm:items-end">
          {[...Array(3)].map((_, index) => (
            <Card
              key={index}
              className={`rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card ${index === 1 ? 'sm:-mt-3' : ''}`}
            >
              <CardContent className="min-h-[230px] p-5 text-center sm:min-h-[270px]">
                <Skeleton className="mx-auto size-12 rounded-full" />
                <Skeleton className="mx-auto mt-4 h-4 w-24" />
                <Skeleton className="mx-auto mt-3 h-12 w-28" />
                <Skeleton className="mx-auto mt-4 h-3 w-32" />
              </CardContent>
            </Card>
          ))}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 hidden h-px bg-slate-200 dark:bg-border sm:block" />
        </div>
      </div>

      <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
        <div className="grid min-h-[156px] grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-border sm:grid-cols-4 sm:divide-y-0">
          {[...Array(4)].map((_, index) => (
            <div key={index} className="space-y-3 p-4 sm:p-5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-6 w-28" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      </Card>

      <div>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <Skeleton className="h-3 w-36" />
            <Skeleton className="mt-1 h-6 w-28" />
          </div>
          <Skeleton className="h-4 w-40" />
        </div>
        <Card className="rounded-lg border-slate-200 bg-white py-0 shadow-sm dark:border-border dark:bg-card">
          <div className="border-b border-slate-100 px-4 py-3 dark:border-border sm:px-5">
            <Skeleton className="h-3 w-20" />
          </div>
          <CardContent className="space-y-0 px-0">
            {[...Array(6)].map((_, index) => (
              <div key={index} className="flex min-h-[68px] items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-border sm:px-5">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="size-9 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="hidden h-4 w-16 sm:block" />
                <Skeleton className="h-5 w-14" />
                <Skeleton className="hidden h-5 w-20 sm:block" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Skeleton className="h-3 w-72" />
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { leaderboard, currentUser, loading, error, fetchLeaderboard, getUserRank } = useLeaderboard();
  const {
    currentUser: weeklyCurrentUser,
    loading: weeklyLoading,
    fetchLeaderboard: fetchWeeklyLeaderboard,
    getUserRank: getWeeklyUserRank,
  } = useLeaderboard();
  const [period, setPeriod] = useState<Period>('month');
  const [metric, setMetric] = useState<Metric>('totalPoints');

  useEffect(() => {
    if (!user) return;
    fetchLeaderboard(period, metric, 100);
  }, [user, period, metric, fetchLeaderboard]);

  useEffect(() => {
    if (!user) return;
    fetchWeeklyLeaderboard('week', 'totalSales', 1);
  }, [user, fetchWeeklyLeaderboard]);

  const userRank = user ? getUserRank(user.uid) : null;
  const weeklyStanding = user ? weeklyCurrentUser ?? getWeeklyUserRank(user.uid) : null;
  const weeklySales = weeklyLoading ? weeklyStanding?.totalSales ?? null : weeklyStanding?.totalSales ?? 0;
  const periodLabel = periodOptions.find((o) => o.value === period)?.label ?? '';
  const rankAbove = useMemo(
    () => (userRank ? leaderboard.find((entry) => entry.rank === userRank.rank - 1) : undefined),
    [leaderboard, userRank],
  );
  const rankGap = rankAbove && userRank ? Math.max(0, metricValue(rankAbove, metric) - metricValue(userRank, metric)) : null;
  const rankUnit = metric === 'totalPoints' ? 'pts' : 'sales';
  const progressPercent = rankAbove && userRank
    ? Math.min(100, Math.round((metricValue(userRank, metric) / Math.max(1, metricValue(rankAbove, metric))) * 100))
    : 0;

  return (
    <ProtectedRoute permissions={['leaderboard:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-enter relative overflow-hidden rounded-lg bg-[#0A1F44] text-white dark:bg-[#0e2647] dark:ring-1 dark:ring-inset dark:ring-white/15">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      'radial-gradient(ellipse 45% 90% at 8% 100%, rgba(141,198,63,0.14), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '100% 100%, 28px 28px, 28px 28px',
                  }}
                />
                <div className="relative grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(390px,0.9fr)] lg:items-end">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                      {periodLabel} &middot; ranked by {metric === 'totalPoints' ? 'approved points' : 'approved sales'}
                    </p>
                    <h1 className="portal-display mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">Leaderboard</h1>
                    <p className="mt-2 max-w-xl text-sm text-white/60">
                      Every rank is up for grabs. The board resets with the period.
                    </p>
                  </div>

                  <div className="border-l border-white/10 pl-5 sm:pl-6">
                    <div className="flex items-center justify-between gap-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">Your standing</p>
                      <span className="rounded-full border border-[#8dc63f]/35 bg-[#8dc63f]/10 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[#8dc63f]">You</span>
                    </div>
                    <dl className="mt-4 grid grid-cols-3">
                      <div className="pr-4">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Your rank</dt>
                        <dd className="portal-display portal-num mt-1 text-4xl font-extrabold leading-none tracking-tight">
                          {userRank?.rank ? <><span className="text-[#8dc63f]">#</span>{userRank.rank}</> : <span className="text-white/35">&mdash;</span>}
                        </dd>
                      </div>
                      <div className="border-l border-white/10 px-4">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Points</dt>
                        <dd className="portal-display portal-num mt-1 text-4xl font-extrabold leading-none tracking-tight">{formatNumber(userRank?.totalPoints ?? 0)}</dd>
                      </div>
                      <div className="border-l border-white/10 pl-4">
                        <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-white/45">Sales</dt>
                        <dd className="portal-display portal-num mt-1 text-4xl font-extrabold leading-none tracking-tight">{userRank?.totalSales ?? 0}</dd>
                      </div>
                    </dl>
                    {rankGap !== null && userRank && userRank.rank !== 1 && (
                      <div className="mt-5" aria-label={`${formatNumber(rankGap)} ${rankUnit} to rank ${userRank.rank - 1}`}>
                        <div className="flex justify-between gap-3 text-[11px] text-white/55">
                          <span>{formatNumber(rankGap)} {rankUnit} to #{userRank.rank - 1}</span>
                          <strong className="text-[#8dc63f]">{progressPercent}%</strong>
                        </div>
                        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                          <div className="h-full rounded-full bg-[#8dc63f] shadow-[0_0_14px_rgba(141,198,63,0.3)] transition-[width] duration-300 ease-out" style={{ width: `${progressPercent}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                <WeeklyChallenge sales={weeklySales} loading={weeklyLoading} />
              </section>

              <div className="portal-enter portal-enter-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-border [&::-webkit-scrollbar]:hidden">
                  {periodOptions.map((opt) => {
                    const active = period === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPeriod(opt.value)}
                        className={`relative shrink-0 cursor-pointer px-3 py-2.5 text-sm transition-colors duration-150 ${active ? 'font-semibold text-slate-950 dark:text-foreground' : 'text-slate-500 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground'}`}
                      >
                        {opt.label}
                        {active && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#8dc63f]" />}
                      </button>
                    );
                  })}
                </div>
                <div className="flex rounded-md border border-slate-200 bg-white p-0.5 dark:border-border dark:bg-card">
                  {metricOptions.map((opt) => {
                    const active = metric === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setMetric(opt.value)}
                        className={`cursor-pointer rounded px-3 py-1.5 text-sm transition-colors duration-150 ${active ? 'bg-[#0A1F44] font-medium text-white dark:bg-white/15' : 'text-slate-500 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground'}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <Card className="rounded-lg border-red-200 bg-red-50 py-0 shadow-sm dark:border-red-500/30 dark:bg-red-500/15">
                  <CardContent className="flex items-start gap-3 p-5 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    <span>{error}</span>
                  </CardContent>
                </Card>
              )}

              <div className="portal-enter portal-enter-3">
                {loading || !user ? (
                  <BoardSkeleton />
                ) : (
                  <LeaderboardTable
                    entries={leaderboard}
                    currentUser={currentUser ?? userRank}
                    currentUserId={user.uid}
                    metric={metric}
                    period={period}
                  />
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
