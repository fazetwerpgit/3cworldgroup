'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: a University module page sits on the rep shell (top bar + phone
// tab bar) behind training:read. The module list itself is Learn's Training tab
// (/portal/training redirects there), so on phones the top bar's back link
// returns to it.
export default function TrainingLayout({ children }: { children: React.ReactNode }) {
  return (
    <RepShell
      permissions={['training:read']}
      task="Module"
      back={{ href: '/portal/learn?tab=training', label: 'Training' }}
    >
      {children}
    </RepShell>
  );
}
