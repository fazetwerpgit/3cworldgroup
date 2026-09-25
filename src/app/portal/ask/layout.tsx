'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: Ask 3C sits on the rep shell (top bar + phone tab bar).
export default function AskLayout({ children }: { children: React.ReactNode }) {
  return <RepShell>{children}</RepShell>;
}
