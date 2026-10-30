'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import { useHubTabCounts, useOpsQueues } from '@/components/portal/admin-d/opsQueues';
import { People } from './People';
import { Todo } from './Todo';

// Hiring: To do (everything waiting on the owner) and People (everyone from
// website application to selling, one row per person), so a field manager
// sees only People. Only To do carries a count: the things waiting on you, the
// same figure as the Hiring nav badge (opsQueues). Old tab keys (review,
// recruits, invites, applicants, pipeline) redirect via
// ONBOARDING_HUB.aliases; /portal/admin/recruiting and /pipeline redirect to
// their old tab (next.config.ts) and on from there.
function Hiring() {
  const tab = useSearchParams().get(ONBOARDING_HUB.param);
  const { refresh } = useOpsQueues();
  const counts = useHubTabCounts(ONBOARDING_HUB);

  // Open items per tab (the nav badge's figures), reloaded on each switch and
  // after each review or invite action so a handled item drops off. The first
  // render uses whatever is cached.
  const shownTab = useRef(tab);
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    refresh();
  }, [tab, refresh]);

  return (
    <AdminHub
      hub={ONBOARDING_HUB}
      title="Hiring"
      counts={counts}
      landOnWork
      panels={{
        todo: () => <Todo onChanged={refresh} />,
        people: () => <People onChanged={refresh} />,
      }}
    />
  );
}

export default function HiringPage() {
  return (
    <Suspense fallback={<AdminSkeletonRows rows={3} />}>
      <Hiring />
    </Suspense>
  );
}
