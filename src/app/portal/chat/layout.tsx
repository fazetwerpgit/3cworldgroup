'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: Team Chat sits on the rep shell (top bar + phone tab bar). An open
// phone conversation swaps the tab bar for its composer (see MobileThread).
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <RepShell permissions={['chat:read']}>{children}</RepShell>;
}
