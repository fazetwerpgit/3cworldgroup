'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: the Resources hub (University progress, field tools, short
// videos, pay structure) sits on the rep shell.
export default function ResourcesLayout({ children }: { children: React.ReactNode }) {
  return <RepShell>{children}</RepShell>;
}
