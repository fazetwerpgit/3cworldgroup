'use client';

import { usePathname } from 'next/navigation';
import { RepShell } from '@/components/portal/rep/RepShell';

const UNIVERSITY_HREF = '/portal/training';

// Direction D: University and its lesson pages sit on the rep shell (top bar +
// phone tab bar). The training:read gate that each page carried lives here now.
// A module page is a task page: on phones the top bar's back link returns to University.
export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  const isModule = usePathname().startsWith(`${UNIVERSITY_HREF}/`);

  return (
    <RepShell
      permissions={['training:read']}
      task={isModule ? 'Module' : undefined}
      back={isModule ? { href: UNIVERSITY_HREF, label: 'University' } : undefined}
    >
      {children}
    </RepShell>
  );
}
