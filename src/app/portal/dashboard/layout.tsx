'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: the dashboard is the first page on the rep shell (top bar +
// phone tab bar). Every other portal page keeps PortalHeader + PortalSidebar.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <RepShell>{children}</RepShell>;
}
