'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, BarChart3, CalendarDays, Info, ListOrdered, Trophy } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { RankCard } from '@/components/leaderboard/RankCard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { leaderboard, loading, error, fetchLeaderboard, getUserRank } = useLeaderboard();
  const [period, setPeriod] = useState<Period>('month');
  const [metric, setMetric] = useState<Metric>('totalPoints');

  useEffect(() => {
    fetchLeaderboard(period, metric, 20);
  }, [period, metric, fetchLeaderboard]);

  const userRank = user ? getUserRank(user.uid) : null;

  return (
    <ProtectedRoute permissions={['leaderboard:read']}>
      <div className="min-h-screen portal-canvas">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 overflow-auto p-4 sm:p-6">
            <div className="mx-auto max-w-[1500px] space-y-5">
              <section className="portal-panel portal-rail rounded-lg p-5 sm:p-6">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="space-y-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-foreground">Leaderboard</h1>
                          <Badge variant="outline" className="gap-2 rounded-md border-slate-200 dark:border-border bg-slate-50 dark:bg-muted text-slate-600 dark:text-muted-foreground">
                            <ListOrdered className="size-3.5" />
                            Performance ranking
                          </Badge>
                        </div>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600 dark:text-muted-foreground">
                          Compare approved sales and point totals across the selected reporting period.
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 sm:min-w-64">
                      <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-muted-foreground">Period</p>
                        <p className="mt-1 font-semibold text-[#0A1F44] dark:text-foreground">{periodOptions.find((option) => option.value === period)?.label}</p>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-border bg-slate-50 dark:bg-muted p-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-muted-foreground">Rank by</p>
                        <p className="mt-1 font-semibold text-[#0A1F44] dark:text-foreground">{metricOptions.find((option) => option.value === metric)?.label}</p>
                      </div>
                    </div>
                  </div>
              </section>

              <RankCard rank={userRank?.rank || null} totalSales={userRank?.totalSales || 0} totalPoints={userRank?.totalPoints || 0} />

              <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                <CardContent className="space-y-5 p-5">
                  <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
                    <div>
                      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-muted-foreground">
                        <CalendarDays className="size-4 text-slate-500 dark:text-muted-foreground" />
                        Time Period
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {periodOptions.map((opt) => (
                          <Button
                            key={opt.value}
                            type="button"
                            variant={period === opt.value ? 'default' : 'outline'}
                            size="sm"
                            className={period === opt.value ? 'bg-[#0A1F44] text-white hover:bg-[#132f62]' : 'bg-white dark:bg-card'}
                            onClick={() => setPeriod(opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-muted-foreground">
                        <BarChart3 className="size-4 text-slate-500 dark:text-muted-foreground" />
                        Rank By
                      </label>
                      <div className="flex gap-2">
                        {metricOptions.map((opt) => (
                          <Button
                            key={opt.value}
                            type="button"
                            variant={metric === opt.value ? 'default' : 'outline'}
                            size="sm"
                            className={metric === opt.value ? 'bg-[#8dc63f] text-[#0A1F44] hover:bg-[#7ab82e]' : 'bg-white dark:bg-card'}
                            onClick={() => setMetric(opt.value)}
                          >
                            {opt.label}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {error && (
                <Card className="rounded-lg border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-500/15 py-0 shadow-sm">
                  <CardContent className="flex items-start gap-3 p-5 text-sm text-red-700 dark:text-red-300">
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    <span>{error}</span>
                  </CardContent>
                </Card>
              )}

              {loading ? (
                <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                  <CardContent className="space-y-3 p-5">
                    {[...Array(6)].map((_, index) => (
                      <Skeleton key={index} className="h-12 w-full rounded-lg" />
                    ))}
                  </CardContent>
                </Card>
              ) : (
                <LeaderboardTable entries={leaderboard} currentUserId={user?.uid} metric={metric} />
              )}

              <Card className="rounded-lg border-slate-200 dark:border-border bg-white dark:bg-card py-0 shadow-sm">
                <CardContent className="flex items-start gap-3 p-5">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#8dc63f]/10 text-[#5f8f20]">
                    <Info className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0A1F44] dark:text-foreground">Scoring reference</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-muted-foreground">
                      Rankings use approved sales data for the selected period. Point values can vary by product and plan.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1 bg-slate-100 dark:bg-muted text-slate-700 dark:text-muted-foreground">
                        <Trophy className="size-3" />
                        Approved points
                      </Badge>
                      <Badge variant="secondary" className="gap-1 bg-slate-100 dark:bg-muted text-slate-700 dark:text-muted-foreground">
                        <BarChart3 className="size-3" />
                        Approved sales
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
