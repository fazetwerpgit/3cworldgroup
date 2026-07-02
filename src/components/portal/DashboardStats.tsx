'use client';

import { useEffect, useState } from 'react';
import { Award, BarChart3, CheckCircle2, Clock3, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';

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
  helper: string;
  change?: { text: string; type: ChangeType } | null;
  icon: React.ReactNode;
  permissions?: string[];
}

export function DashboardStats() {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [leaderboardRank, setLeaderboardRank] = useState<LeaderboardRank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!user) return;

      try {
        const statsRes = await fetch(
          `/api/portal/sales/stats?salesRepId=${user.uid}&period=month&requestedBy=${user.uid}`
        );
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data.stats);
        }

        const token = await auth?.currentUser?.getIdToken();
        const leaderboardRes = await fetch(
          '/api/portal/leaderboard?period=month&metric=totalPoints&limit=100',
          { headers: token ? { Authorization: `Bearer ${token}` } : undefined }
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
        console.error('Error fetching dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
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
    // Geometry-true skeleton: mirrors the real card layout so nothing shifts
    // when the numbers land.
    return (
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-slate-200 py-0 shadow-sm dark:border-border">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-8 w-8 rounded-md" />
              </div>
              <Skeleton className="mt-3 h-8 w-20" />
              <Skeleton className="mt-2 h-3.5 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const statCards: StatCard[] = [
    {
      title: 'Approved Points',
      value: formatNumber(stats?.approvedPoints || 0),
      helper: `${formatNumber(stats?.totalPoints || 0)} total submitted`,
      change: stats?.pointsChange ? getChangeDisplay(stats.pointsChange) : null,
      icon: <Award className="h-4 w-4" />,
      permissions: ['sales:read'],
    },
    {
      title: 'Sales This Month',
      value: stats?.totalSales || 0,
      helper: `${stats?.approvedCount || 0} approved, ${stats?.rejectedCount || 0} rejected`,
      change: stats?.salesChange ? getChangeDisplay(stats.salesChange) : null,
      icon: <BarChart3 className="h-4 w-4" />,
      permissions: ['sales:read'],
    },
    {
      title: 'Pending Approvals',
      value: stats?.pendingCount || 0,
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

  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4 sm:gap-4">
      {visibleStats.map((stat) => (
        <Card key={stat.title} className="border-slate-200 py-0 shadow-sm dark:border-border">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="portal-label truncate">{stat.title}</p>
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#8dc63f]/10 text-[#5a8f1f]">
                {stat.icon}
              </span>
            </div>
            <p className="portal-kpi mt-3 text-slate-950 dark:text-foreground">{stat.value}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-xs text-slate-500 dark:text-muted-foreground">{stat.helper}</p>
              {stat.change && (
                <Badge variant={changeVariant(stat.change.type)} className="gap-1 rounded-md">
                  {stat.change.type === 'positive' && <TrendingUp className="h-3 w-3" />}
                  {stat.change.type === 'negative' && <TrendingDown className="h-3 w-3" />}
                  {stat.change.text}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
