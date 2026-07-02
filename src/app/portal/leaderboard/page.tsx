'use client';

import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useAuth } from '@/contexts/AuthContext';

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

function BoardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Card key={i} className="rounded-lg border-slate-200 py-0 shadow-sm dark:border-border">
            <CardContent className="flex flex-col items-center p-5">
              <Skeleton className="h-12 w-12 rounded-full" />
              <Skeleton className="mt-3 h-4 w-24" />
              <Skeleton className="mt-2 h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="rounded-lg border-slate-200 py-0 shadow-sm dark:border-border">
        <CardContent className="space-y-0 divide-y divide-slate-100 px-0 dark:divide-border">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-2.5">
              <Skeleton className="h-7 w-7 rounded-md" />
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-12" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { leaderboard, loading, error, fetchLeaderboard, getUserRank } = useLeaderboard();
  const [period, setPeriod] = useState<Period>('month');
  const [metric, setMetric] = useState<Metric>('totalPoints');

  useEffect(() => {
    // Wait for auth to resolve so the request carries a token — fetching
    // earlier guarantees a "missing token" error on first paint.
    if (!user) return;
    fetchLeaderboard(period, metric, 20);
  }, [user, period, metric, fetchLeaderboard]);

  const userRank = user ? getUserRank(user.uid) : null;
  const periodLabel = periodOptions.find((o) => o.value === period)?.label ?? '';

  return (
    <ProtectedRoute permissions={['leaderboard:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              {/* Command band with YOUR standing built in — the page opens by
                  answering the only question every rep has: where am I? */}
              <section className="portal-enter relative overflow-hidden rounded-lg bg-[#0A1F44] text-white">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0"
                  style={{
                    backgroundImage:
                      'radial-gradient(ellipse 45% 90% at 8% 100%, rgba(141,198,63,0.14), transparent 70%), linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
                    backgroundSize: '100% 100%, 28px 28px, 28px 28px',
                  }}
                />
                <div className="relative flex flex-col gap-6 p-5 sm:p-6 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
                      {periodLabel} · ranked by{' '}
                      {metric === 'totalPoints' ? 'approved points' : 'approved sales'}
                    </p>
                    <h1 className="portal-display mt-1.5 text-3xl font-extrabold tracking-tight">
                      Leaderboard
                    </h1>
                    <p className="mt-1.5 text-sm text-white/60">
                      Every rank is up for grabs. The board resets with the period.
                    </p>
                  </div>
                  <dl className="flex items-end gap-8">
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                        Your rank
                      </dt>
                      <dd className="portal-display portal-num mt-1 text-4xl font-extrabold leading-none tracking-tight">
                        {userRank?.rank ? (
                          <>
                            <span className="text-[#8dc63f]">#</span>
                            {userRank.rank}
                          </>
                        ) : (
                          <span className="text-white/35">—</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                        Points
                      </dt>
                      <dd className="portal-display portal-num mt-1 text-4xl font-extrabold leading-none tracking-tight">
                        {formatNumber(userRank?.totalPoints || 0)}
                      </dd>
                    </div>
                    <div className="hidden sm:block">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/50">
                        Sales
                      </dt>
                      <dd className="portal-display portal-num mt-1 text-4xl font-extrabold leading-none tracking-tight">
                        {userRank?.totalSales || 0}
                      </dd>
                    </div>
                  </dl>
                </div>
              </section>

              {/* Toolbar: period tabs + metric segmented control. */}
              <div className="portal-enter portal-enter-2 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 [-ms-overflow-style:none] [scrollbar-width:none] dark:border-border [&::-webkit-scrollbar]:hidden">
                  {periodOptions.map((opt) => {
                    const active = period === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setPeriod(opt.value)}
                        className={`relative shrink-0 px-3 py-2.5 text-sm transition-colors ${
                          active
                            ? 'font-semibold text-slate-950 dark:text-foreground'
                            : 'text-slate-500 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground'
                        }`}
                      >
                        {opt.label}
                        {active && (
                          <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[#8dc63f]" />
                        )}
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
                        className={`rounded px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? 'bg-[#0A1F44] font-medium text-white dark:bg-white/15'
                            : 'text-slate-500 hover:text-slate-900 dark:text-muted-foreground dark:hover:text-foreground'
                        }`}
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
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
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
                    currentUserId={user?.uid}
                    metric={metric}
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
