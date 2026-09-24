'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: Learn (pay structure, field tools, and University training)
// sits on the rep shell. The Training tab carries its own training:read gate.
export default function LearnLayout({ children }: { children: React.ReactNode }) {
  return <RepShell>{children}</RepShell>;
}
