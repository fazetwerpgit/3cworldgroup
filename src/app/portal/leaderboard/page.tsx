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

function countdownToSunday(now: Date) {
  const end = new Date(now);
  end.setHours(0, 0, 0, 0);
  end.setDate(end.getDate() + ((8 - end.getDay()) % 7 || 7));
  const remaining = Math.max(0, end.getTime() - now.getTime());
  const days = Math.floor(remaining / 86_400_000);
  const hours = Math.floor((remaining % 86_400_000) / 3_600_000);
  return days > 0 ? `${days}d ${hours}h left` : hours > 0 ? `${hours}h left` : 'Under 1h left';
}

function ArenaMast({
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
    <div className="flex flex-wrap items-center justify-between gap-3 border-b-[5px] border-[#0A1F44] pb-3 dark:border-[#8dc63f]">
      <span className="font-['Trebuchet_MS'] text-[11px] font-black uppercase tracking-[0.2em] text-[#0A1F44] dark:text-[#f6f7f8]">
        <span className="mr-2 inline-block size-3 align-[-1px] bg-[#8dc63f] dark:bg-[#d9a520] dark:shadow-[0_0_16px_rgba(245,215,128,0.5)]" aria-hidden="true" />
        3C World Group / Arena
      </span>
      <div className="flex items-center gap-[18px] font-['Consolas'] text-[9px] font-extrabold uppercase tracking-[0.13em] text-[#687384] dark:text-[#9caabd]">
        <div className="flex items-center gap-2" aria-label="Leaderboard period">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={period === option.value}
              onClick={() => setPeriod(option.value)}
              className={`cursor-pointer transition-colors duration-150 ${period === option.value ? 'text-[#8dc63f]' : 'hover:text-[#8dc63f]'}`}
            >
              {option.label.replace('This ', '')}
            </button>
          ))}
        </div>
        <span aria-hidden="true">·</span>
        <div className="flex items-center gap-2" aria-label="Leaderboard metric">
          {metricOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={metric === option.value}
              onClick={() => setMetric(option.value)}
              className={`cursor-pointer transition-colors duration-150 ${metric === option.value ? 'text-[#8dc63f]' : 'hover:text-[#8dc63f]'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span>· LIVE</span>
      </div>
    </div>
  );
}

function WeeklyChallenge({ sales, loading }: { sales: number | null; loading: boolean }) {
  const [now, setNow] = useState(() => new Date());
  const complete = sales !== null && sales >= WEEKLY_CHALLENGE.targetSales;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative grid gap-3 border-b-[5px] border-[#0A1F44] bg-[#8dc63f] px-[19px] py-4 text-[#0A1F44] shadow-[0_14px_34px_rgba(141,198,63,0.11)] dark:border-[#e7edf4] sm:grid-cols-[minmax(180px,1fr)_1.7fr] sm:items-center sm:gap-5">
      <div>
        <span className="font-['Trebuchet_MS'] text-[10px] font-black uppercase tracking-[0.18em]">Weekly challenge</span>
        <span className="mt-2 block font-['Consolas'] text-[11px] font-black whitespace-nowrap sm:text-[12px]">
          {loading || sales === null ? `-- / ${WEEKLY_CHALLENGE.targetSales} · Loading` : `${Math.min(sales, WEEKLY_CHALLENGE.targetSales)} / ${WEEKLY_CHALLENGE.targetSales} · ${countdownToSunday(now)}`}
        </span>
      </div>
      <strong className="font-['Trebuchet_MS'] text-[15px] font-black sm:text-[18px]">
        {complete ? `Challenge complete · ${WEEKLY_CHALLENGE.targetSales} of ${WEEKLY_CHALLENGE.targetSales}` : `Close ${WEEKLY_CHALLENGE.targetSales} sales by Sunday`}
      </strong>
    </div>
  );
}

function ArenaStanding({ userRank, userName, metric }: { userRank?: LeaderboardEntry | null; userName: string; metric: Metric }) {
  const rankAbove = userRank?.rank && userRank.rank > 1 ? userRank : null;
  const unit = metric === 'totalPoints' ? 'pts' : 'sales';

  return (
    <aside className="min-h-[178px] w-full max-w-[280px] min-w-0 justify-self-end self-end border-[5px] border-[#0A1F44] bg-[#0A1F44] px-[19px] pb-[17px] pt-5 text-white dark:border dark:border-[#e7edf4] dark:bg-[linear-gradient(145deg,#142f5f,#07162e)] dark:shadow-[0_18px_38px_rgba(0,0,0,0.22)]">
      <span className="font-['Trebuchet_MS'] text-[10px] font-black uppercase tracking-[0.18em] text-[#8dc63f] dark:text-[#d9a520]">Your standing</span>
      <div className="mt-[15px] flex w-fit items-baseline gap-[0.08em] font-['Trebuchet_MS'] text-[clamp(64px,8vw,100px)] font-black leading-[0.75] tracking-[-0.12em]">
        <small className="text-[0.4em] tracking-normal">#</small>
        {userRank?.rank ?? '—'}
      </div>
      <div className="mt-[17px] flex items-end justify-between gap-2.5 border-t border-white/35 pt-2.5">
        <strong className="truncate text-[14px]">{userName}</strong>
        <span className="shrink-0 font-['Consolas'] text-[10px] whitespace-nowrap sm:text-[11px]">{formatNumber(userRank?.totalPoints ?? 0)} pts · {userRank?.totalSales ?? 0} sales</span>
      </div>
      {rankAbove && <span className="sr-only">Metric: {unit}</span>}
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

  useEffect(() => {
    if (!user) return;
    fetchLeaderboard(period, metric, 100);
  }, [user, period, metric, fetchLeaderboard]);

  useEffect(() => {
    if (!user) return;
    fetchWeeklyLeaderboard('week', 'totalSales', 1);
  }, [user, fetchWeeklyLeaderboard]);

  const userRank = currentUser;
  const weeklyStanding = weeklyCurrentUser;
  const weeklySales = weeklyLoading ? weeklyStanding?.totalSales ?? null : weeklyStanding?.totalSales ?? 0;
  const periodLabel = period === 'week' ? 'WEEK TO DATE' : period === 'month' ? 'MONTH TO DATE' : period === 'year' ? 'YEAR TO DATE' : 'ALL TIME';
  const metricLabel = metric === 'totalPoints' ? 'POINTS' : 'SALES';
  const userName = userRank?.salesRepName ?? currentUser?.salesRepName ?? user?.displayName ?? user?.email ?? 'Your standing';

  return (
    <ProtectedRoute permissions={['leaderboard:read']}>
      <div className="min-h-screen bg-[#f7f8f5] text-[#0A1F44] dark:bg-[#030916] dark:text-[#f6f7f8]">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="relative flex-1 overflow-auto bg-[#f7f8f5] dark:bg-[#030916]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_21%,rgba(217,165,32,0.13),transparent_24%)] dark:bg-[radial-gradient(circle_at_50%_21%,rgba(217,165,32,0.13),transparent_24%),#030916]" aria-hidden="true" />
            <div className="pointer-events-none absolute inset-0 hidden bg-[radial-gradient(circle_at_50%_42%,transparent_35%,rgba(0,0,0,0.46)_100%)] opacity-70 mix-blend-multiply dark:block" aria-hidden="true" />
            <div className="relative z-10 mx-auto w-full max-w-[1500px] px-[clamp(14px,3.6vw,56px)] pb-8 pt-[19px]">
              <ArenaMast period={period} metric={metric} setPeriod={setPeriod} setMetric={setMetric} />
              <header className="grid gap-[30px] border-b border-[#0A1F44] py-[46px] dark:border-[#e7edf4] lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-[clamp(30px,4%,48px)]">
                <div className="min-w-0" style={{ containerType: 'inline-size' }}>
                  <p className="font-['Trebuchet_MS'] text-[11px] font-black uppercase tracking-[0.2em] text-[#687384]">{periodLabel} / ranked by {metricLabel}</p>
                  <h1 className="mt-[13px] mb-[17px] whitespace-nowrap font-['Trebuchet_MS'] text-[clamp(2.5rem,15.5cqw,10rem)] font-black uppercase leading-[0.75] tracking-[-0.115em] text-[#0A1F44] dark:bg-[linear-gradient(145deg,#ffffff_0%,#e8edf2_25%,#aab6c2_56%,#6e7a86_82%,#f4f7fa_100%)] dark:bg-clip-text dark:text-transparent dark:[text-shadow:0_0_26px_rgba(255,255,255,0.07)]">Leaderboard</h1>
                  <p className="max-w-[520px] text-[15px] leading-[1.45] text-[#687384]">A scoreboard for the people making the number move. The lead is visible.<br className="hidden sm:block" /> The next opportunity is yours.</p>
                </div>
                <ArenaStanding userRank={userRank} userName={userName} metric={metric} />
              </header>
              <WeeklyChallenge sales={weeklySales} loading={weeklyLoading} />

              {error && <div className="my-5 flex items-start gap-3 border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300"><AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /><span>{error}</span></div>}

              <div className="pt-11">
                {loading || !user ? <BoardSkeleton /> : <LeaderboardTable entries={leaderboard} currentUser={currentUser} metric={metric} period={period} />}
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
