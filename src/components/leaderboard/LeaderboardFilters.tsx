import type { LeaderboardMetric, LeaderboardPeriod } from './LeaderboardTable';
import type { MonthNav } from './MonthNav';
import type { BoardSwitch } from './BoardSwitch';
import { MonthPicker } from '@/components/portal/rep/MonthPicker';
import styles from './leaderboard.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import tx from '@/components/portal/rep/rep-taste.module.css';
import { BOARD_OPTIONS } from './BoardSwitch';
import { SOLAR_METRIC_OPTIONS, isSolarMetric } from './solarMetrics';

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
  /** ‹ Month › under the chips, on the month board only. */
  monthNav?: MonthNav | null;
  /** Fiber | Solar, for a viewer who has both boards (a dual rep, an admin). */
  boardSwitch?: BoardSwitch | null;
}

export function LeaderboardFilters({
  period,
  metric,
  onPeriodChange,
  onMetricChange,
  monthNav,
  boardSwitch = null,
}: LeaderboardFiltersProps) {
  return (
    <div className={styles.filters}>
      {/* Fiber | Solar picks the board itself, so it sits above the rest. */}
      {boardSwitch ? (
        <div className={tx.side} role="group" aria-label="Leaderboard">
          {BOARD_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={tx.sideBtn}
              aria-pressed={boardSwitch.board === option.value}
              onClick={() => boardSwitch.onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {/* Points | Sales (fiber) or Set | Demoed | Closed (solar) switches what
          the board is ranked by: the lime switch. */}
      <div className={tx.seg} role="group" aria-label="Leaderboard metric">
        {(isSolarMetric(metric) ? SOLAR_METRIC_OPTIONS : metrics).map((option) => (
          <button
            key={option.value}
            type="button"
            className={tx.segBtn}
            aria-pressed={metric === option.value}
            onClick={() => onMetricChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {/* Week / Month / Year / All time only filters the same board: filled chips. */}
      <div className={p.chipRow} role="group" aria-label="Leaderboard period">
        {periods.map((option) => (
          <button
            key={option.value}
            type="button"
            className={tx.chip}
            aria-pressed={period === option.value}
            onClick={() => onPeriodChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {/* The Sales page's month stepper: earlier months, recounted live. */}
      {period === 'month' && monthNav ? (
        <MonthPicker month={monthNav.month} min={monthNav.min} max={monthNav.max} onChange={monthNav.onChange} />
      ) : null}
    </div>
  );
}
