'use client';

import { RepShell } from '@/components/portal/rep/RepShell';
import { AdminFrame } from '@/components/portal/admin-d/AdminFrame';

// Direction D: every /portal/admin page sits on the rep shell (top bar + phone
// tab bar). AdminFrame adds the admin section nav: a sticky rail on desktop, a
// page switcher on phones. Each page keeps its own ProtectedRoute role gate.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RepShell>
      <AdminFrame>{children}</AdminFrame>
    </RepShell>
  );
}
