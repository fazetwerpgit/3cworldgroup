'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: team calls sit on the rep shell (top bar + phone tab bar).
export default function CallsLayout({ children }: { children: React.ReactNode }) {
  return <RepShell>{children}</RepShell>;
}
