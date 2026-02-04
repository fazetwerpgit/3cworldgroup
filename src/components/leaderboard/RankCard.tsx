'use client';

interface RankCardProps {
  rank: number | null;
  totalSales: number;
  totalPoints: number;
}

export function RankCard({ rank, totalSales, totalPoints }: RankCardProps) {
  const formatPoints = (points: number) => {
    return new Intl.NumberFormat('en-US').format(points);
  };

  const getRankConfig = (rank: number | null) => {
    if (!rank) return { emoji: '🎮', gradient: 'from-gray-700 to-gray-800', glow: 'shadow-gray-500/20' };
    if (rank === 1) return { emoji: '🥇', gradient: 'from-yellow-400 to-amber-500', glow: 'shadow-yellow-500/40' };
    if (rank === 2) return { emoji: '🥈', gradient: 'from-gray-300 to-gray-400', glow: 'shadow-gray-400/40' };
    if (rank === 3) return { emoji: '🥉', gradient: 'from-amber-600 to-amber-700', glow: 'shadow-amber-600/40' };
    if (rank <= 10) return { emoji: '🔥', gradient: 'from-purple-500 to-pink-500', glow: 'shadow-purple-500/40' };
    return { emoji: '💪', gradient: 'from-blue-500 to-blue-600', glow: 'shadow-blue-500/30' };
  };

  const config = getRankConfig(rank);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10">
      {/* Animated background glow */}
      <div className={`absolute inset-0 bg-gradient-to-br ${config.gradient} opacity-10`}></div>
      <div className="absolute top-0 right-0 w-48 h-48 bg-[#8dc63f]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 animate-pulse"></div>
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-white/5 rounded-full blur-2xl translate-y-1/2 -translate-x-1/2"></div>

      <div className="relative p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">📊</span> Your Standing
            </h2>
            <p className="text-white/50 text-sm mt-1">This month's performance</p>
          </div>

          {/* Rank Badge */}
          <div className="text-center">
            {rank ? (
              <div className={`relative p-4 rounded-2xl bg-gradient-to-br ${config.gradient} shadow-lg ${config.glow} ${rank <= 3 ? 'animate-float' : ''}`}>
                <span className="text-4xl block mb-1">{config.emoji}</span>
                <span className="text-3xl font-black text-white">#{rank}</span>
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-white/5 border border-white/10">
                <span className="text-4xl block mb-1">🎮</span>
                <span className="text-xl font-bold text-white/40">--</span>
              </div>
            )}
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="group relative overflow-hidden p-5 rounded-xl bg-gradient-to-br from-[#8dc63f]/20 to-[#8dc63f]/10 border border-[#8dc63f]/30 hover:border-[#8dc63f]/50 transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-[#8dc63f]/0 to-[#8dc63f]/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-6 h-6 text-[#8dc63f] animate-twinkle" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              </div>
              <p className={`text-4xl font-black ${totalPoints > 0 ? 'text-[#8dc63f]' : 'text-white/30'} animate-counter-climb`}>
                {formatPoints(totalPoints)}
              </p>
              <p className="text-sm text-white/60 mt-2 font-medium">Total Points</p>
            </div>
          </div>

          <div className="group relative overflow-hidden p-5 rounded-xl bg-white/5 border border-white/10 hover:border-white/20 transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-white/0 to-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="relative text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <p className={`text-4xl font-black ${totalSales > 0 ? 'text-white' : 'text-white/30'} animate-counter-climb`}>
                {totalSales}
              </p>
              <p className="text-sm text-white/60 mt-2 font-medium">Approved Sales</p>
            </div>
          </div>
        </div>

        {/* Motivational message */}
        {!rank && totalSales === 0 && (
          <div className="mt-5 p-4 bg-white/5 rounded-xl border border-white/10 text-center">
            <span className="text-2xl mr-2">🚀</span>
            <span className="text-white/70">Log your first sale to start climbing!</span>
          </div>
        )}

        {rank && rank === 1 && (
          <div className="mt-5 p-4 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 rounded-xl border border-yellow-500/30 text-center animate-pulse">
            <span className="text-2xl mr-2">👑</span>
            <span className="text-yellow-300 font-semibold">You're #1! Absolute legend! 🐐</span>
          </div>
        )}

        {rank && rank > 1 && rank <= 3 && (
          <div className="mt-5 p-4 bg-gradient-to-r from-[#8dc63f]/20 to-[#6ba32e]/20 rounded-xl border border-[#8dc63f]/30 text-center">
            <span className="text-2xl mr-2">🔥</span>
            <span className="text-[#8dc63f] font-semibold">Top 3! You're on fire!</span>
          </div>
        )}

        {rank && rank > 3 && rank <= 10 && (
          <div className="mt-5 p-4 bg-purple-500/10 rounded-xl border border-purple-500/30 text-center">
            <span className="text-2xl mr-2">⚡</span>
            <span className="text-purple-300 font-semibold">Top 10! Keep pushing!</span>
          </div>
        )}
      </div>
    </div>
  );
}
