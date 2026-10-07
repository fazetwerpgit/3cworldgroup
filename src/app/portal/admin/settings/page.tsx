'use client';

import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { AdminGate } from '@/components/portal/admin-d/AdminUi';
import { SETTINGS_HUB } from '@/components/portal/admin-d/adminHubs';
import { EmployeeDataManager } from '@/components/employee-data/EmployeeDataManager';
import { KnowledgeManager } from '@/components/knowledge/KnowledgeManager';
import { ChatChannels } from './ChatChannels';
import { EmailTemplates } from './EmailTemplates';
import { FormOptions } from './FormOptions';
import { PayRates } from './PayRates';
import { SystemSettings } from './SystemSettings';
import { UniversityContent } from './UniversityContent';

// Admin settings: System, Form options, Chat channels, Email templates, University
// content, and the owner's Pay rates, Employee data and Ask 3C, each under its old
// gate. /portal/admin/form-options and the other old URLs redirect to their tab
// (next.config.ts); People's old ?tab=employee-data / knowledge links land here.
export default function SettingsPage() {
  return (
    <AdminHub
      hub={SETTINGS_HUB}
      title="Admin settings"
      panels={{
        system: () => <SystemSettings />,
        'form-options': () => <FormOptions />,
        'chat-channels': () => <ChatChannels />,
        'email-templates': () => <EmailTemplates />,
        university: () => <UniversityContent />,
        'pay-rates': () => <PayRates />,
        // Owner only: exports every active user's info (full SSN and DL#) and
        // fills empty profile fields from the employee spreadsheet.
        'employee-data': () => (
          <AdminGate roles={['owner']}>
            <EmployeeDataManager />
          </AdminGate>
        ),
        // Owner only: the notes Ask 3C answers from, and what reps asked.
        ask: () => (
          <AdminGate roles={['owner']}>
            <KnowledgeManager />
          </AdminGate>
        ),
      }}
    />
  );
}
