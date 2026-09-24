'use client';

import { AdminHub } from '@/components/portal/admin-d/AdminHub';
import { SETTINGS_HUB } from '@/components/portal/admin-d/adminHubs';
import { ChatChannels } from './ChatChannels';
import { EmailTemplates } from './EmailTemplates';
import { FormOptions } from './FormOptions';
import { SystemSettings } from './SystemSettings';
import { UniversityContent } from './UniversityContent';

// Admin settings: System, Form options, Chat channels, Email templates, University
// content, each under its old gate. /portal/admin/form-options and the other
// old URLs redirect to their tab (next.config.ts).
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
      }}
    />
  );
}
