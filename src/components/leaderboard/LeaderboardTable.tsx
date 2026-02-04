'use client';

interface LeaderboardEntry {
  rank: number;
  salesRepId: string;
  salesRepName: string;
  totalSales: number;
  totalPoints: number;
}

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  currentUserId?: string;
  metric: 'totalPoints' | 'totalSales';
}

export function LeaderboardTable({ entries, currentUserId, metric }: LeaderboardTableProps) {
  const formatPoints = (points: number) => {
    return new Intl.NumberFormat('en-US').format(points);
  };

  const getMetricValue = (entry: LeaderboardEntry) => {
    switch (metric) {
      case 'totalSales':
        return entry.totalSales.toString();
      case 'totalPoints':
      default:
        return formatPoints(entry.totalPoints);
    }
  };

  const getRankConfig = (rank: number) => {
    if (rank === 1) return { emoji: '🥇', gradient: 'from-yellow-400 to-amber-500', border: 'border-yellow-500/50', bg: 'bg-yellow-500/10' };
    if (rank === 2) return { emoji: '🥈', gradient: 'from-gray-300 to-gray-400', border: 'border-gray-400/50', bg: 'bg-gray-300/10' };
    if (rank === 3) return { emoji: '🥉', gradient: 'from-amber-600 to-amber-700', border: 'border-amber-600/50', bg: 'bg-amber-600/10' };
    return { emoji: '', gradient: '', border: 'border-transparent', bg: '' };
  };

  if (entries.length === 0) {
    return (
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-12 border border-white/10 text-center">
        <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg
            className="w-8 h-8 text-white/30"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <p className="text-white font-semibold text-lg">No rankings yet</p>
        <p className="text-white/50 mt-2">Be the first to make some sales and claim #1! 🏆</p>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl border border-white/10 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0A1F44] to-[#1a3a6e] px-6 py-4 grid grid-cols-12 gap-4">
        <div className="col-span-1 text-xs font-bold text-white/60 uppercase tracking-wider">#</div>
        <div className="col-span-6 text-xs font-bold text-white/60 uppercase tracking-wider">Player</div>
        <div className="col-span-3 text-xs font-bold text-white/60 uppercase tracking-wider text-right">
          {metric === 'totalPoints' ? 'Points' : 'Sales'}
        </div>
        <div className="col-span-2 text-xs font-bold text-white/60 uppercase tracking-wider text-right">Sales</div>
      </div>

      {/* Entries */}
      <div className="divide-y divide-white/5">
        {entries.map((entry, index) => {
          const isCurrentUser = entry.salesRepId === currentUserId;
          const isTopThree = entry.rank <= 3;
          const config = getRankConfig(entry.rank);

          return (
            <div
              key={entry.salesRepId}
              className={`px-6 py-4 grid grid-cols-12 gap-4 items-center transition-all duration-200 hover:bg-white/5 ${
                isCurrentUser ? 'bg-[#8dc63f]/10 border-l-4 border-[#8dc63f]' : isTopThree ? config.bg : ''
              } ${index === 0 ? '' : ''}`}
              style={{
                animationDelay: `${index * 50}ms`,
              }}
            >
              {/* Rank */}
              <div className="col-span-1">
                {isTopThree ? (
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${config.gradient} flex items-center justify-center shadow-lg ${entry.rank === 1 ? 'animate-float' : ''}`}>
                    <span className="text-xl">{config.emoji}</span>
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center">
                    <span className="text-white/60 font-bold">#{entry.rank}</span>
                  </div>
                )}
              </div>

              {/* Name */}
              <div className="col-span-6 flex items-center gap-3">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  isTopThree ? `bg-gradient-to-br ${config.gradient}` : 'bg-white/10'
                }`}>
                  <span className="text-lg font-bold text-white">
                    {entry.salesRepName.charAt(0).toUpperCase()}
                  </span>
                </div>
                <div>
                  <div className={`font-semibold text-lg ${isCurrentUser ? 'text-[#8dc63f]' : 'text-white'}`}>
                    {entry.salesRepName}
                    {isCurrentUser && (
                      <span className="ml-2 text-xs bg-[#8dc63f] text-white px-2 py-1 rounded-full animate-pulse">YOU</span>
                    )}
                  </div>
                  {isTopThree && (
                    <div className="text-xs text-white/40 mt-0.5">
                      {entry.rank === 1 ? '👑 Champion' : entry.rank === 2 ? '⚡ Runner Up' : '🔥 Top 3'}
                    </div>
                  )}
                </div>
              </div>

              {/* Points/Primary Metric */}
              <div className="col-span-3 text-right">
                <span className={`font-black text-2xl ${metric === 'totalPoints' ? 'text-[#8dc63f]' : 'text-white'}`}>
                  {getMetricValue(entry)}
                </span>
                <span className="text-white/40 text-sm ml-1">{metric === 'totalPoints' ? 'pts' : ''}</span>
              </div>

              {/* Sales Count */}
              <div className="col-span-2 text-right">
                <span className="text-white/60 bg-white/5 px-3 py-1.5 rounded-lg font-medium">
                  {entry.totalSales} {entry.totalSales === 1 ? 'sale' : 'sales'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
