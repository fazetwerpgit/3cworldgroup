'use client';

import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { AdminGate } from '@/components/portal/admin-d/AdminUi';
import { PEOPLE_HUB } from '@/components/portal/admin-d/adminHubs';
import { EmployeeDataManager } from '@/components/employee-data/EmployeeDataManager';
import { useAuth } from '@/contexts/AuthContext';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { Everyone } from './Everyone';

// People: Everyone (user management) and the owner's Employee data.
// /portal/admin/users and /employee-data redirect to their tab (next.config.ts).
export default function PeoplePage() {
  const { isRole } = useAuth();
  const pendingSignups = usePendingSignupsCount(isRole('admin'));

  return (
    <AdminHub
      hub={PEOPLE_HUB}
      title="People"
      counts={{ everyone: pendingSignups || undefined }}
      panels={{
        everyone: () => <Everyone />,
        // Owner only: exports every active user's info (full SSN and DL#) and
        // fills empty profile fields from the employee spreadsheet.
        'employee-data': () => (
          <AdminGate roles={['owner']}>
            <EmployeeDataManager />
          </AdminGate>
        ),
      }}
    />
  );
}
