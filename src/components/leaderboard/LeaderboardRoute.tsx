'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { FIRST_LEADERBOARD_BOARD, FIRST_SOLAR_BOARD, useLeaderboard } from '@/hooks/useLeaderboard';
import { isSolarOnlyUser } from '@/types';
import { boardsFor, type BoardSwitch, type LeaderboardBoard } from './BoardSwitch';
import { BOARD_SIDE_KEY, useRememberedSide } from '@/lib/portal/rememberedSide';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { LeaderboardPageContent } from './LeaderboardPageContent';
import { LegacyLeaderboardPage } from './legacy/LegacyLeaderboardPage';
import type { LeaderboardMetric, LeaderboardPeriod } from './LeaderboardTable';
import { useWideViewport } from './useWideViewport';
import { isSolarMetric, type SolarMetric } from './solarMetrics';
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
  const { user, hasPermission } = useAuth();
  // The board depends on who is signed in, not on every profile refresh.
  const uid = user?.uid ?? null;
  // Fiber, solar, or both (a dual rep, an admin): a solar-only rep has the
  // solar board alone, a fiber rep with no solar role never sees solar.
  const boards = boardsFor({ solarRead: hasPermission('solar:read'), solarOnly: isSolarOnlyUser(user) });
  // A viewer with both boards reopens on the side they last picked (stored on
  // this device; Fiber when there is none or storage is blocked). A viewer
  // with one board never reads it: `boards` alone decides.
  const [picked, setPicked] = useRememberedSide(BOARD_SIDE_KEY);
  const board: LeaderboardBoard = boards.includes(picked) ? picked : boards[0];
  const solar = board === 'solar';
  // Seeded with the board fetched first below (week, points or booked, team), so a revisit paints it at once.
  const { leaderboard, currentUser, unranked, recent, firstMonth, loading, error, staleAt, fetchLeaderboard } =
    useLeaderboard(solar ? FIRST_SOLAR_BOARD : FIRST_BOARD);
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [fiberMetric, setFiberMetric] = useState<LeaderboardMetric>('totalPoints');
  // Set | Demoed | Closed on the solar board (Set first); each board keeps its own pick for the way back.
  const [solarMetric, setSolarMetric] = useState<SolarMetric>('bookedConsults');
  const metric: LeaderboardMetric = solar ? solarMetric : fiberMetric;
  const setMetric = useCallback((next: LeaderboardMetric) => {
    if (isSolarMetric(next)) setSolarMetric(next);
    else setFiberMetric(next);
  }, []);
  // Only the solar board names its source: the fiber request stays as it was.
  const sourceOpt = useMemo(() => (solar ? { source: 'solar' as const } : {}), [solar]);
  const boardSwitch: BoardSwitch | null = boards.length > 1 ? { board, onChange: setPicked } : null;
  // The month board's month: null is this month (on the office clock, as the
  // server counts it). A past month stays picked across period taps.
  const [month, setMonth] = useState<MonthKey | null>(null);
  const wide = useWideViewport();

  const monthParam = period === 'month' && month ? formatMonthParam(month) : null;
  const pastMonth = monthParam ? month : null;

  useEffect(() => {
    if (uid) fetchLeaderboard(period, metric, 100, 'approved', { team: true, ...sourceOpt, ...(monthParam ? { month: monthParam } : {}) });
  }, [uid, period, metric, sourceOpt, monthParam, fetchLeaderboard]);

  // Reopened after a while: the same board, reloaded in place. A load already
  // under way (a filter tap) is left to land on its own.
  const refreshQuietly = useCallback(() => {
    if (!user || loading) return;
    return fetchLeaderboard(period, metric, 100, 'approved', { team: true, quiet: true, ...sourceOpt, ...(monthParam ? { month: monthParam } : {}) });
  }, [user, loading, period, metric, sourceOpt, monthParam, fetchLeaderboard]);
  useRefreshOnResume(refreshQuietly, { enabled: !!user });
  // Retry keeps a board that is showing (quiet: no skeleton); only an empty
  // screen goes back to its loading state.
  const hasBoard = leaderboard.length > 0;
  const retry = useCallback(() => {
    if (user) void fetchLeaderboard(period, metric, 100, 'approved', { team: true, quiet: hasBoard, ...sourceOpt, ...(monthParam ? { month: monthParam } : {}) });
  }, [user, period, metric, sourceOpt, monthParam, hasBoard, fetchLeaderboard]);

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
          boardSwitch={boardSwitch}
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
            onRetry={retry}
            boardSwitch={boardSwitch}
          />
        </div>
      </div>
    </>
  );
}
