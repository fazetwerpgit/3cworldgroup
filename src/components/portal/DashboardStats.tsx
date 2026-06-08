'use client';

import { useEffect, useState } from 'react';
import { Award, BarChart3, CheckCircle2, Clock3, TrendingDown, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
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
        const statsRes = await fetch(`/api/portal/sales/stats?salesRepId=${user.uid}&period=month`);
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data.stats);
        }

        const leaderboardRes = await fetch('/api/portal/leaderboard?period=month&metric=totalPoints&limit=100');
        if (leaderboardRes.ok) {
          const data = await leaderboardRes.json();
          const userEntry = data.leaderboard?.find((e: { salesRepId: string }) => e.salesRepId === user.uid);
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
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-16" />
              <Skeleton className="mt-3 h-4 w-32" />
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

  const changeClass = (type: ChangeType) => {
    if (type === 'positive') return 'text-green-700 bg-green-50';
    if (type === 'negative') return 'text-red-700 bg-red-50';
    return 'text-slate-700 bg-slate-100';
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {visibleStats.map((stat) => (
        <Card key={stat.title} className="border-slate-200 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-slate-600">{stat.title}</p>
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#8dc63f]/10 text-[#5a8f1f]">
                {stat.icon}
              </span>
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-semibold text-slate-950">{stat.value}</p>
                <p className="mt-1 text-xs text-slate-500">{stat.helper}</p>
              </div>
              {stat.change && (
                <Badge className={`rounded-md gap-1 ${changeClass(stat.change.type)}`} variant="secondary">
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
