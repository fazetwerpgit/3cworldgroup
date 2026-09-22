import type { LeaderboardMetric, LeaderboardPeriod } from './LeaderboardTable';
import styles from './leaderboard.module.css';

const periods: { value: LeaderboardPeriod; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All time' },
];

const metrics: { value: LeaderboardMetric; label: string }[] = [
  { value: 'totalPoints', label: 'Points' },
  { value: 'totalSales', label: 'Sales' },
];

interface LeaderboardFiltersProps {
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  onMetricChange: (metric: LeaderboardMetric) => void;
}

export function LeaderboardFilters({
  period,
  metric,
  onPeriodChange,
  onMetricChange,
}: LeaderboardFiltersProps) {
  return (
    <div className={styles.filters}>
      <div role="group" aria-label="Leaderboard period">
        {periods.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={period === option.value}
            onClick={() => onPeriodChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Leaderboard metric">
        {metrics.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={metric === option.value}
            onClick={() => onMetricChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
