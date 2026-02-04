'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import { LeaderboardTable } from '@/components/leaderboard/LeaderboardTable';
import { RankCard } from '@/components/leaderboard/RankCard';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useAuth } from '@/contexts/AuthContext';

type Period = 'week' | 'month' | 'year' | 'all';
type Metric = 'totalPoints' | 'totalSales';

const periodOptions: { value: Period; label: string; emoji: string }[] = [
  { value: 'week', label: 'This Week', emoji: '📅' },
  { value: 'month', label: 'This Month', emoji: '📆' },
  { value: 'year', label: 'This Year', emoji: '🗓️' },
  { value: 'all', label: 'All Time', emoji: '♾️' },
];

const metricOptions: { value: Metric; label: string; icon: string }[] = [
  { value: 'totalPoints', label: 'Points', icon: '⭐' },
  { value: 'totalSales', label: 'Sales', icon: '📊' },
];

export default function LeaderboardPage() {
  const { user } = useAuth();
  const { leaderboard, loading, error, fetchLeaderboard, getUserRank } = useLeaderboard();
  const [period, setPeriod] = useState<Period>('month');
  const [metric, setMetric] = useState<Metric>('totalPoints');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    fetchLeaderboard(period, metric, 20);
  }, [period, metric, fetchLeaderboard]);

  const userRank = user ? getUserRank(user.uid) : null;

  return (
    <ProtectedRoute permissions={['leaderboard:read']}>
      <div className="min-h-screen bg-gradient-to-br from-gray-100 via-gray-50 to-gray-100">
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          <main className="flex-1 p-6 overflow-auto">
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Header with animated background */}
              <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A1F44] via-[#1a3a6e] to-[#0f2744] p-8 transition-all duration-700 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                {/* Animated particles */}
                <div className="absolute inset-0 particles-bg"></div>
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-pulse"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#8dc63f]/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2 animate-pulse" style={{ animationDelay: '1s' }}></div>

                <div className="relative flex items-center justify-between">
                  <div>
                    <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-1.5 border border-white/20 mb-4">
                      <span className="text-2xl animate-bounce">🏆</span>
                      <span className="text-white/80 font-medium">Compete & Win!</span>
                    </div>
                    <h1 className="text-4xl font-bold text-white">Leaderboard</h1>
                    <p className="text-white/70 mt-2 text-lg">
                      Stack points, climb ranks, win prizes! 🔥
                    </p>
                  </div>
                  <div className="hidden md:block text-center">
                    <div className="text-6xl animate-float">🎯</div>
                    <p className="text-white/60 text-sm mt-2">Points = Prizes</p>
                  </div>
                </div>
              </div>

              {/* User's Rank Card */}
              <div className={`transition-all duration-700 delay-100 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <RankCard
                  rank={userRank?.rank || null}
                  totalSales={userRank?.totalSales || 0}
                  totalPoints={userRank?.totalPoints || 0}
                />
              </div>

              {/* Filters - Modern dark cards */}
              <div className={`bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-5 border border-white/10 transition-all duration-700 delay-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className="flex flex-wrap items-center gap-6">
                  {/* Period Filter */}
                  <div className="flex-1">
                    <label className="text-sm font-medium text-white/60 mb-2 block">Time Period</label>
                    <div className="flex flex-wrap gap-2">
                      {periodOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setPeriod(opt.value)}
                          className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                            period === opt.value
                              ? 'bg-gradient-to-r from-[#8dc63f] to-[#7ab82e] text-white shadow-lg shadow-[#8dc63f]/20'
                              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span>{opt.emoji}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Metric Filter */}
                  <div>
                    <label className="text-sm font-medium text-white/60 mb-2 block">Rank By</label>
                    <div className="flex gap-2">
                      {metricOptions.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => setMetric(opt.value)}
                          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 ${
                            metric === opt.value
                              ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20'
                              : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white'
                          }`}
                        >
                          <span className="text-lg">{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-300 px-5 py-4 rounded-xl text-sm flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  {error}
                </div>
              )}

              {/* Loading */}
              {loading ? (
                <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-12 border border-white/10 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 relative">
                    <div className="absolute inset-0 rounded-full border-4 border-[#8dc63f]/20"></div>
                    <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#8dc63f] animate-spin"></div>
                  </div>
                  <p className="text-white/60 text-lg">Loading rankings...</p>
                </div>
              ) : (
                <div className={`transition-all duration-700 delay-300 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                  <LeaderboardTable
                    entries={leaderboard}
                    currentUserId={user?.uid}
                    metric={metric}
                  />
                </div>
              )}

              {/* Points Info Card - Motivational */}
              <div className={`relative overflow-hidden bg-gradient-to-br from-[#8dc63f]/20 to-[#6ba32e]/10 rounded-2xl p-6 border border-[#8dc63f]/30 transition-all duration-700 delay-400 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#8dc63f]/10 rounded-full blur-2xl"></div>
                <div className="relative flex items-start gap-4">
                  <div className="p-3 bg-[#8dc63f] rounded-xl text-white animate-float">
                    <span className="text-2xl">💡</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-[#0A1F44] text-lg">How to Climb the Ranks</h3>
                    <p className="text-gray-600 mt-2">
                      Every sale earns you points! Premium plans like <strong>5 Gig fiber</strong> can earn up to <strong className="text-[#8dc63f]">15 points</strong> each.
                      Stack those points, climb the leaderboard, and win awesome prizes! 🎁
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <span className="inline-flex items-center gap-1 text-sm bg-[#8dc63f]/20 text-[#6ba32e] px-3 py-1.5 rounded-full font-semibold">
                        <span>🥇</span> Top 3 = VIP Rewards
                      </span>
                      <span className="inline-flex items-center gap-1 text-sm bg-blue-500/20 text-blue-600 px-3 py-1.5 rounded-full font-semibold">
                        <span>⭐</span> More Sales = More Points
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
