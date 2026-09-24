'use client';

import { AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { EmployeeExportPanel } from './EmployeeExportPanel';
import { EmployeeImportManager } from './EmployeeImportManager';

/** The owner's Employee data page: export everyone's info, import the employee sheet. Its page wraps it in the owner gate. */
export function EmployeeDataManager() {
  return (
    <div className={u.page}>
      <AdminPageHead
        title="Employee data"
        sub="Export everyone's info for drug and background checks, or fill empty profile fields from the employee spreadsheet."
      />
      <EmployeeExportPanel />
      <EmployeeImportManager />
    </div>
  );
}
