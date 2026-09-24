'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { REQUEST_TABS, REQUESTS_HUB } from '@/components/portal/admin-d/adminHubs';
import { fetchOpenRequests } from '@/components/portal/admin-d/openRequests';
import { useAuth } from '@/contexts/AuthContext';
import { BugReports } from './BugReports';
import { ExpediteOrders } from './ExpediteOrders';
import { FiberReports } from './FiberReports';
import { LeadsRequests } from './LeadsRequests';
import { ManagerInterviews } from './ManagerInterviews';
import { PayrollDisputes } from './PayrollDisputes';

// Requests: one inbox over the six form queues, ?type= picks the queue. Each
// type renders its old review page unchanged; /portal/admin/payroll-disputes
// and the other old queue URLs redirect here (next.config.ts).
function Requests() {
  const { user, isRole } = useAuth();
  const type = useSearchParams().get('type');
  const canReview = isRole('admin', 'operations');
  const [counts, setCounts] = useState<Record<string, number | undefined>>({});

  // Open items per type, refreshed on each switch so a handled item drops off.
  useEffect(() => {
    if (!user || !canReview) return;
    let cancelled = false;
    void Promise.all(
      REQUEST_TABS.map(async (tab) => {
        try {
          return [tab.key, (await fetchOpenRequests(tab.form)).length] as const;
        } catch {
          return [tab.key, undefined] as const;
        }
      })
    ).then((entries) => {
      if (!cancelled) setCounts(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [user, canReview, type]);

  return (
    <AdminHub
      hub={REQUESTS_HUB}
      title="Requests"
      counts={counts}
      panels={{
        'payroll-disputes': () => <PayrollDisputes />,
        'expedite-orders': () => <ExpediteOrders />,
        'leads-requests': () => <LeadsRequests />,
        'fiber-reports': () => <FiberReports />,
        'manager-interviews': () => <ManagerInterviews />,
        'bug-reports': () => <BugReports />,
      }}
    />
  );
}

export default function RequestsPage() {
  return (
    <Suspense fallback={<AdminSkeletonRows rows={3} />}>
      <Requests />
    </Suspense>
  );
}
