'use client';

import { useEffect, useState } from 'react';
import { Award, BarChart3, CheckCircle2, Clock3, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { useCountUp } from '@/hooks/useCountUp';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { isAbortError } from '@/lib/fetch/isAbortError';

interface SalesStats {
  totalSales: number;
  totalPoints: number;
  approvedPoints: number;
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
  salesChange: number;
  pointsChange: number;
}

interface LeaderboardRank {
  rank: number | null;
  totalPoints: number;
}

type ChangeType = 'positive' | 'negative' | 'neutral';

interface StatCard {
  title: string;
  value: string | number;
  /** When set, the value counts up from 0 on first paint. */
  numeric?: number;
  helper: string;
  change?: { text: string; type: ChangeType } | null;
  icon: React.ReactNode;
  permissions?: string[];
}

function CountUpNumber({ n }: { n: number }) {
  const value = useCountUp(n);
  return <>{new Intl.NumberFormat('en-US').format(value)}</>;
}

export function DashboardStats() {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [leaderboardRank, setLeaderboardRank] = useState<LeaderboardRank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    async function fetchStats() {
      if (!user) return;

      try {
        const statsRes = await fetch(
          `/api/portal/sales/stats?salesRepId=${user.uid}&period=month&requestedBy=${user.uid}`,
          { signal: controller.signal }
        );
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data.stats);
        }

        const token = await auth?.currentUser?.getIdToken();
        const leaderboardRes = await fetch(
          '/api/portal/leaderboard?period=month&metric=totalPoints&limit=100',
          {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
            signal: controller.signal,
          }
        );
        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          // Prefer the server-computed standing (correct even below the top-N).
          const userEntry =
            data.currentUser ??
            data.leaderboard?.find((e: { salesRepId: string }) => e.salesRepId === user.uid);
          setLeaderboardRank({
            rank: userEntry?.rank || null,
            totalPoints: userEntry?.totalPoints || 0,
          });
        }
      } catch (error) {
        if (!mounted || isAbortError(error, controller.signal)) return;
        console.error('Error fetching dashboard stats:', error);
      } finally {
        if (mounted && !controller.signal.aborted) setLoading(false);
      }
    }

    fetchStats();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [user]);

  const formatNumber = (num: number) => new Intl.NumberFormat('en-US').format(num);

  const getChangeDisplay = (change: number) => {
    if (change === 0) return null;
    const isPositive = change > 0;
    return {
      text: `${isPositive ? '+' : ''}${change}% from last month`,
      type: isPositive ? 'positive' as const : 'negative' as const,
    };
  };

  if (loading) {
    // Geometry-true skeleton: mirrors the real strip layout so nothing shifts
    // when the numbers land.
    return (
      <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-border">
        <div className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-border xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-4 dark:bg-card sm:p-5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-3 h-9 w-20" />
              <Skeleton className="mt-2.5 h-3.5 w-28" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const statCards: StatCard[] = [
    {
      title: 'Approved Points',
      value: formatNumber(stats?.approvedPoints || 0),
      numeric: stats?.approvedPoints || 0,
      helper: `${formatNumber(stats?.totalPoints || 0)} total submitted`,
      change: stats?.pointsChange ? getChangeDisplay(stats.pointsChange) : null,
      icon: <Award className="h-4 w-4" />,
      permissions: ['sales:read'],
    },
    {
      title: 'Sales This Month',
      value: stats?.totalSales || 0,
      numeric: stats?.totalSales || 0,
      helper: `${stats?.approvedCount || 0} approved, ${stats?.rejectedCount || 0} rejected`,
      change: stats?.salesChange ? getChangeDisplay(stats.salesChange) : null,
      icon: <BarChart3 className="h-4 w-4" />,
      permissions: ['sales:read'],
    },
    {
      title: 'Pending Approvals',
      value: stats?.pendingCount || 0,
      numeric: stats?.pendingCount || 0,
      helper: (stats?.pendingCount || 0) > 0 ? 'Awaiting manager review' : 'No pending sales',
      change: (stats?.pendingCount || 0) > 0
        ? { text: `${stats?.pendingCount || 0} open`, type: 'neutral' as const }
        : null,
      icon: (stats?.pendingCount || 0) > 0 ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />,
      permissions: ['sales:read'],
    },
    {
      title: 'Leaderboard Rank',
      value: leaderboardRank?.rank ? `#${leaderboardRank.rank}` : '--',
      helper: `${formatNumber(leaderboardRank?.totalPoints || 0)} points this month`,
      change: leaderboardRank?.rank && leaderboardRank.rank <= 10
        ? { text: 'Top 10', type: 'positive' as const }
        : null,
      icon: <Award className="h-4 w-4" />,
      permissions: ['leaderboard:read'],
    },
  ];

  const visibleStats = statCards.filter((stat) => {
    if (!stat.permissions || stat.permissions.length === 0) return true;
    return stat.permissions.some((p) => hasPermission(p));
  });

  const changeVariant = (type: ChangeType) =>
    type === 'positive' ? 'success' : type === 'negative' ? 'danger' : 'secondary';

  // One connected strip with hairline dividers (gap-px trick), not floating
  // cards — the numbers read as a single instrument panel. A faint lime glow
  // anchors the band; it is the only gradient on the page.
  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 shadow-sm dark:border-border">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-10"
        style={{
          background:
            'radial-gradient(ellipse 40% 90% at 10% 100%, rgba(141,198,63,0.06), transparent 70%)',
        }}
      />
      <dl className="grid grid-cols-2 gap-px bg-slate-100 dark:bg-border xl:grid-cols-4">
        {visibleStats.map((stat) => (
          <div key={stat.title} className="bg-white p-4 dark:bg-card sm:p-5">
            <dt className="flex items-center justify-between gap-3">
              <span className="portal-label truncate">{stat.title}</span>
              <span className="text-slate-300 dark:text-muted-foreground [&>svg]:h-4 [&>svg]:w-4">
                {stat.icon}
              </span>
            </dt>
            <dd className="portal-display portal-kpi mt-2.5 text-[2.1rem] text-slate-950 dark:text-foreground">
              {stat.numeric !== undefined ? <CountUpNumber n={stat.numeric} /> : stat.value}
            </dd>
            <dd className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500 dark:text-muted-foreground">
                {stat.helper}
              </span>
              {stat.change && (
                <Badge variant={changeVariant(stat.change.type)} className="gap-1 rounded-md">
                  {stat.change.type === 'positive' && <TrendingUp className="h-3 w-3" />}
                  {stat.change.type === 'negative' && <TrendingDown className="h-3 w-3" />}
                  {stat.change.text}
                </Badge>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
