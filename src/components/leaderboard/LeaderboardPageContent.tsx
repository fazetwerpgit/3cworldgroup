'use client';

import { AlertCircle } from 'lucide-react';
import { LeaderboardFilters } from './LeaderboardFilters';
import { LeaderboardSkeleton } from './LeaderboardSkeleton';
import {
  LeaderboardTable,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type LeaderboardViewer,
} from './LeaderboardTable';
import { PeriodCountdown, periodLabel } from './PeriodCountdown';
import styles from './leaderboard.module.css';

interface LeaderboardPageContentProps {
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  viewer?: LeaderboardViewer | null;
  loading: boolean;
  error: string | null;
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  onMetricChange: (metric: LeaderboardMetric) => void;
  /** False while the desktop board is the visible one. The countdown's clock
   *  stops there; nothing on this page is on screen to read it. */
  active?: boolean;
}

/** The phone leaderboard: header, countdown, filters, podium, ranked rows.
 *  It is the page below 1024px only — the route renders the legacy desktop
 *  board above that — so nothing here has a desktop layout. The board data and
 *  the filter state come from the route, which is the one fetch both pages
 *  share. */
export function LeaderboardPageContent({
  entries,
  currentUser,
  viewer,
  loading,
  error,
  period,
  metric,
  onPeriodChange,
  onMetricChange,
  active = true,
}: LeaderboardPageContentProps) {
  if (!active) return null;

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <h1 className="portal-display">Leaderboard</h1>
        <p>{periodLabel(period, metric)}</p>
        <PeriodCountdown period={period} />
      </header>
      <LeaderboardFilters
        period={period}
        metric={metric}
        onPeriodChange={onPeriodChange}
        onMetricChange={onMetricChange}
      />
      {error ? (
        <div className={styles.error} role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          {error}
        </div>
      ) : null}
      {loading ? (
        <LeaderboardSkeleton />
      ) : (
        <LeaderboardTable
          entries={entries}
          currentUser={currentUser}
          viewer={viewer}
          metric={metric}
          period={period}
        />
      )}
    </div>
  );
}
