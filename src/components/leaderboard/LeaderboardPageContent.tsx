'use client';

import { AlertCircle, RotateCw } from 'lucide-react';
import { LeaderboardFilters } from './LeaderboardFilters';
import { LeaderboardSkeleton } from './LeaderboardSkeleton';
import {
  LeaderboardTable,
  type LeaderboardEntry,
  type LeaderboardMetric,
  type LeaderboardPeriod,
  type LeaderboardViewer,
} from './LeaderboardTable';
import type { RecentSale, UnrankedRep } from '@/lib/leaderboard/team';
import { periodLabel } from './PeriodCountdown';
import type { MonthNav } from './MonthNav';
import type { BoardSwitch } from './BoardSwitch';
import type { MonthKey } from '@/lib/sales/monthWindow';
import styles from './leaderboard.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import s from '@/components/portal/rep/rep.module.css';
import { cacheTimeLabel } from '@/lib/cache/dataCache';

interface LeaderboardPageContentProps {
  entries: LeaderboardEntry[];
  currentUser?: LeaderboardEntry | null;
  viewer?: LeaderboardViewer | null;
  /** The team at 0 and the newest sales (?include=team). */
  unranked?: UnrankedRep[];
  recent?: RecentSale[];
  loading: boolean;
  error: string | null;
  /** A quiet refresh failed with the board still showing: when it was loaded. */
  staleAt?: number | null;
  /** Loads the board again after a failed load. */
  onRetry?: () => void;
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  onPeriodChange: (period: LeaderboardPeriod) => void;
  onMetricChange: (metric: LeaderboardMetric) => void;
  /** The month board's stepper (period 'month' only). */
  monthNav?: MonthNav | null;
  /** The past month on show; null for the live board. */
  pastMonth?: MonthKey | null;
  /** False while the desktop board is the visible one. The countdown's clock
   *  stops there; nothing on this page is on screen to read it. */
  active?: boolean;
  /** Fiber | Solar, for a viewer with both boards; null shows the one board. */
  boardSwitch?: BoardSwitch | null;
}

/** The phone leaderboard: head, filters, the podium on its stage (with the
 *  period clock), ranked rows. It is the page below 1024px only — the route
 *  renders LeaderboardDesktop above that, built from the same pieces. The
 *  board data and the filter state come from the route, which is the one fetch
 *  both pages share. */
export function LeaderboardPageContent({
  entries,
  currentUser,
  viewer,
  unranked,
  recent,
  loading,
  error,
  staleAt = null,
  onRetry,
  period,
  metric,
  onPeriodChange,
  onMetricChange,
  monthNav = null,
  pastMonth = null,
  active = true,
  boardSwitch = null,
}: LeaderboardPageContentProps) {
  if (!active) return null;

  return (
    <div className={`${styles.scope} ${styles.shell}`}>
      <header className={p.head}>
        <h1 className={`${p.title} ${styles.pageTitle}`}>Leaderboard</h1>
        <p className={p.lede}>{periodLabel(period, metric, pastMonth)}</p>
      </header>
      <LeaderboardFilters
        period={period}
        metric={metric}
        onPeriodChange={onPeriodChange}
        onMetricChange={onMetricChange}
        monthNav={monthNav}
        boardSwitch={boardSwitch}
      />
      {/* A failed load: plain words and a retry, never the raw request error. */}
      {error && !loading ? (
        <div className={styles.error} role="alert">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{entries.length > 0 ? "Couldn't refresh the board" : "Couldn't load the board"}</span>
          {onRetry ? (
            <button type="button" className={`${s.retry} ${styles.errorRetry}`} onClick={onRetry}>
              <RotateCw size={14} aria-hidden="true" /> Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {!error && !loading && staleAt !== null && entries.length > 0 ? (
        <p className={p.hint} role="status">
          Couldn&apos;t refresh · as of {cacheTimeLabel(staleAt)}
        </p>
      ) : null}
      {loading ? (
        <LeaderboardSkeleton />
      ) : error && entries.length === 0 ? null : (
        <LeaderboardTable
          entries={entries}
          currentUser={currentUser}
          viewer={viewer}
          unranked={unranked}
          recent={recent}
          metric={metric}
          period={period}
          pastMonth={pastMonth}
        />
      )}
    </div>
  );
}
