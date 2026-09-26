'use client';
import '@/styles/sweep-rep-b.css';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { LeaderboardPageContent } from '@/components/leaderboard/LeaderboardPageContent';
import { LegacyLeaderboardPage } from '@/components/leaderboard/legacy/LegacyLeaderboardPage';
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from '@/components/leaderboard/LeaderboardTable';
import s from '@/components/portal/rep/rep.module.css';
import split from '@/components/leaderboard/routeSplit.module.css';
import { useWideViewport } from '@/components/leaderboard/useWideViewport';

// Temporary harness (untracked, never committed): leaderboard on mock data.
const names = ['Tyler Brooks', 'Jordan Kim', 'Marcus Reed', 'Aisha Grant', 'Devon Castellano', 'Priya Nair', 'Sam Whitfield', 'Leo Okafor', 'Nina Alvarez', 'Chris Brennan', 'Ray Holt', 'Ana Silva'];
const mock: LeaderboardEntry[] = names.map((name, i) => ({
  rank: i + 1,
  salesRepId: `r${i}`,
  salesRepName: name,
  totalPoints: 1480 - i * 97 - (i % 3) * 11,
  totalSales: 18 - i,
  movement: [2, -1, 0, 3, null, -2, 1, 0, -1, 4, 0, null][i],
  spark: [[5, 4, 4, 3, 2, 1, 1], [3, 3, 2, 2, 2, 2, 2], [4, 5, 6, 5, 4, 3, 3], [9, 8, 7, 6, 5, 5, 4], [null, null, 8, 7, 6, 5, 5], [4, 4, 5, 5, 6, 6, 6], [8, 8, 8, 8, 8, 8, 7], [7, 7, 8, 8, 8, 8, 8], [6, 7, 7, 8, 9, 9, 9], [12, 12, 11, 11, 10, 10, 10], [10, 10, 10, 10, 11, 11, 11], [null, null, null, null, null, 12, 12]][i],
  streakDays: [5, 0, 3, 0, 2, 0, 0, 4, 0, 0, 0, 0][i],
}));

const zeroNames = ['Ada Lovelace', 'Ben Carter', 'Cole Mitchell-Harrington', 'Dana Ortiz', 'Eli Park', 'Faith Morgan'];
const recentMock = [
  { repName: 'Tyler Brooks', plan: '2 Gig', min: 12 },
  { repName: 'Devon Castellano', plan: '1 Gig +1', min: 47 },
  { repName: 'Jordan Kim', plan: 'Fiber 500', min: 180 },
  { repName: 'Marcus Reed', plan: '5 Gig', min: 60 * 26, dayOnly: true },
  { repName: 'Aisha Grant', plan: '1 Gig', min: 60 * 50 },
];

function Harness() {
  const q = useSearchParams();
  const state = q.get('state');
  const me = Number(q.get('me') ?? 5);
  const n = Number(q.get('n') ?? mock.length);
  const [period, setPeriod] = useState<LeaderboardPeriod>('week');
  const [metric, setMetric] = useState<LeaderboardMetric>('totalPoints');
  const entries = state === 'empty' ? [] : mock.slice(0, n);
  const currentUser = state === 'empty' ? null : me > 0 ? { ...mock[me - 1], salesRepId: `r${me - 1}` } : null;
  const loading = state === 'loading';
  const viewerId = me > 0 ? `r${me - 1}` : 'viewer';
  const unranked = q.get('zeros') === '0' ? [] : zeroNames.map((name, i) => ({ salesRepId: i === 0 ? 'viewer' : `z${i}`, salesRepName: name })).filter((rep) => me === 0 || rep.salesRepId !== 'viewer');
  const [now] = useState(() => Date.now());
  const recent = q.get('recent') === '0' ? [] : recentMock.map(({ min, ...sale }) => ({ ...sale, at: new Date(now - min * 60_000).toISOString() }));
  const wide = useWideViewport();
  const common = { entries, currentUser, unranked, recent, loading, error: state === 'error' ? 'Could not load the leaderboard.' : null, period, metric, onPeriodChange: setPeriod, onMetricChange: setMetric };

  return (
    <div className={s.root} data-shell="rep">
      <header className={s.topbar}>
        <div className={s.topbarInner}>Harness</div>
      </header>
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <div className={split.phoneOnly}>
            <LeaderboardPageContent {...common} active={!wide} viewer={{ uid: viewerId, displayName: 'Ada Lovelace' }} />
          </div>
          <div className={split.desktopOnly}>
            <div className="dark"><div className="portal-scope contents"><LegacyLeaderboardPage {...common} active={wide} viewerName="Ada Lovelace" viewerId={viewerId} /></div></div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <Harness />
    </Suspense>
  );
}
