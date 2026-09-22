import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LeaderboardRoute } from '@/components/leaderboard/LeaderboardRoute';
import { PortalHeader } from '@/components/portal/PortalHeader';
import { PortalSidebar } from '@/components/portal/PortalSidebar';
import split from '@/components/leaderboard/routeSplit.module.css';
import '@/styles/sweep-rep-b.css';

export default function LeaderboardPage() {
  return (
    <ProtectedRoute permissions={['leaderboard:read']}>
      <div className={`min-h-screen ${split.ground}`}>
        <PortalHeader />
        <div className="flex">
          <PortalSidebar />
          {/* Both leaderboards render inside this one main; the route picks
              which. The scroller and the ground colour come with the desktop
              half, so they are switched at the same breakpoint. */}
          <main className={`portal-main-offset relative flex-1 ${split.main}`}>
            <LeaderboardRoute />
          </main>
        </div>
      </div>
    </ProtectedRoute>
  );
}
