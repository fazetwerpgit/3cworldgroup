'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: Settings sits on the rep shell (top bar + phone tab bar).
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <RepShell>{children}</RepShell>;
}
