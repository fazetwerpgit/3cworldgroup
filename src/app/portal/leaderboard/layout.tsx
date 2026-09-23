'use client';

import { RepShell } from '@/components/portal/rep/RepShell';

// Direction D: the leaderboard sits on the rep shell (top bar + phone tab bar),
// like the dashboard. The board inside keeps its own phone and desktop designs.
export default function LeaderboardLayout({ children }: { children: React.ReactNode }) {
  return <RepShell permissions={['leaderboard:read']}>{children}</RepShell>;
}
