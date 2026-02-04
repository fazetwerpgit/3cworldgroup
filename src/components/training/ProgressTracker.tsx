'use client';

interface ProgressTrackerProps {
  completed: number;
  total: number;
  percentage: number;
}

export function ProgressTracker({ completed, total, percentage }: ProgressTrackerProps) {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#0A1F44]">Your Progress</h2>
        <span className="text-2xl font-bold text-[#8dc63f]">{percentage}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-3 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-[#8dc63f] to-[#7ab82e] rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      {/* Stats */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          <span className="font-semibold text-[#0A1F44]">{completed}</span> of{' '}
          <span className="font-semibold text-[#0A1F44]">{total}</span> modules completed
        </span>
        {percentage === 100 ? (
          <span className="text-[#8dc63f] font-medium flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All complete!
          </span>
        ) : (
          <span className="text-gray-500">
            {total - completed} remaining
          </span>
        )}
      </div>
    </div>
  );
}
