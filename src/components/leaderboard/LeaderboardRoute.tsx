'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLeaderboard } from '@/hooks/useLeaderboard';
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
  const { leaderboard, currentUser, loading, error, fetchLeaderboard } = useLeaderboard();
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [metric, setMetric] = useState<LeaderboardMetric>('totalPoints');
  const wide = useWideViewport();

  useEffect(() => {
    if (user) fetchLeaderboard(period, metric, 100);
  }, [user, period, metric, fetchLeaderboard]);

  const busy = loading || !user;

  return (
    <>
      <div className={split.phoneOnly}>
        <LeaderboardPageContent
          entries={leaderboard}
          currentUser={currentUser}
          viewer={user ? { uid: user.uid, displayName: user.displayName, avatarUrl: user.avatarUrl } : null}
          loading={busy}
          error={error}
          period={period}
          metric={metric}
          onPeriodChange={setPeriod}
          onMetricChange={setMetric}
          active={!wide}
        />
      </div>
      <div className={split.desktopOnly}>
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
        />
      </div>
    </>
  );
}
