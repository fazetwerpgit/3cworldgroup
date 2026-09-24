'use client';

import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import { Invites } from './Invites';
import { Pipeline } from './Pipeline';
import { Review } from './Review';

// Onboarding: Review (the default), Invites (recruiting) and Pipeline, each
// under its old gate, so a manager sees only Invites. /portal/admin/recruiting
// and /pipeline redirect to their tab (next.config.ts).
export default function OnboardingPage() {
  return (
    <AdminHub
      hub={ONBOARDING_HUB}
      title="Onboarding"
      panels={{
        review: () => <Review />,
        invites: () => <Invites />,
        pipeline: () => <Pipeline />,
      }}
    />
  );
}
