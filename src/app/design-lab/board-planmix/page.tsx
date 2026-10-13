'use client';
import '@/styles/sweep-rep-b.css';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LeaderboardPageContent } from '@/components/leaderboard/LeaderboardPageContent';
import type { LeaderboardEntry, LeaderboardMetric, LeaderboardPeriod } from '@/components/leaderboard/LeaderboardTable';
import type { PlanMixEntry } from '@/lib/sales/planMix';
import s from '@/components/portal/rep/rep.module.css';
import split from '@/components/leaderboard/routeSplit.module.css';

// Dev-only harness: the phone leaderboard (podium + rows) on mock data, to
// measure the plan-mix line. ?data=worst|typical &metric=pts|sales
// &period=week|month. It renders the phone page at every width, 1440 included
// (the live route shows the legacy board, which has no plan mix, from 1024 up).
const WORST: PlanMixEntry[] = [
  { tier: '1 Gig', count: 23 },
  { tier: '2 Gig', count: 14 },
  { tier: '500', count: 9 },
  { tier: '300', count: 6 },
];
const WORST_5: PlanMixEntry[] = [
  { tier: '1 Gig', count: 23 },
  { tier: '2 Gig', count: 14 },
  { tier: '5 Gig', count: 11 },
  { tier: '500', count: 9 },
  { tier: '300', count: 6 },
];
const TYPICAL: PlanMixEntry[] = [
  { tier: '1 Gig', count: 9 },
  { tier: '2 Gig', count: 2 },
  { tier: '300', count: 1 },
];

const worstNames = [
  'Benjamin Thompson-Rodriguez',
  'Alexandria Montgomery-Wells',
  'Christopher Vanderbilt-Hayes',
  'Maximilian Castellanos',
  'Benjamin Thompson-Rodriguez',
  'Jacqueline Fitzgerald-Moore',
  'Bartholomew Washington',
  'Evangeline Rutherford-Kim',
  'Benjamin Thompson-Rodriguez',
  'Nathaniel Abernathy-Cruz',
];
const typicalNames = ['Tyler Brooks', 'Jordan Kim', 'Marcus Reed', 'Aisha Grant', 'Devon Castellano', 'Priya Nair', 'Sam Whitfield', 'Leo Okafor', 'Nina Alvarez', 'Chris Brennan'];

function mock(kind: string): LeaderboardEntry[] {
  const worst = kind !== 'typical';
  const names = worst ? worstNames : typicalNames;
  return names.map((name, i) => ({
    rank: i + 1,
    salesRepId: `r${i}`,
    salesRepName: name,
    totalPoints: worst ? 9876 - i * 431 : 480 - i * 37,
    totalSales: worst ? 52 - i * 2 : 12 - i,
    planMix: worst ? (i % 3 === 1 ? WORST_5 : WORST) : TYPICAL,
  }));
}

function Harness() {
  const q = useSearchParams();
  const entries = mock(q.get('data') ?? 'worst');
  const metric: LeaderboardMetric = q.get('metric') === 'sales' ? 'totalSales' : 'totalPoints';
  const period: LeaderboardPeriod = q.get('period') === 'month' ? 'month' : 'week';
  const me = Number(q.get('me') ?? 5);
  const currentUser = me > 0 ? entries[me - 1] : null;
  const noop = () => {};

  return (
    <div className={s.root} data-shell="rep">
      <header className={s.topbar}>
        <div className={s.topbarInner}>Harness</div>
      </header>
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <div className={split.phoneOnly} style={{ display: 'contents' }}>
            <LeaderboardPageContent
              entries={entries}
              currentUser={currentUser}
              viewer={{ uid: currentUser?.salesRepId ?? 'viewer', displayName: currentUser?.salesRepName ?? 'Viewer' }}
              unranked={[]}
              recent={[]}
              loading={false}
              error={null}
              period={period}
              metric={metric}
              onPeriodChange={noop}
              onMetricChange={noop}
            />
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
