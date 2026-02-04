'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';

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

export function DashboardStats() {
  const { user, hasPermission } = useAuth();
  const [stats, setStats] = useState<SalesStats | null>(null);
  const [leaderboardRank, setLeaderboardRank] = useState<LeaderboardRank | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!user) return;

      try {
        // Fetch sales stats for this user
        const statsRes = await fetch(`/api/portal/sales/stats?salesRepId=${user.uid}&period=month`);
        if (statsRes.ok) {
          const data = await statsRes.json();
          setStats(data.stats);
        }

        // Fetch leaderboard to find user's rank
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

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-US').format(num);
  };

  const getChangeDisplay = (change: number) => {
    if (change === 0) return null;
    const isPositive = change > 0;
    return {
      text: `${isPositive ? '+' : ''}${change}% from last month`,
      type: isPositive ? 'positive' : 'negative',
    };
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 p-4 sm:p-6 border border-white/10">
            <div className="animate-pulse space-y-3 sm:space-y-4">
              <div className="h-10 w-10 sm:h-12 sm:w-12 bg-white/10 rounded-xl"></div>
              <div className="h-3 sm:h-4 w-20 sm:w-24 bg-white/10 rounded"></div>
              <div className="h-6 sm:h-8 w-12 sm:w-16 bg-white/10 rounded"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const statCards = [
    {
      title: 'Your Points',
      value: formatNumber(stats?.approvedPoints || 0),
      change: stats?.pointsChange ? getChangeDisplay(stats.pointsChange) : null,
      icon: (
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ),
      iconBg: 'from-[#8dc63f] to-[#6ba32e]',
      glowColor: 'rgba(141, 198, 63, 0.3)',
      animation: '',
      emoji: '⭐',
      permissions: ['sales:read'],
      isEmpty: (stats?.approvedPoints || 0) === 0,
      emptyText: 'Start earning!',
    },
    {
      title: 'Sales This Month',
      value: stats?.totalSales || 0,
      change: stats?.salesChange ? getChangeDisplay(stats.salesChange) : null,
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
      iconBg: 'from-blue-500 to-blue-600',
      glowColor: 'rgba(59, 130, 246, 0.3)',
      animation: '',
      emoji: '📈',
      permissions: ['sales:read'],
      isEmpty: (stats?.totalSales || 0) === 0,
      emptyText: 'Log your first!',
    },
    {
      title: 'Pending Approvals',
      value: stats?.pendingCount || 0,
      change: stats?.pendingCount && stats.pendingCount > 0
        ? { text: `${stats.pendingCount} awaiting`, type: 'neutral' as const }
        : null,
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
      iconBg: 'from-amber-500 to-orange-500',
      glowColor: 'rgba(245, 158, 11, 0.3)',
      animation: '',
      emoji: '⏳',
      permissions: ['sales:read'],
      isEmpty: (stats?.pendingCount || 0) === 0,
      emptyText: 'All caught up!',
    },
    {
      title: 'Leaderboard Rank',
      value: leaderboardRank?.rank ? `#${leaderboardRank.rank}` : '--',
      change: leaderboardRank?.rank && leaderboardRank.rank <= 3
        ? { text: `Top ${leaderboardRank.rank}! 🔥`, type: 'positive' as const }
        : leaderboardRank?.rank && leaderboardRank.rank <= 10
        ? { text: 'Top 10!', type: 'positive' as const }
        : null,
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
      iconBg: leaderboardRank?.rank === 1 ? 'from-yellow-400 to-amber-500' :
               leaderboardRank?.rank === 2 ? 'from-gray-300 to-gray-400' :
               leaderboardRank?.rank === 3 ? 'from-amber-600 to-amber-700' :
               'from-purple-500 to-purple-600',
      glowColor: leaderboardRank?.rank === 1 ? 'rgba(251, 191, 36, 0.4)' :
                 leaderboardRank?.rank === 2 ? 'rgba(156, 163, 175, 0.4)' :
                 leaderboardRank?.rank === 3 ? 'rgba(217, 119, 6, 0.4)' :
                 'rgba(139, 92, 246, 0.3)',
      animation: '',
      emoji: leaderboardRank?.rank === 1 ? '🥇' :
             leaderboardRank?.rank === 2 ? '🥈' :
             leaderboardRank?.rank === 3 ? '🥉' : '🏆',
      permissions: ['leaderboard:read'],
      isEmpty: !leaderboardRank?.rank,
      emptyText: 'Make some sales!',
    },
  ];

  const visibleStats = statCards.filter((stat) => {
    if (!stat.permissions || stat.permissions.length === 0) return true;
    return stat.permissions.some((p) => hasPermission(p));
  });

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
      {visibleStats.map((stat, index) => (
        <div
          key={stat.title}
          className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 p-4 sm:p-6 border border-white/10 hover:border-white/20 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
          style={{
            animationDelay: `${index * 100}ms`,
            boxShadow: `0 0 40px ${stat.glowColor}`,
          }}
        >
          {/* Glow effect on hover */}
          <div
            className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
            style={{ background: `radial-gradient(circle at 50% 0%, ${stat.glowColor}, transparent 70%)` }}
          ></div>

          {/* Floating particles */}
          <div className="absolute top-0 right-0 w-16 sm:w-20 h-16 sm:h-20 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-all"></div>

          <div className="relative">
            {/* Header with icon and emoji */}
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <div className={`p-2 sm:p-3 rounded-lg sm:rounded-xl bg-gradient-to-br ${stat.iconBg} text-white shadow-lg transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3`}>
                <div className="w-5 h-5 sm:w-7 sm:h-7 [&>svg]:w-full [&>svg]:h-full">
                  {stat.icon}
                </div>
              </div>
              <span className="text-xl sm:text-2xl">{stat.emoji}</span>
            </div>

            {/* Title */}
            <h3 className="text-xs sm:text-sm font-medium text-white/60 mb-1">{stat.title}</h3>

            {/* Value with animation */}
            <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2">
              <p className={`text-xl sm:text-3xl font-bold ${stat.isEmpty ? 'text-white/30' : 'text-white'} animate-counter-climb`}>
                {stat.value}
              </p>
              {stat.isEmpty && (
                <span className="text-[10px] sm:text-xs bg-white/10 text-white/50 px-2 py-0.5 sm:py-1 rounded-full w-fit">
                  {stat.emptyText}
                </span>
              )}
            </div>

            {/* Change indicator */}
            {stat.change && !stat.isEmpty && (
              <p
                className={`text-xs sm:text-sm mt-2 sm:mt-3 flex items-center gap-1 ${
                  stat.change.type === 'positive'
                    ? 'text-[#8dc63f]'
                    : stat.change.type === 'negative'
                    ? 'text-red-400'
                    : 'text-white/50'
                }`}
              >
                {stat.change.type === 'positive' && (
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                {stat.change.type === 'negative' && (
                  <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                <span className="truncate">{stat.change.text}</span>
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
