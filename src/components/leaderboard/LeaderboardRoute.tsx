'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { LeaderboardPageContent } from './LeaderboardPageContent';
import { LegacyLeaderboardPage } from './legacy/LegacyLeaderboardPage';
import type { LeaderboardMetric, LeaderboardPeriod } from './LeaderboardTable';
import { useWideViewport } from './useWideViewport';
import split from './routeSplit.module.css';

/* Two leaderboards, one board.
 *
 *  A phone gets the redesign; 1024px and up gets the page as it shipped on
 *  master. The period, the metric and the fetch live here so that both sides
 *  read the same board and only one request goes out, whichever is on screen.
 *  The filter controls in each page write back through the callbacks. */
export function LeaderboardRoute() {
  const { user } = useAuth();
  const { leaderboard, currentUser, unranked, recent, loading, error, fetchLeaderboard } = useLeaderboard();
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [metric, setMetric] = useState<LeaderboardMetric>('totalPoints');
  const wide = useWideViewport();

  useEffect(() => {
    if (user) fetchLeaderboard(period, metric, 100, 'approved', { team: true });
  }, [user, period, metric, fetchLeaderboard]);

  // Reopened after a while: the same board, reloaded in place. A load already
  // under way (a filter tap) is left to land on its own.
  const refreshQuietly = useCallback(() => {
    if (user && !loading) void fetchLeaderboard(period, metric, 100, 'approved', { team: true, quiet: true });
  }, [user, loading, period, metric, fetchLeaderboard]);
  useRefreshOnResume(refreshQuietly, { enabled: !!user });

  const busy = loading || !user;

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
          period={period}
          metric={metric}
          onPeriodChange={setPeriod}
          onMetricChange={setMetric}
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
