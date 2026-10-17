'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FIRST_LEADERBOARD_BOARD, useLeaderboard } from '@/hooks/useLeaderboard';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { LeaderboardPageContent } from './LeaderboardPageContent';
import { LegacyLeaderboardPage } from './legacy/LegacyLeaderboardPage';
import type { LeaderboardMetric, LeaderboardPeriod } from './LeaderboardTable';
import { useWideViewport } from './useWideViewport';
import type { MonthNav } from './MonthNav';
import { formatMonthParam, monthKeyFromParam } from '@/lib/leaderboard/periods';
import { chicagoMonthKey, compareMonths, type MonthKey } from '@/lib/sales/monthWindow';
import split from './routeSplit.module.css';

/* Two leaderboards, one board.
 *
 *  A phone gets the redesign; 1024px and up gets the page as it shipped on
 *  master. The period, the metric and the fetch live here so that both sides
 *  read the same board and only one request goes out, whichever is on screen.
 *  The filter controls in each page write back through the callbacks. */
const FIRST_BOARD = FIRST_LEADERBOARD_BOARD;

export function LeaderboardRoute() {
  const { user } = useAuth();
  // Seeded with the board fetched first below (week, points, team), so a revisit paints it at once.
  const { leaderboard, currentUser, unranked, recent, firstMonth, loading, error, staleAt, fetchLeaderboard } =
    useLeaderboard(FIRST_BOARD);
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [metric, setMetric] = useState<LeaderboardMetric>('totalPoints');
  // The month board's month: null is this month (on the office clock, as the
  // server counts it). A past month stays picked across period taps.
  const [month, setMonth] = useState<MonthKey | null>(null);
  const wide = useWideViewport();

  const monthParam = period === 'month' && month ? formatMonthParam(month) : null;
  const pastMonth = monthParam ? month : null;

  useEffect(() => {
    if (user) fetchLeaderboard(period, metric, 100, 'approved', { team: true, ...(monthParam ? { month: monthParam } : {}) });
  }, [user, period, metric, monthParam, fetchLeaderboard]);

  // Reopened after a while: the same board, reloaded in place. A load already
  // under way (a filter tap) is left to land on its own.
  const refreshQuietly = useCallback(() => {
    if (!user || loading) return;
    return fetchLeaderboard(period, metric, 100, 'approved', { team: true, quiet: true, ...(monthParam ? { month: monthParam } : {}) });
  }, [user, loading, period, metric, monthParam, fetchLeaderboard]);
  useRefreshOnResume(refreshQuietly, { enabled: !!user });
  // Retry keeps a board that is showing (quiet: no skeleton); only an empty
  // screen goes back to its loading state.
  const hasBoard = leaderboard.length > 0;
  const retry = useCallback(() => {
    if (user) void fetchLeaderboard(period, metric, 100, 'approved', { team: true, quiet: hasBoard, ...(monthParam ? { month: monthParam } : {}) });
  }, [user, period, metric, monthParam, hasBoard, fetchLeaderboard]);

  const busy = loading || !user;

  // ‹ Month › on the month board: back to the first month with a sale, forward
  // to this month. Until the first answer lands there is no going back.
  const monthNav = useMemo<MonthNav | null>(() => {
    if (period !== 'month') return null;
    const current = chicagoMonthKey(new Date());
    const shown = month ?? current;
    return {
      month: shown,
      max: current,
      min: monthKeyFromParam(firstMonth) ?? shown,
      onChange: (next) => setMonth(compareMonths(next, current) >= 0 ? null : next),
    };
  }, [period, month, firstMonth]);

  return (
    <>
      <div className={split.phoneOnly}>
        <LeaderboardPageContent
          entries={leaderboard}
          currentUser={currentUser}
          viewer={user ? { uid: user.uid, displayName: user.displayName, avatarUrl: user.avatarUrl } : null}
          unranked={unranked}
          recent={recent}
          loading={busy}
          error={error}
          staleAt={staleAt}
          onRetry={retry}
          period={period}
          metric={metric}
          onPeriodChange={setPeriod}
          onMetricChange={setMetric}
          monthNav={monthNav}
          pastMonth={pastMonth}
          active={!wide}
        />
      </div>
      {/* D is dark only, so the desktop board always takes its dark theme: the
          wrapper pair re-creates the `.dark .portal-scope` context the board's
          tokens and dark: variants read, whatever the portal theme setting. */}
      <div className={`dark ${split.desktopOnly}`}>
        <div className="portal-scope contents">
          <LegacyLeaderboardPage
            active={wide}
            entries={leaderboard}
            currentUser={currentUser}
            loading={busy}
            error={error}
            period={period}
            metric={metric}
            onPeriodChange={setPeriod}
            onMetricChange={setMetric}
            monthNav={monthNav}
            pastMonth={pastMonth}
            viewerName={user?.displayName ?? user?.email ?? null}
            viewerId={user?.uid ?? null}
            unranked={unranked}
            recent={recent}
          />
        </div>
      </div>
    </>
  );
}
