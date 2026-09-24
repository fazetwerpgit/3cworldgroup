'use client';

import { AdminGate } from '@/components/portal/admin-d/AdminUi';
import { EmployeeDataManager } from '@/components/employee-data/EmployeeDataManager';

// Owner only: exports every active user's info (full SSN and DL#) and fills
// empty profile fields (and encrypted SSN / DL#) from the employee spreadsheet.
export default function EmployeeDataPage() {
  return (
    <AdminGate roles={['owner']}>
      <EmployeeDataManager />
    </AdminGate>
  );
}
