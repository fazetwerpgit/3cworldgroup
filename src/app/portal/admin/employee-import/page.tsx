'use client';

import { AdminGate } from '@/components/portal/admin-d/AdminUi';
import { EmployeeImportManager } from '@/components/employee-import/EmployeeImportManager';

// Owner only: fills empty profile fields (and encrypted SSN / DL#) for active
// users from the employee spreadsheet.
export default function EmployeeImportPage() {
  return (
    <AdminGate roles={['owner']}>
      <EmployeeImportManager />
    </AdminGate>
  );
}
