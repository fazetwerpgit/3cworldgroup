'use client';

import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import { useHubTabCounts } from '@/components/portal/admin-d/opsQueues';
import { Invites } from './Invites';
import { Pipeline } from './Pipeline';
import { Review } from './Review';

// Onboarding: Review, Invites (recruiting) and Pipeline, each under its old
// gate, so a manager sees only Invites. Each tab shows its own open items (they
// add up to the nav badge) and a bare visit opens the first tab that has any.
// /portal/admin/recruiting and /pipeline redirect to their tab (next.config.ts).
export default function OnboardingPage() {
  const counts = useHubTabCounts(ONBOARDING_HUB);

  return (
    <AdminHub
      hub={ONBOARDING_HUB}
      title="Onboarding"
      counts={counts}
      landOnWork
      panels={{
        review: () => <Review />,
        invites: () => <Invites />,
        pipeline: () => <Pipeline />,
      }}
    />
  );
}
