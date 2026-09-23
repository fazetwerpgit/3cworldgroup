'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: University and its lesson pages sit on the rep shell (top bar +
// phone tab bar). The training:read gate that each page carried lives here now.
export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return <RepShell permissions={['training:read']}>{children}</RepShell>;
}
