'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { PEOPLE_HUB, SETTINGS_HUB, hubTabHref } from '@/components/portal/admin-d/adminHubs';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { Everyone } from './Everyone';

/** People's old owner tabs, now under Admin settings. */
const MOVED_TO_SETTINGS: Record<string, string> = { 'employee-data': 'employee-data', knowledge: 'ask' };

// People: Everyone (user management). /portal/admin/users redirects here
// (next.config.ts); the owner's Employee data and Knowledge moved to Admin
// settings, and their old ?tab= links are sent there.
function People() {
  const router = useRouter();
  const moved = MOVED_TO_SETTINGS[useSearchParams().get(PEOPLE_HUB.param) ?? ''];
  const { isRole } = useAuth();
  const pendingSignups = usePendingSignupsCount(isRole('admin'));

  useEffect(() => {
    if (moved) router.replace(hubTabHref(SETTINGS_HUB, moved));
  }, [moved, router]);

  if (moved) return <AdminSkeletonRows rows={3} />;
  return (
    <AdminHub
      hub={PEOPLE_HUB}
      title="People"
      sub="Everyone with a portal account. Tap someone for their details, checklist and pipeline stage."
      counts={{ everyone: pendingSignups || undefined }}
      panels={{ everyone: () => <Everyone /> }}
    />
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<AdminSkeletonRows rows={3} />}>
      <People />
    </Suspense>
  );
}
