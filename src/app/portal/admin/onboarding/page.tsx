'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import { useHubTabCounts, useOpsQueues } from '@/components/portal/admin-d/opsQueues';
import { Invites } from './Invites';
import { Pipeline } from './Pipeline';
import { Review } from './Review';

// Onboarding: Review, Invites (recruiting) and Pipeline, each under its old
// gate, so a manager sees only Invites. Each tab shows its own open items (they
// add up to the nav badge) and a bare visit opens the first tab that has any.
// /portal/admin/recruiting and /pipeline redirect to their tab (next.config.ts).
function Onboarding() {
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
      title="Onboarding"
      counts={counts}
      landOnWork
      panels={{
        review: () => <Review onChanged={refresh} />,
        invites: () => <Invites onChanged={refresh} />,
        pipeline: () => <Pipeline />,
      }}
    />
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<AdminSkeletonRows rows={3} />}>
      <Onboarding />
    </Suspense>
  );
}
