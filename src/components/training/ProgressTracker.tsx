'use client';

interface ProgressTrackerProps {
  completed: number;
  total: number;
  percentage: number;
}

export function ProgressTracker({ completed, total, percentage }: ProgressTrackerProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-[#0A1F44]">My Path Progress</h2>
          <p className="mt-1 text-sm text-slate-500">
            Training modules completed across your assigned resources.
          </p>
        </div>
        <span className="text-2xl font-semibold text-[#5a8f1f]">{percentage}%</span>
      </div>

      <div className="mb-4 h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#8dc63f] transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          <span className="font-semibold text-[#0A1F44]">{completed}</span> of{' '}
          <span className="font-semibold text-[#0A1F44]">{total}</span> modules completed
        </span>
        {percentage === 100 ? (
          <span className="flex items-center gap-1 font-medium text-[#5a8f1f]">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            All complete
          </span>
        ) : (
          <span className="text-slate-500">{total - completed} remaining</span>
        )}
      </div>
    </div>
  );
}
