'use client';

import { Suspense, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { AdminSkeletonRows } from '@/components/portal/admin-d/AdminUi';
import { REQUESTS_HUB } from '@/components/portal/admin-d/adminHubs';
import { useOpsQueues } from '@/components/portal/admin-d/opsQueues';
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
  const type = useSearchParams().get('type');
  const { cards, refresh } = useOpsQueues();

  // Open items per type (the nav badge's figures), reloaded on each switch so
  // a handled item drops off. The first render uses whatever is cached.
  const shownType = useRef(type);
  useEffect(() => {
    if (shownType.current === type) return;
    shownType.current = type;
    refresh();
  }, [type, refresh]);

  const counts = Object.fromEntries(
    (cards ?? [])
      .filter((card) => card.hub === REQUESTS_HUB.href && !card.error)
      .map((card) => [card.key, card.count])
  );

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
